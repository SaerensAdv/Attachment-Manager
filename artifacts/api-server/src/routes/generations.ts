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
  claimGenerationApprovalForSend,
  revertGenerationApprovalToPending,
  appendGenerationStep,
} from "../lib/generations-store";
import {
  deliverMonthlyReport,
  parseReportDeliveryPayload,
} from "../lib/monthly-report-email";
import {
  deliverEmailReply,
  parseEmailReplyPayload,
  pendingDeliveryKind,
} from "../lib/email-reply";
import type { SendEmailResult } from "../lib/email";
import {
  recordOutboundThread,
  linkGenerationThread,
} from "../lib/email-threads-store";
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

/**
 * The reviewable subset of a held email-reply draft, safe to send to the client
 * UI. Identity/threading internals (From alias, CC, Message-IDs, threadId) are
 * deliberately omitted — a reviewer only needs to see what the client wrote and
 * what we propose to send back.
 */
function summarizePendingDelivery(g: Generation): {
  pendingDeliveryKind: "monthly-report" | "email-reply" | null;
  pendingEmailReply: {
    recipient: string;
    subject: string;
    inboundText: string;
    replyBody: string;
  } | null;
} {
  if (!g.pendingDelivery) {
    return { pendingDeliveryKind: null, pendingEmailReply: null };
  }
  let raw: unknown = null;
  try {
    raw = JSON.parse(g.pendingDelivery);
  } catch {
    raw = null;
  }
  const kind = pendingDeliveryKind(raw);
  if (kind !== "email-reply") {
    return { pendingDeliveryKind: "monthly-report", pendingEmailReply: null };
  }
  const reply = parseEmailReplyPayload(raw);
  return {
    pendingDeliveryKind: "email-reply",
    pendingEmailReply: reply
      ? {
          recipient: reply.recipient,
          subject: reply.subject,
          inboundText: reply.inboundText,
          replyBody: reply.replyBody,
        }
      : null,
  };
}

/** Full shape including the assembled markdown body and QA feedback. */
function serializeDetail(g: Generation) {
  const pending = summarizePendingDelivery(g);
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
    // Which kind of delivery is held (null when none), plus — for an inbound
    // email reply drafted autonomously (no live session) — the reviewable
    // content so a human can approve it from the archive.
    pendingDeliveryKind: pending.pendingDeliveryKind,
    pendingEmailReply: pending.pendingEmailReply,
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
  // Atomically claim the held draft: flip pending -> approved only while it is
  // still pending with a snapshot in place. A second concurrent approval (two
  // tabs/users) loses this claim and gets a 409, so the same client email can
  // never be sent twice. The snapshot is kept until the send succeeds; any
  // failure path below reverts to pending so the draft stays retryable.
  const row = await claimGenerationApprovalForSend(id);
  if (!row || !row.pendingDelivery) {
    const existing = await getGeneration(id);
    if (!existing) {
      res.status(404).json({ error: "Generatie niet gevonden." });
      return;
    }
    res
      .status(409)
      .json({ error: "Er staat geen uitgaande e-mail klaar voor goedkeuring." });
    return;
  }

  // The held draft is a small tagged union: an "email-reply" (Phase 2, in-thread
  // client reply) or, by default, the monthly report. Both share this single
  // approval gate — nothing reaches the client until released here.
  let raw: unknown = null;
  try {
    raw = JSON.parse(row.pendingDelivery);
  } catch {
    raw = null;
  }
  const kind = pendingDeliveryKind(raw);
  const labels =
    kind === "email-reply"
      ? {
          unreadable: "Het bewaarde antwoord is onleesbaar; genereer opnieuw.",
          sentTitle: "Antwoord goedgekeurd & verzonden",
        }
      : {
          unreadable: "Het bewaarde rapport is onleesbaar; genereer opnieuw.",
          sentTitle: "Maandrapport goedgekeurd & verzonden",
        };

  const report =
    kind === "monthly-report" ? parseReportDeliveryPayload(raw) : null;
  const reply = kind === "email-reply" ? parseEmailReplyPayload(raw) : null;
  if (!report && !reply) {
    // Unreadable snapshot: release the claim back to pending (state must not be
    // stuck "approved" with a draft we never sent).
    await revertGenerationApprovalToPending(id);
    res.status(422).json({ error: labels.unreadable });
    return;
  }

  // Claim is held; send now. On failure revert to pending so the draft can be
  // retried, then only clear the held snapshot once it is actually out.
  let sendResult: SendEmailResult | null = null;
  try {
    if (reply) {
      sendResult = await deliverEmailReply(reply);
    } else if (report) {
      sendResult = await deliverMonthlyReport(report);
    }
  } catch (err) {
    // Send failed: release the claim back to pending with the snapshot intact so
    // the owner can retry. Best-effort — even if the revert itself fails the
    // worst case is a stuck "approved" draft, never an unapproved send.
    try {
      await revertGenerationApprovalToPending(id);
    } catch {
      /* leave the 502 to the client; the revert is best-effort */
    }
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({
      error: `Versturen mislukt: ${message}. Concept blijft in afwachting.`,
    });
    return;
  }

  let updated = await setGenerationApproval(id, {
    status: "approved",
    clearPending: true,
  });
  await appendGenerationStep(id, {
    agentPath: row.workflowPath,
    agentTitle: labels.sentTitle,
    role: "deliverable",
    status: "completed",
    durationMs: null,
    inputTokens: null,
    outputTokens: null,
    charCount: null,
    errorMessage: null,
  });

  // Best-effort: record/advance the e-mail conversation so an inbound reply can
  // be routed back to this Head and threaded correctly. The mail is already
  // sent, so a bookkeeping failure must never turn into an error here.
  if (sendResult?.threadId) {
    try {
      const headAgentPath =
        reply?.headAgentPath ?? report?.headAgentPath ?? row.leadAgentPath;
      const subject = reply?.subject ?? report?.subject ?? "";
      const thread = await recordOutboundThread({
        gmailThreadId: sendResult.threadId,
        clientPath: row.clientPath,
        headAgentPath,
        subject,
        lastMessageIdHeader: sendResult.messageId || null,
      });
      const linked = await linkGenerationThread(id, thread.id);
      if (linked) updated = linked;
    } catch (err) {
      console.error(
        "Kon e-mailthread niet bijwerken:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }
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
