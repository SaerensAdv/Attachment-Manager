import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  db,
  generationsTable,
  generationStepsTable,
  type Generation,
  type GenerationStep,
  type InsertGeneration,
  type InsertGenerationStep,
} from "@workspace/db";
import { inArray } from "drizzle-orm";
import { getAgentStats, getTeamStats } from "./generations-store";
import { estimateCostEur } from "./model-pricing";

/**
 * Parity tests for the SQL-backed KPI aggregation (Task: KPI-aggregatie naar
 * SQL). These run against the real database (DATABASE_URL): they insert an
 * isolated set of fixture runs/steps under unique, namespaced agent paths so the
 * per-agent assertions can be hand-computed and are unaffected by whatever else
 * lives in the dev database. The whole-team assertion compares the new SQL
 * implementation against an in-memory reference (the previous algorithm) over
 * the *same* full snapshot of the table — so it proves byte-for-byte parity
 * regardless of pre-existing rows.
 */

// Unique, namespaced paths so fixtures never collide with real data.
const A = "agents/__kpi_test_alpha__.md";
const B = "agents/__kpi_test_beta__.md";
const G = "agents/__kpi_test_gamma__.md";
const WF = "workflows/__kpi_test_wf__.md"; // non-agent lead (excluded from leaderboard)
const CLIENT = "clients/__kpi_test__.md";

// Distinct, ordered timestamps so "last active" is deterministic.
const t = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n));

const insertedIds: number[] = [];

function gen(overrides: Partial<InsertGeneration>): InsertGeneration {
  return {
    clientPath: CLIENT,
    clientName: "KPI Test",
    workflowPath: WF,
    workflowTitle: "KPI Test Workflow",
    leadAgentPath: A,
    leadAgentTitle: "Alpha",
    teamPaths: "[]",
    teamTitles: "[]",
    requestText: "kpi test",
    finalMarkdown: "# kpi test",
    ...overrides,
  };
}

async function insertGen(overrides: Partial<InsertGeneration>): Promise<number> {
  const [row] = await db
    .insert(generationsTable)
    .values(gen(overrides))
    .returning();
  insertedIds.push(row.id);
  return row.id;
}

async function insertSteps(
  generationId: number,
  steps: Array<Omit<InsertGenerationStep, "generationId">>,
): Promise<void> {
  await db
    .insert(generationStepsTable)
    .values(steps.map((s) => ({ ...s, generationId })));
}

beforeAll(async () => {
  // R1: A leads, B on team, completed + approved, duration 1000.
  const r1 = await insertGen({
    leadAgentPath: A,
    teamPaths: JSON.stringify([B]),
    status: "completed",
    feedbackVerdict: "approved",
    durationMs: 1000,
    createdAt: t(1),
  });
  await insertSteps(r1, [
    { agentPath: A, agentTitle: "Alpha", stepOrder: 0, role: "lead", status: "completed", durationMs: 100, inputTokens: 10, outputTokens: 5 },
    { agentPath: B, agentTitle: "Beta", stepOrder: 1, role: "member", status: "completed", durationMs: 200, inputTokens: 20, outputTokens: 8 },
    // Deliverable pseudo-step (workflow path) — must be EXCLUDED from per-agent rollups.
    { agentPath: WF, agentTitle: "Deliverable", stepOrder: 2, role: "deliverable", status: "completed", durationMs: 9999, inputTokens: 1000, outputTokens: 2000 },
  ]);

  // R2: A leads, B+G on team, partial + rejected, duration 3000.
  const r2 = await insertGen({
    leadAgentPath: A,
    teamPaths: JSON.stringify([B, G]),
    status: "partial",
    feedbackVerdict: "rejected",
    durationMs: 3000,
    createdAt: t(2),
  });
  await insertSteps(r2, [
    // A step with a NULL duration — must be ignored by the average, not counted as 0.
    { agentPath: A, agentTitle: "Alpha", stepOrder: 0, role: "lead", status: "completed", durationMs: null, inputTokens: 30, outputTokens: 7 },
    { agentPath: G, agentTitle: "Gamma", stepOrder: 1, role: "member", status: "completed", durationMs: 400, inputTokens: 40, outputTokens: 9 },
  ]);

  // R3: B leads, A on team, completed, no verdict (pending), no duration.
  const r3 = await insertGen({
    leadAgentPath: B,
    teamPaths: JSON.stringify([A]),
    status: "completed",
    feedbackVerdict: null,
    durationMs: null,
    createdAt: t(3),
  });
  await insertSteps(r3, [
    { agentPath: A, agentTitle: "Alpha", stepOrder: 0, role: "member", status: "completed", durationMs: 300, inputTokens: 15, outputTokens: 11 },
    { agentPath: B, agentTitle: "Beta", stepOrder: 1, role: "lead", status: "completed", durationMs: 600, inputTokens: 25, outputTokens: 13 },
  ]);

  // R4: A leads AND is listed on its own team — must be de-duplicated (counted once).
  const r4 = await insertGen({
    leadAgentPath: A,
    teamPaths: JSON.stringify([A, G]),
    status: "completed",
    feedbackVerdict: null,
    durationMs: 2000,
    createdAt: t(4),
  });

  // R5: non-agent lead (workflow path) — counts in team totals but never in the leaderboard.
  await insertGen({
    leadAgentPath: WF,
    leadAgentTitle: "WF",
    teamPaths: JSON.stringify([G]),
    status: "failed",
    feedbackVerdict: null,
    durationMs: null,
    createdAt: t(5),
  });

  // R6: malformed teamPaths JSON — the lead still counts; the broken team list is tolerated.
  await insertGen({
    leadAgentPath: B,
    teamPaths: "{not valid json",
    status: "completed",
    feedbackVerdict: "approved",
    durationMs: null,
    createdAt: t(6),
  });
});

