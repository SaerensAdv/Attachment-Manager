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
