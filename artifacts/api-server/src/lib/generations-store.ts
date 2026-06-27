import {
  db,
  generationsTable,
  generationStepsTable,
  type Generation,
  type GenerationStep,
  type InsertGeneration,
  type InsertGenerationStep,
} from "@workspace/db";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { estimateCostEur } from "./model-pricing";

/** Coerce a SQL aggregate value (node-postgres returns bigint/numeric as text) to a number. */
function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Coerce a SQL AVG result to a rounded integer, preserving null when there were no rows to average. */
function toRoundedOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Coerce a SQL timestamp result (Date or text) to an ISO string, or null. */
function toIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Persist a finished generation. Returns the stored row. */
export async function saveGeneration(
  input: InsertGeneration,
): Promise<Generation> {
  const [row] = await db.insert(generationsTable).values(input).returning();
  return row;
}

/** Persist the per-step audit trail for a generation. Best-effort no-op when empty. */
export async function saveGenerationSteps(
  steps: InsertGenerationStep[],
): Promise<void> {
  if (steps.length === 0) return;
  await db.insert(generationStepsTable).values(steps);
}

/** The ordered steps (audit trail) of one generation. */
export async function listGenerationSteps(
  generationId: number,
): Promise<GenerationStep[]> {
  return db
    .select()
    .from(generationStepsTable)
    .where(eq(generationStepsTable.generationId, generationId))
    .orderBy(asc(generationStepsTable.stepOrder));
}

/** Whether an agent took part in a run (as lead or any team member). */
function agentInRun(g: Generation, agentPath: string): boolean {
  if (g.leadAgentPath === agentPath) return true;
  try {
    const arr = JSON.parse(g.teamPaths);
    return Array.isArray(arr) && arr.includes(agentPath);
  } catch {
    return false;
  }
}

/** Aggregate KPIs for a single agent, derived from the archive + step trail. */
export interface AgentStats {
  agentPath: string;
  runsLed: number;
  runsParticipated: number;
  approved: number;
  rejected: number;
  pending: number;
  lastActiveAt: string | null;
  avgDurationMs: number | null;
  totalOutputTokens: number;
  stepCount: number;
}

/**
 * Compute an agent's KPIs. Approval counts are scoped to runs the agent *led*
 * (the lead is accountable for the verdict); participation and last-active span
 * any run the agent was part of. Timing/token figures come from the per-agent
 * step rows, which are the only source of true per-agent measurement.
 */
export async function getAgentStats(agentPath: string): Promise<AgentStats> {
  // "Participated" = led the run OR is listed in the run's team_paths JSON array.
  // The `is json array` guard makes the jsonb cast safe against malformed data
  // (such a row simply can't match via the team branch), mirroring the JS
  // try/catch that previously tolerated bad JSON. The `?` operator tests whether
  // the agent path exists as an element of the JSON array.
  const led = eq(generationsTable.leadAgentPath, agentPath);
  const participates = sql`(${generationsTable.leadAgentPath} = ${agentPath} or (${generationsTable.teamPaths} is json array and ${generationsTable.teamPaths}::jsonb ? ${agentPath}))`;

  // Run-level KPIs in one aggregate pass. Approval counts are scoped to runs the
  // agent *led*; participation and last-active span any run it took part in.
  const [genAgg] = await db
    .select({
      runsLed: sql<number>`count(*) filter (where ${led})::int`,
      runsParticipated: sql<number>`count(*) filter (where ${participates})::int`,
      approved: sql<number>`count(*) filter (where ${led} and ${generationsTable.feedbackVerdict} = 'approved')::int`,
      rejected: sql<number>`count(*) filter (where ${led} and ${generationsTable.feedbackVerdict} = 'rejected')::int`,
      lastActiveAt: sql<Date | null>`max(${generationsTable.createdAt}) filter (where ${participates})`,
    })
    .from(generationsTable);

  // Timing/token figures come from the agent's own step rows (the only source of
  // true per-agent measurement). AVG ignores NULL durations, matching the prior
  // filter; we round in JS so half-values match Math.round exactly.
  const [stepAgg] = await db
    .select({
      avgDurationMs: sql<number | null>`avg(${generationStepsTable.durationMs})`,
      totalOutputTokens: sql<number>`coalesce(sum(${generationStepsTable.outputTokens}), 0)`,
      stepCount: sql<number>`count(*)::int`,
    })
    .from(generationStepsTable)
    .where(eq(generationStepsTable.agentPath, agentPath));

  const runsLed = toNum(genAgg?.runsLed);
  const approved = toNum(genAgg?.approved);
  const rejected = toNum(genAgg?.rejected);

  return {
    agentPath,
    runsLed,
    runsParticipated: toNum(genAgg?.runsParticipated),
    approved,
    rejected,
    pending: runsLed - approved - rejected,
    lastActiveAt: toIsoOrNull(genAgg?.lastActiveAt),
    avgDurationMs: toRoundedOrNull(stepAgg?.avgDurationMs),
    totalOutputTokens: toNum(stepAgg?.totalOutputTokens),
    stepCount: toNum(stepAgg?.stepCount),
  };
}

