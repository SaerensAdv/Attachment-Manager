import { Router, type IRouter } from "express";
import sharp from "sharp";
import type { Generation } from "@workspace/db";
import {
  GetTeamResponse,
  UpdateAgentPersonaBody,
  UploadAgentPortraitBody,
} from "@workspace/api-zod";
import { getDocFile } from "../lib/docs";
import {
  getTeamDepartments,
  getTeamRoster,
  updateAgentPersona,
  type PersonaEdits,
} from "../lib/team";
import { savePortrait } from "../lib/portraits";
import {
  getAgentStats,
  getTeamStats,
  listAgentRuns,
} from "../lib/generations-store";

/** Largest portrait we store; the serving route resizes down for every display. */
const MAX_PORTRAIT_WIDTH = 1024;

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
  const departments = getTeamDepartments();
  res.json(GetTeamResponse.parse({ employees, departments }));
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

router.put("/team/:slug/persona", async (req, res): Promise<void> => {
  const parsed = UpdateAgentPersonaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid persona payload" });
    return;
  }
  const updated = await updateAgentPersona(
    req.params.slug,
    parsed.data as PersonaEdits,
  );
  if (!updated) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json(updated);
});

router.post("/team/:slug/portrait", async (req, res): Promise<void> => {
  const { slug } = req.params;
  // Only allow uploads for agents that actually exist in the doc graph.
  if (!getDocFile(agentPathFromSlug(slug))) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const parsed = UploadAgentPortraitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid portrait payload" });
    return;
  }

  // Tolerate a data-URL prefix; the spec says the bytes are PNG/JPEG/WebP.
  const base64 = parsed.data.imageBase64.replace(/^data:[^;]+;base64,/, "");
  const raw = Buffer.from(base64, "base64");
  if (raw.length === 0) {
    res.status(400).json({ error: "Empty image payload" });
    return;
  }

  let png: Buffer;
  try {
    png = await sharp(raw)
      .rotate() // honour EXIF orientation before stripping metadata
      .resize({
        width: MAX_PORTRAIT_WIDTH,
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
  } catch {
    res.status(400).json({ error: "Unsupported or corrupt image" });
    return;
  }

  await savePortrait(slug, png);

  const roster = await getTeamRoster();
  const member = roster.find((m) => m.slug === slug);
  if (!member) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json(member);
});

export default router;