afterAll(async () => {
  if (insertedIds.length > 0) {
    // Steps cascade-delete with their parent generation.
    await db
      .delete(generationsTable)
      .where(inArray(generationsTable.id, insertedIds));
  }
});

describe("getAgentStats (SQL)", () => {
  it("computes a lead agent's KPIs (participation, approvals, timing, tokens)", async () => {
    const s = await getAgentStats(A);
    // Led R1, R2, R4 → 3. Participated R1, R2, R4 (lead) + R3 (team) → 4 (R4 de-duped).
    expect(s.runsLed).toBe(3);
    expect(s.runsParticipated).toBe(4);
    // Approvals are scoped to runs A *led*: R1 approved, R2 rejected, R4 none.
    expect(s.approved).toBe(1);
    expect(s.rejected).toBe(1);
    expect(s.pending).toBe(1);
    // Most recent run A took part in is R4 @ t(4).
    expect(s.lastActiveAt).toBe(t(4).toISOString());
    // A's own steps: durations 100, null, 300 → avg of non-null = 200.
    expect(s.avgDurationMs).toBe(200);
    // Output tokens across A's steps: 5 + 7 + 11 = 23.
    expect(s.totalOutputTokens).toBe(23);
    // Three steps carry agent_path = A (role is not filtered here).
    expect(s.stepCount).toBe(3);
  });

  it("returns an empty, non-throwing result for an unknown agent", async () => {
    const s = await getAgentStats("agents/__kpi_test_nobody__.md");
    expect(s).toMatchObject({
      runsLed: 0,
      runsParticipated: 0,
      approved: 0,
      rejected: 0,
      pending: 0,
      lastActiveAt: null,
      avgDurationMs: null,
      totalOutputTokens: 0,
      stepCount: 0,
    });
  });

  it("counts a team-only agent without crediting it any leads", async () => {
    const s = await getAgentStats(G);
    // G is never the lead; it is on the team of R2, R4, R5.
    expect(s.runsLed).toBe(0);
    expect(s.runsParticipated).toBe(3);
    expect(s.approved).toBe(0);
    expect(s.rejected).toBe(0);
    expect(s.pending).toBe(0);
  });
});

describe("getTeamStats leaderboard (SQL)", () => {
  it("computes a fixture agent's leaderboard row, excluding the deliverable step", async () => {
    const { leaderboard } = await getTeamStats();
    const a = leaderboard.find((e) => e.agentPath === A);
    expect(a).toBeDefined();
    if (!a) return;
    expect(a.runsLed).toBe(3);
    expect(a.runsParticipated).toBe(4);
    // Input/output tokens from A's non-deliverable steps: in 10+30+15=55, out 5+7+11=23.
    expect(a.totalInputTokens).toBe(55);
    expect(a.totalOutputTokens).toBe(23);
    expect(a.estimatedCostEur).toBeCloseTo(estimateCostEur(55, 23), 10);
    // Avg of A's non-null step durations: (100 + 300) / 2 = 200.
    expect(a.avgDurationMs).toBe(200);
    expect(a.lastActiveAt).toBe(t(4).toISOString());
  });

  it("never lists a non-agent (workflow) path as a leaderboard entry", async () => {
    const { leaderboard } = await getTeamStats();
    expect(leaderboard.some((e) => e.agentPath === WF)).toBe(false);
  });

  it("orders the leaderboard by participation, descending", async () => {
    const { leaderboard } = await getTeamStats();
    for (let i = 1; i < leaderboard.length; i++) {
      expect(leaderboard[i - 1].runsParticipated).toBeGreaterThanOrEqual(
        leaderboard[i].runsParticipated,
      );
    }
  });
});

/**
 * In-memory reference: a faithful copy of the previous algorithm, used only to
 * prove the SQL output is identical over the same full table snapshot.
 */
