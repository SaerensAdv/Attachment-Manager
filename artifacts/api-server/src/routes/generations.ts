import { Router, type IRouter } from "express";
import type { Generation, ImprovementProposal } from "@workspace/db";
import {
  listGenerations,
  getGeneration,
  deleteGeneration,
  updateGenerationFeedback,
} from "../lib/generations-store";
import {
  createProposals,
  listProposalsForGeneration,
} from "../lib/proposals-store";
import { generateProposals } from "../lib/improvements";

const router: IRouter = Router();

/** Wire shape for a single improvement proposal. */
export function serializeProposal(p: ImprovementProposal) {
  return {
    id: p.id,
    generationId: p.generationId,
    targetType: p.targetType,
    targetPath: p.targetPath,
    targetLabel: p.targetLabel,
    rationale: p.rationale,
    proposedText: p.proposedText,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    decidedAt: p.decidedAt ? p.decidedAt.toISOString() : null,
  };
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
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

/** Lightweight shape for the archive index (no heavy markdown body). */
function serializeSummary(g: Generation) {
  return {
    id: g.id,
    clientName: g.clientName,
    workflowTitle: g.workflowTitle,
    leadAgentTitle: g.leadAgentTitle,
    teamTitles: parseList(g.teamTitles),
    requestText: g.requestText,
    createdAt: g.createdAt.toISOString(),
  };
}

/** Full shape including the assembled markdown body and QA feedback. */
function serializeDetail(g: Generation) {
  return {
    ...serializeSummary(g),
    clientPath: g.clientPath,
    workflowPath: g.workflowPath,
    leadAgentPath: g.leadAgentPath,
    teamPaths: parseList(g.teamPaths),
    finalMarkdown: g.finalMarkdown,
    feedbackVerdict: g.feedbackVerdict ?? null,
    feedbackNote: g.feedbackNote ?? null,
    feedbackAt: g.feedbackAt ? g.feedbackAt.toISOString() : null,
  };
}

router.get("/generations", async (_req, res) => {
  const rows = await listGenerations();
  res.json({ generations: rows.map(serializeSummary) });
});

router.get("/generations/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const row = await getGeneration(id);
  if (!row) {
    res.status(404).json({ error: "Generatie niet gevonden." });
    return;
  }
  res.json(serializeDetail(row));
});

router.put("/generations/:id/feedback", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const body = (req.body ?? {}) as { verdict?: unknown; note?: unknown };
  const verdict = body.verdict;
  if (verdict !== "approved" && verdict !== "rejected") {
    res.status(400).json({ error: "verdict moet 'approved' of 'rejected' zijn." });
    return;
  }
  const note =
    typeof body.note === "string" && body.note.trim().length > 0
      ? body.note.trim()
      : null;
  const row = await updateGenerationFeedback(id, verdict, note);
  if (!row) {
    res.status(404).json({ error: "Generatie niet gevonden." });
    return;
  }
  res.json(serializeDetail(row));
});

router.get("/generations/:id/proposals", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const rows = await listProposalsForGeneration(id);
  res.json({ proposals: rows.map(serializeProposal) });
});

router.post("/generations/:id/proposals", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const generation = await getGeneration(id);
  if (!generation) {
    res.status(404).json({ error: "Generatie niet gevonden." });
    return;
  }
  if (!generation.feedbackVerdict) {
    res
      .status(400)
      .json({ error: "Geef eerst een beoordeling voor je verbeteringen vraagt." });
    return;
  }
  let drafts;
  try {
    drafts = await generateProposals(generation);
  } catch (err) {
    res.status(502).json({
      error: "Het voorstellen van verbeteringen is mislukt. Probeer het opnieuw.",
      detail: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  const saved = await createProposals(
    drafts.map((d) => ({
      generationId: id,
      targetType: d.targetType,
      targetPath: d.targetPath,
      targetLabel: d.targetLabel,
      rationale: d.rationale,
      proposedText: d.proposedText,
    })),
  );
  res.json({ proposals: saved.map(serializeProposal) });
});

router.delete("/generations/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const removed = await deleteGeneration(id);
  if (!removed) {
    res.status(404).json({ error: "Generatie niet gevonden." });
    return;
  }
  res.status(204).end();
});

export default router;