/** One agent's row in the team leaderboard. */
export interface AgentLeaderboardEntry {
  agentPath: string;
  runsLed: number;
  runsParticipated: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostEur: number;
  avgDurationMs: number | null;
  lastActiveAt: string | null;
}

/** Team-wide aggregate KPIs + a per-agent leaderboard. */
export interface TeamStats {
  totalRuns: number;
  completed: number;
  partial: number;
  approved: number;
  rejected: number;
  pending: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostEur: number;
  avgDurationMs: number | null;
  leaderboard: AgentLeaderboardEntry[];
}

/**
 * Aggregate KPIs across the whole team plus a per-agent leaderboard. Computed
 * from a single pass over the archive + step trail (no per-agent re-querying),
 * so it stays cheap as the team grows. The leaderboard only counts real agents
 * (the deliverable pseudo-step, keyed by a workflow path, is excluded so it
 * never shows up as an "agent").
 */
export async function getTeamStats(): Promise<TeamStats> {
  // Run-level KPIs in a single aggregate pass over the generations table.
  const [runAgg] = await db
    .select({
      totalRuns: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${generationsTable.status} = 'completed')::int`,
      partial: sql<number>`count(*) filter (where ${generationsTable.status} = 'partial')::int`,
      approved: sql<number>`count(*) filter (where ${generationsTable.feedbackVerdict} = 'approved')::int`,
      rejected: sql<number>`count(*) filter (where ${generationsTable.feedbackVerdict} = 'rejected')::int`,
      avgDurationMs: sql<number | null>`avg(${generationsTable.durationMs})`,
    })
    .from(generationsTable);

  // Token totals come from the step trail (the only place input/output are split
  // out). Includes every step — agent steps *and* the deliverable — because the
  // cost estimate must reflect all LLM usage, not just per-agent work.
  const [tokenAgg] = await db
    .select({
      totalInputTokens: sql<number>`coalesce(sum(${generationStepsTable.inputTokens}), 0)`,
      totalOutputTokens: sql<number>`coalesce(sum(${generationStepsTable.outputTokens}), 0)`,
    })
    .from(generationStepsTable);

  const totalRuns = toNum(runAgg?.totalRuns);
  const approved = toNum(runAgg?.approved);
  const rejected = toNum(runAgg?.rejected);
  const totalInputTokens = toNum(tokenAgg?.totalInputTokens);
  const totalOutputTokens = toNum(tokenAgg?.totalOutputTokens);

  const leaderboard = await getLeaderboard();

  return {
    totalRuns,
    completed: toNum(runAgg?.completed),
    partial: toNum(runAgg?.partial),
    approved,
    rejected,
    pending: totalRuns - approved - rejected,
    totalTokens: totalInputTokens + totalOutputTokens,
    totalInputTokens,
    totalOutputTokens,
    estimatedCostEur: estimateCostEur(totalInputTokens, totalOutputTokens),
    avgDurationMs: toRoundedOrNull(runAgg?.avgDurationMs),
    leaderboard,
  };
}

/**
 * Build the per-agent leaderboard via SQL aggregation. The membership CTE
 * expands each run into (lead) + (every team_paths element); the `is json array`
 * guard makes the jsonb cast safe against malformed data (mirroring the old
 * JS try/catch). Run-level counts use COUNT(DISTINCT) so an agent that is both
 * the lead and a listed team member is counted once for participation. The step
 * CTE aggregates tokens/duration from the agent's own steps (deliverable
 * pseudo-step excluded), and a FULL OUTER JOIN unions agents seen only in runs
 * with agents seen only in steps — exactly the union the previous in-memory map
 * built. Only real agents (paths under `agents/`) are included.
 */
async function getLeaderboard(): Promise<AgentLeaderboardEntry[]> {
  const result = await db.execute<{
    agent_path: string;
    runs_led: number;
    runs_participated: number;
    last_active_at: Date | string | null;
    total_input_tokens: number | string;
    total_output_tokens: number | string;
    avg_duration_ms: number | string | null;
  }>(sql`
    with membership as (
      select g.id as gen_id, g.lead_agent_path as agent_path, g.created_at, true as is_lead
      from ${generationsTable} g
      union
      select g.id as gen_id, elem as agent_path, g.created_at, false as is_lead
      from ${generationsTable} g,
        lateral jsonb_array_elements_text(
          case when g.team_paths is json array then g.team_paths::jsonb else '[]'::jsonb end
        ) as elem
    ),
    mem_agg as (
      select agent_path,
        count(distinct gen_id)::int as runs_participated,
        (count(distinct gen_id) filter (where is_lead))::int as runs_led,
        max(created_at) as last_active_at
      from membership
      where agent_path like 'agents/%'
      group by agent_path
    ),
    step_agg as (
      select agent_path,
        coalesce(sum(input_tokens), 0) as total_input_tokens,
        coalesce(sum(output_tokens), 0) as total_output_tokens,
        avg(duration_ms) as avg_duration_ms
      from ${generationStepsTable}
      where role <> 'deliverable' and agent_path like 'agents/%'
      group by agent_path
    )
    select
      coalesce(m.agent_path, s.agent_path) as agent_path,
      coalesce(m.runs_led, 0) as runs_led,
      coalesce(m.runs_participated, 0) as runs_participated,
      m.last_active_at,
      coalesce(s.total_input_tokens, 0) as total_input_tokens,
      coalesce(s.total_output_tokens, 0) as total_output_tokens,
      s.avg_duration_ms
    from mem_agg m
    full outer join step_agg s on m.agent_path = s.agent_path
    order by runs_participated desc, agent_path asc
  `);

  return result.rows.map((r) => {
    const totalInputTokens = toNum(r.total_input_tokens);
    const totalOutputTokens = toNum(r.total_output_tokens);
    return {
      agentPath: r.agent_path,
      runsLed: toNum(r.runs_led),
      runsParticipated: toNum(r.runs_participated),
      totalInputTokens,
      totalOutputTokens,
      estimatedCostEur: estimateCostEur(totalInputTokens, totalOutputTokens),
      avgDurationMs: toRoundedOrNull(r.avg_duration_ms),
      lastActiveAt: toIsoOrNull(r.last_active_at),
    };
  });
}

/** Recent runs an agent took part in (lead or member), newest first. */
export async function listAgentRuns(
  agentPath: string,
  limit = 20,
): Promise<Generation[]> {
  const all = await listGenerations();
  return all.filter((g) => agentInRun(g, agentPath)).slice(0, limit);
}

/** All generations, newest first. */
export async function listGenerations(): Promise<Generation[]> {
  return db
    .select()
    .from(generationsTable)
    .orderBy(desc(generationsTable.createdAt));
}

/**
 * Runs holding a client-facing deliverable that awaits human approval
 * (approval_status = 'pending'), newest first. Lightweight projection (no
 * finalMarkdown) for the "Te doen" overview; `pendingDelivery` is the held JSON
 * snapshot whose `kind` the overview parses tolerantly to label the item.
 */
export async function listPendingApprovals(): Promise<
  {
    id: number;
    clientName: string | null;
    workflowTitle: string;
    pendingDelivery: string | null;
    createdAt: Date;
  }[]
> {
  return db
    .select({
      id: generationsTable.id,
      clientName: generationsTable.clientName,
      workflowTitle: generationsTable.workflowTitle,
      pendingDelivery: generationsTable.pendingDelivery,
      createdAt: generationsTable.createdAt,
    })
    .from(generationsTable)
    .where(eq(generationsTable.approvalStatus, "pending"))
    .orderBy(desc(generationsTable.createdAt));
}

/** A single generation by id, or null. */
export async function getGeneration(id: number): Promise<Generation | null> {
  const [row] = await db
    .select()
    .from(generationsTable)
    .where(eq(generationsTable.id, id));
  return row ?? null;
}

/**
 * Record the human QA verdict on a generation. The user is the single quality
 * gate; this verdict (+ optional correction note) drives the learning loop.
 */
export async function updateGenerationFeedback(
  id: number,
  verdict: string,
  note: string | null,
): Promise<Generation | null> {
  const [row] = await db
    .update(generationsTable)
    .set({ feedbackVerdict: verdict, feedbackNote: note, feedbackAt: new Date() })
    .where(eq(generationsTable.id, id))
    .returning();
  return row ?? null;
}

/**
 * Resolve the human approval checkpoint on a held client-facing deliverable.
 * "approved" releases it (the caller sends after this succeeds); the optional
 * `clearPending` wipes the held snapshot so it can never be sent twice.
 * "changes_requested" holds it back; `note` is the reviewer's rework context.
 */
export async function setGenerationApproval(
  id: number,
  fields: { status: string; note?: string | null; clearPending?: boolean },
): Promise<Generation | null> {
  const set: Partial<InsertGeneration> = {
    approvalStatus: fields.status,
    approvalAt: new Date(),
  };
  if (fields.note !== undefined) set.approvalNote = fields.note;
  if (fields.clearPending) set.pendingDelivery = null;
  const [row] = await db
    .update(generationsTable)
    .set(set)
    .where(eq(generationsTable.id, id))
    .returning();
  return row ?? null;
}

/**
 * Atomically claim a held client-facing delivery for sending: flip
 * approval_status pending -> approved, but ONLY while it is still pending and a
 * held snapshot exists. A concurrent approver (a second tab/user) loses this
 * conditional update and gets null, which prevents the same email being sent
 * twice. The held snapshot is intentionally left intact here and cleared only
 * after the send succeeds; on a send failure the caller reverts to pending so
 * the draft stays retryable.
 */
export async function claimGenerationApprovalForSend(
  id: number,
): Promise<Generation | null> {
  const [row] = await db
    .update(generationsTable)
    .set({ approvalStatus: "approved", approvalAt: new Date() })
    .where(
      and(
        eq(generationsTable.id, id),
        eq(generationsTable.approvalStatus, "pending"),
        isNotNull(generationsTable.pendingDelivery),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Release a claim that could not be delivered: return the run to "pending" with
 * its held snapshot still in place, so the owner can retry the send. Used when a
 * claimed draft turns out to be unreadable or the send call fails.
 */
export async function revertGenerationApprovalToPending(
  id: number,
): Promise<void> {
  await db
    .update(generationsTable)
    .set({ approvalStatus: "pending", approvalAt: null })
    .where(eq(generationsTable.id, id));
}

/**
 * Append a single step to a generation's audit trail at the next free order,
 * used to record approval actions (sent / changes requested) after the run.
 */
export async function appendGenerationStep(
  generationId: number,
  step: Omit<InsertGenerationStep, "generationId" | "stepOrder">,
): Promise<void> {
  const existing = await listGenerationSteps(generationId);
  const nextOrder =
    existing.reduce((m, s) => Math.max(m, s.stepOrder), -1) + 1;
  await db
    .insert(generationStepsTable)
    .values({ ...step, generationId, stepOrder: nextOrder });
}

/** Delete a generation. Returns true when a row was removed. */
export async function deleteGeneration(id: number): Promise<boolean> {
  const [row] = await db
    .delete(generationsTable)
    .where(eq(generationsTable.id, id))
    .returning();
  return Boolean(row);
}
