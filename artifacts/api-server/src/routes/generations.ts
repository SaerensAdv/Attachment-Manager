import { Router, type IRouter } from "express";
import type {
  Generation,
  GenerationStep,
  ImprovementProposal,
} from "@workspace/db";
import {
  listGenerations,
  getGeneration,
  deleteGeneration,
  updateGenerationFeedback,
  listGenerationSteps,
  setGenerationApproval,
  appendGenerationStep,
} from "../lib/generations-store";
import {
  deliverMonthlyReport,
  parseReportDeliveryPayload,
} from "../lib/monthly-report-email";
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
    status: g.status,
    triggerSource: g.triggerSource,
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
    durationMs: g.durationMs ?? null,
    totalTokens: g.totalTokens ?? null,
    feedbackVerdict: g.feedbackVerdict ?? null,
    feedbackNote: g.feedbackNote ?? null,
    feedbackAt: g.feedbackAt ? g.feedbackAt.toISOString() : null,
    approvalStatus: g.approvalStatus ?? null,
    approvalNote: g.approvalNote ?? null,
    approvalAt: g.approvalAt ? g.approvalAt.toISOString() : null,
    // Whether a drafted-but-unsent delivery is held on this run. The raw JSON
    // snapshot itself is never exposed — only that something is awaiting release.
    hasPendingDelivery: Boolean(g.pendingDelivery),
  };
}

/** Wire shape for a single audit-trail step. */
function serializeStep(s: GenerationStep) {
  return {
    id: s.id,
    agentPath: s.agentPath,
    agentTitle: s.agentTitle,
    stepOrder: s.stepOrder,
    role: s.role,
    status: s.status,
    durationMs: s.durationMs ?? null,
    inputTokens: s.inputTokens ?? null,
    outputTokens: s.outputTokens ?? null,
    charCount: s.charCount ?? null,
    errorMessage: s.errorMessage ?? null,
    createdAt: s.createdAt.toISOString(),
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

router.get("/generations/:id/steps", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const rows = await listGenerationSteps(id);
  res.json({ steps: rows.map(serializeStep) });
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

/**
 * Approve a held client-facing report: render the PDF + cover e-mail from the
 * snapshot taken at run time and send it to the client. The send only happens
 * here, after a human signs off — nothing reaches the client unattended. If the
 * send fails the draft stays pending so it can be retried.
 */
router.post("/generations/:id/approve", async (req, res) => {
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
  if (row.approvalStatus !== "pending" || !row.pendingDelivery) {
    res
      .status(409)
      .json({ error: "Er staat geen rapport klaar voor goedkeuring." });
    return;
  }
  let payload;
  try {
    payload = parseReportDeliveryPayload(JSON.parse(row.pendingDelivery));
  } catch {
    payload = null;
  }
  if (!payload) {
    res
      .status(422)
      .json({ error: "Het bewaarde rapport is onleesbaar; genereer opnieuw." });
    return;
  }

  // Send first; only mark approved + clear the held snapshot once it is out, so
  // a delivery failure leaves the draft pending for a retry rather than lost.
  try {
    await deliverMonthlyReport(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res
      .status(502)
      .json({ error: `Versturen mislukt: ${message}. Rapport blijft in afwachting.` });
    return;
  }

  const updated = await setGenerationApproval(id, {
    status: "approved",
    clearPending: true,
  });
  await appendGenerationStep(id, {
    agentPath: row.workflowPath,
    agentTitle: "Maandrapport goedgekeurd & verzonden",
    role: "deliverable",
    status: "completed",
    durationMs: null,
    inputTokens: null,
    outputTokens: null,
    charCount: null,
    errorMessage: null,
  });
  res.json(serializeDetail(updated ?? row));
});

/**
 * Request changes on a held report: keep it back (never sent) and record the
 * reviewer's note as rework context for a regeneration. The held snapshot is
 * cleared so the stale draft can never be released afterward.
 */
router.post("/generations/:id/request-changes", async (req, res) => {
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
  if (row.approvalStatus !== "pending") {
    res
      .status(409)
      .json({ error: "Er staat geen rapport klaar voor beoordeling." });
    return;
  }
  const body = (req.body ?? {}) as { note?: unknown };
  const note =
    typeof body.note === "string" && body.note.trim().length > 0
      ? body.note.trim()
      : null;
  const updated = await setGenerationApproval(id, {
    status: "changes_requested",
    note,
    clearPending: true,
  });
  await appendGenerationStep(id, {
    agentPath: row.workflowPath,
    agentTitle: "Wijzigingen gevraagd — rapport niet verzonden",
    role: "deliverable",
    status: "completed",
    durationMs: null,
    inputTokens: null,
    outputTokens: null,
    charCount: null,
    errorMessage: note,
  });
  res.json(serializeDetail(updated ?? row));
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
