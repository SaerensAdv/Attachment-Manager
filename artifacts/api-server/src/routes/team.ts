import { Router, type IRouter, type RequestHandler } from "express";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Generation } from "@workspace/db";
import { getDocsRoot, splitFrontmatter } from "../lib/docs";
import {
  getTeamDepartments,
  getTeamRoster,
  type TeamMember,
} from "../lib/team";
import { getAgentStats, getTeamStats, listAgentRuns } from "../lib/generations-store";

const router: IRouter = Router();
type AgentLifecycle = "active" | "paused" | "deprecated";

function frontmatterValue(frontmatter: string | null, key: string): string | null {
  if (!frontmatter) return null;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = frontmatter.match(new RegExp(`^\\s*${escaped}\\s*:\\s*(.+?)\\s*$`, "im"));
  return match?.[1]?.replace(/^['\"]|['\"]$/g, "").trim() || null;
}

function lifecycleFor(member: TeamMember) {
  if (member.slug === "orchestrator") {
    return { active: true, lifecycle: "active" as const, pausedAt: null, reason: null };
  }
  try {
    const raw = readFileSync(join(getDocsRoot(), member.path), "utf8");
    const frontmatter = splitFrontmatter(raw).frontmatter;
    const explicit = frontmatterValue(frontmatter, "lifecycle")?.toLowerCase();
    const lifecycle: AgentLifecycle = explicit === "deprecated" ? "deprecated" : member.active ? "active" : "paused";
    return {
      active: lifecycle === "active",
      lifecycle,
      pausedAt: frontmatterValue(frontmatter, "paused_date"),
      reason: frontmatterValue(frontmatter, "reason"),
    };
  } catch {
    return {
      active: member.active,
      lifecycle: member.active ? ("active" as const) : ("paused" as const),
      pausedAt: null,
      reason: null,
    };
  }
}

function serializeMember(member: TeamMember) {
  return {
    ...member,
    ...lifecycleFor(member),
    canonicalOwner: "github" as const,
    projectionMode: "read-only" as const,
    canonicalUrl: `https://github.com/SaerensAdv/Attachment-Manager/blob/main/${member.path}`,
  };
}

function agentPathFromSlug(slug: string): string {
  return `agents/${slug}.md`;
}

function parseList(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

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

router.get("/team", async (_req, res): Promise<void> => {
  const employees = await getTeamRoster();
  res.json({
    employees: employees.map(serializeMember),
    departments: getTeamDepartments(),
    projection: {
      mode: "read-only",
      businessAgentOwner: "clickup",
      softwareAgentOwner: "github",
      verifiedAt: new Date().toISOString(),
    },
  });
});

router.get("/team/stats", async (_req, res): Promise<void> => {
  const [stats, roster] = await Promise.all([getTeamStats(), getTeamRoster()]);
  const byPath = new Map(roster.map((m) => [m.path, m]));
  const leaderboard = stats.leaderboard.map((entry) => {
    const member = byPath.get(entry.agentPath);
    return {
      ...entry,
      slug: member?.slug ?? entry.agentPath.replace(/^agents\//, "").replace(/\.md$/, ""),
      title: member?.title ?? entry.agentPath,
      portraitThumbUrl: member?.portraitThumbUrl ?? null,
      lifecycle: member ? lifecycleFor(member).lifecycle : "active",
    };
  });
  res.json({ ...stats, leaderboard });
});

router.get("/team/:slug/stats", async (req, res): Promise<void> => {
  res.json(await getAgentStats(agentPathFromSlug(req.params.slug)));
});

router.get("/team/:slug/runs", async (req, res): Promise<void> => {
  const agentPath = agentPathFromSlug(req.params.slug);
  const runs = await listAgentRuns(agentPath);
  res.json({ runs: runs.map((g) => serializeAgentRun(g, agentPath)) });
});

const rejectAtlasAgentWrite: RequestHandler = (_req, res) => {
  res.status(405).json({
    error: "Atlas is a read-only agent projection",
    code: "ATLAS_AGENT_WRITE_DISABLED",
    canonicalOwner: "clickup-or-github",
  });
};

router.put("/team/:slug/persona", rejectAtlasAgentWrite);
router.post("/team/:slug/portrait", rejectAtlasAgentWrite);

export default router;