function referenceTeamStats(runs: Generation[], steps: GenerationStep[]) {
  const completed = runs.filter((g) => g.status === "completed").length;
  const partial = runs.filter((g) => g.status === "partial").length;
  const approved = runs.filter((g) => g.feedbackVerdict === "approved").length;
  const rejected = runs.filter((g) => g.feedbackVerdict === "rejected").length;
  const pending = runs.length - approved - rejected;
  const totalInputTokens = steps.reduce((a, s) => a + (s.inputTokens ?? 0), 0);
  const totalOutputTokens = steps.reduce((a, s) => a + (s.outputTokens ?? 0), 0);
  const runDurations = runs
    .map((g) => g.durationMs)
    .filter((n): n is number => typeof n === "number");
  const avgDurationMs = runDurations.length
    ? Math.round(runDurations.reduce((a, b) => a + b, 0) / runDurations.length)
    : null;

  const board = new Map<
    string,
    {
      agentPath: string;
      runsLed: number;
      runsParticipated: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      lastActiveAt: string | null;
      _durations: number[];
    }
  >();
  const ensure = (p: string) => {
    let e = board.get(p);
    if (!e) {
      e = {
        agentPath: p,
        runsLed: 0,
        runsParticipated: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        lastActiveAt: null,
        _durations: [],
      };
      board.set(p, e);
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
    e.totalInputTokens += s.inputTokens ?? 0;
    e.totalOutputTokens += s.outputTokens ?? 0;
    if (typeof s.durationMs === "number") e._durations.push(s.durationMs);
  }
  const leaderboard = [...board.values()].map(({ _durations, ...rest }) => ({
    ...rest,
    estimatedCostEur: estimateCostEur(
      rest.totalInputTokens,
      rest.totalOutputTokens,
    ),
    avgDurationMs: _durations.length
      ? Math.round(_durations.reduce((a, b) => a + b, 0) / _durations.length)
      : null,
  }));

  return {
    totalRuns: runs.length,
    completed,
    partial,
    approved,
    rejected,
    pending,
    totalInputTokens,
    totalOutputTokens,
    avgDurationMs,
    leaderboard,
  };
}

describe("getTeamStats parity with the in-memory reference", () => {
  it("returns identical totals and per-agent rollups over the same table", async () => {
    const [runs, steps] = await Promise.all([
      db.select().from(generationsTable),
      db.select().from(generationStepsTable),
    ]);
    const ref = referenceTeamStats(runs, steps);
    const sqlStats = await getTeamStats();

    expect(sqlStats.totalRuns).toBe(ref.totalRuns);
    expect(sqlStats.completed).toBe(ref.completed);
    expect(sqlStats.partial).toBe(ref.partial);
    expect(sqlStats.approved).toBe(ref.approved);
    expect(sqlStats.rejected).toBe(ref.rejected);
    expect(sqlStats.pending).toBe(ref.pending);
    expect(sqlStats.totalInputTokens).toBe(ref.totalInputTokens);
    expect(sqlStats.totalOutputTokens).toBe(ref.totalOutputTokens);
    expect(sqlStats.totalTokens).toBe(
      ref.totalInputTokens + ref.totalOutputTokens,
    );
    expect(sqlStats.estimatedCostEur).toBeCloseTo(
      estimateCostEur(ref.totalInputTokens, ref.totalOutputTokens),
      10,
    );
    // Average wall-clock can differ by <=1ms from float-vs-numeric rounding.
    if (ref.avgDurationMs === null) {
      expect(sqlStats.avgDurationMs).toBeNull();
    } else {
      expect(sqlStats.avgDurationMs).not.toBeNull();
      expect(
        Math.abs((sqlStats.avgDurationMs ?? 0) - ref.avgDurationMs),
      ).toBeLessThanOrEqual(1);
    }

    // The leaderboard must list exactly the same agents with the same rollups.
    expect(sqlStats.leaderboard.length).toBe(ref.leaderboard.length);
    const refByPath = new Map(ref.leaderboard.map((e) => [e.agentPath, e]));
    for (const got of sqlStats.leaderboard) {
      const want = refByPath.get(got.agentPath);
      expect(want, `missing reference entry for ${got.agentPath}`).toBeDefined();
      if (!want) continue;
      expect(got.runsLed).toBe(want.runsLed);
      expect(got.runsParticipated).toBe(want.runsParticipated);
      expect(got.totalInputTokens).toBe(want.totalInputTokens);
      expect(got.totalOutputTokens).toBe(want.totalOutputTokens);
      expect(got.lastActiveAt).toBe(want.lastActiveAt);
      expect(got.estimatedCostEur).toBeCloseTo(want.estimatedCostEur, 10);
      if (want.avgDurationMs === null) {
        expect(got.avgDurationMs).toBeNull();
      } else {
        expect(got.avgDurationMs).not.toBeNull();
        expect(
          Math.abs((got.avgDurationMs ?? 0) - want.avgDurationMs),
        ).toBeLessThanOrEqual(1);
      }
    }
  });
});
