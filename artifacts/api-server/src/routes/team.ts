import { Router, type IRouter } from "express";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import type { Generation } from "@workspace/db";
import { UpdateAgentPersonaBody, UploadAgentPortraitBody } from "@workspace/api-zod";
import { getDocFile, getDocsRoot, splitFrontmatter } from "../lib/docs";
import {
  getTeamDepartments,
  getTeamRoster,
  updateAgentPersona,
  type PersonaEdits,
  type TeamMember,
} from "../lib/team";
import { savePortrait } from "../lib/portraits";
import { getAgentStats, getTeamStats, listAgentRuns } from "../lib/generations-store";

const MAX_PORTRAIT_WIDTH = 1024;
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
    const lifecycle: AgentLifecycle =
      explicit === "deprecated"
        ? "deprecated"
        : member.active
          ? "active"
          : "paused";
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
  return { ...member, ...lifecycleFor(member) };
}

function agentPathFromSlug(slug: string): string {
  return `agents/${slug}.md`;
}

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

router.put("/team/:slug/persona", async (req, res): Promise<void> => {
  const parsed = UpdateAgentPersonaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid persona payload" });
    return;
  }
  const updated = await updateAgentPersona(req.params.slug, parsed.data as PersonaEdits);
  if (!updated) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json(serializeMember(updated));
});

router.post("/team/:slug/portrait", async (req, res): Promise<void> => {
  const { slug } = req.params;
  if (!getDocFile(agentPathFromSlug(slug))) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  const parsed = UploadAgentPortraitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid portrait payload" });
    return;
  }
  const base64 = parsed.data.imageBase64.replace(/^data:[^;]+;base64,/, "");
  const raw = Buffer.from(base64, "base64");
  if (raw.length === 0) {
    res.status(400).json({ error: "Empty image payload" });
    return;
  }
  let png: Buffer;
  try {
    png = await sharp(raw)
      .rotate()
      .resize({ width: MAX_PORTRAIT_WIDTH, withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch {
    res.status(400).json({ error: "Unsupported or corrupt image" });
    return;
  }
  await savePortrait(slug, png);
  const member = (await getTeamRoster()).find((m) => m.slug === slug);
  if (!member) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json(serializeMember(member));
});

export default router;
