import { Router, type IRouter } from "express";
import type { Generation } from "@workspace/db";
import { GetTeamResponse } from "@workspace/api-zod";
import { getTeamRoster } from "../lib/team";
import {
  getAgentStats,
  getTeamStats,
  listAgentRuns,
} from "../lib/generations-store";

const router: IRouter = Router();

/** Map a roster slug back to its agent doc path. */
function agentPathFromSlug(slug: string): string {
  return `agents/${slug}.md`;
}

/** Parse a JSON-array text column back into a string list, tolerating bad data. */
function parseList(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

/** Summary of a run an agent took part in, with this agent's role in it. */
function serializeAgentRun(g: Generation, agentPath: string) {
  return {
    id: g.id,
    clientName: g.clientName,
    workflowTitle: g.workflowTitle,
    leadAgentTitle: g.leadAgentTitle,
    teamTitles: parseList(g.teamTitles),
    requestText: g.requestText,
    createdAt: g.createdAt.toISOString(),
    status: g.status,
    triggerSource: g.triggerSource,
    role: g.leadAgentPath === agentPath ? "lead" : "member",
  };
}

router.get("/team", async (req, res): Promise<void> => {
  const employees = await getTeamRoster();
  res.json(GetTeamResponse.parse({ employees }));
});

router.get("/team/stats", async (req, res): Promise<void> => {
  const [stats, roster] = await Promise.all([getTeamStats(), getTeamRoster()]);
  const byPath = new Map(roster.map((m) => [m.path, m]));
  const leaderboard = stats.leaderboard.map((e) => {
    const member = byPath.get(e.agentPath);
    return {
      ...e,
      slug: member?.slug ?? e.agentPath.replace(/^agents\//, "").replace(/\.md$/, ""),
      title: member?.title ?? e.agentPath,
      portraitThumbUrl: member?.portraitThumbUrl ?? null,
    };
  });
  res.json({ ...stats, leaderboard });
});

router.get("/team/:slug/stats", async (req, res): Promise<void> => {
  const agentPath = agentPathFromSlug(req.params.slug);
  const stats = await getAgentStats(agentPath);
  res.json(stats);
});

router.get("/team/:slug/runs", async (req, res): Promise<void> => {
  const agentPath = agentPathFromSlug(req.params.slug);
  const runs = await listAgentRuns(agentPath);
  res.json({ runs: runs.map((g) => serializeAgentRun(g, agentPath)) });
});

export default router;
