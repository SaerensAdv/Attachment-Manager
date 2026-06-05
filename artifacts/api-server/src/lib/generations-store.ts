import {
  db,
  generationsTable,
  generationStepsTable,
  type Generation,
  type GenerationStep,
  type InsertGeneration,
  type InsertGenerationStep,
} from "@workspace/db";
import { asc, desc, eq } from "drizzle-orm";

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
  const all = await db.select().from(generationsTable);
  const led = all.filter((g) => g.leadAgentPath === agentPath);
  const participated = all.filter((g) => agentInRun(g, agentPath));

  const approved = led.filter((g) => g.feedbackVerdict === "approved").length;
  const rejected = led.filter((g) => g.feedbackVerdict === "rejected").length;
  const pending = led.length - approved - rejected;

  const lastActiveAt = participated.reduce<Date | null>(
    (max, g) => (!max || g.createdAt > max ? g.createdAt : max),
    null,
  );

  const steps = await db
    .select()
    .from(generationStepsTable)
    .where(eq(generationStepsTable.agentPath, agentPath));
  const durations = steps
    .map((s) => s.durationMs)
    .filter((n): n is number => typeof n === "number");
  const avgDurationMs = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;
  const totalOutputTokens = steps.reduce(
    (a, s) => a + (s.outputTokens ?? 0),
    0,
  );

  return {
    agentPath,
    runsLed: led.length,
    runsParticipated: participated.length,
    approved,
    rejected,
    pending,
    lastActiveAt: lastActiveAt ? lastActiveAt.toISOString() : null,
    avgDurationMs,
    totalOutputTokens,
    stepCount: steps.length,
  };
}

/** One agent's row in the team leaderboard. */
export interface AgentLeaderboardEntry {
  agentPath: string;
  runsLed: number;
  runsParticipated: number;
  totalOutputTokens: number;
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
  const [runs, steps] = await Promise.all([
    db.select().from(generationsTable),
    db.select().from(generationStepsTable),
  ]);

  const completed = runs.filter((g) => g.status === "completed").length;
  const partial = runs.filter((g) => g.status === "partial").length;
  const approved = runs.filter((g) => g.feedbackVerdict === "approved").length;
  const rejected = runs.filter((g) => g.feedbackVerdict === "rejected").length;
  const pending = runs.length - approved - rejected;
  const totalTokens = runs.reduce((a, g) => a + (g.totalTokens ?? 0), 0);
  const runDurations = runs
    .map((g) => g.durationMs)
    .filter((n): n is number => typeof n === "number");
  const avgDurationMs = runDurations.length
    ? Math.round(runDurations.reduce((a, b) => a + b, 0) / runDurations.length)
    : null;

  // Build the leaderboard keyed by agent path. runsLed/runsParticipated and
  // last-active come from the run rows; tokens/duration from the agent's own
  // step rows (the only true per-agent measurement), excluding the deliverable.
  const board = new Map<string, AgentLeaderboardEntry & { _durations: number[] }>();
  const ensure = (agentPath: string) => {
    let e = board.get(agentPath);
    if (!e) {
      e = {
        agentPath,
        runsLed: 0,
        runsParticipated: 0,
        totalOutputTokens: 0,
        avgDurationMs: null,
        lastActiveAt: null,
        _durations: [],
      };
      board.set(agentPath, e);
    }
    return e;
  };

  for (const g of runs) {
    const members = new Set<string>();
    if (g.leadAgentPath) members.add(g.leadAgentPath);
    try {
      const arr = JSON.parse(g.teamPaths);
      if (Array.isArray(arr))
        for (const p of arr) if (typeof p === "string") members.add(p);
    } catch {
      /* tolerate bad data */
    }
    for (const p of members) {
      if (!p.startsWith("agents/")) continue;
      const e = ensure(p);
      e.runsParticipated += 1;
      if (g.leadAgentPath === p) e.runsLed += 1;
      const at = g.createdAt.toISOString();
      if (!e.lastActiveAt || at > e.lastActiveAt) e.lastActiveAt = at;
    }
  }

  for (const s of steps) {
    if (s.role === "deliverable") continue;
    if (!s.agentPath.startsWith("agents/")) continue;
    const e = ensure(s.agentPath);
    e.totalOutputTokens += s.outputTokens ?? 0;
    if (typeof s.durationMs === "number") e._durations.push(s.durationMs);
  }

  const leaderboard: AgentLeaderboardEntry[] = [...board.values()]
    .map(({ _durations, ...rest }) => ({
      ...rest,
      avgDurationMs: _durations.length
        ? Math.round(_durations.reduce((a, b) => a + b, 0) / _durations.length)
        : null,
    }))
    .sort((a, b) => b.runsParticipated - a.runsParticipated);

  return {
    totalRuns: runs.length,
    completed,
    partial,
    approved,
    rejected,
    pending,
    totalTokens,
    avgDurationMs,
    leaderboard,
  };
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

/** Delete a generation. Returns true when a row was removed. */
export async function deleteGeneration(id: number): Promise<boolean> {
  const [row] = await db
    .delete(generationsTable)
    .where(eq(generationsTable.id, id))
    .returning();
  return Boolean(row);
}
