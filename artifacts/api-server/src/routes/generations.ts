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
  draftMonthlyReport,
  parseReportDeliveryPayload,
} from "../lib/monthly-report-email";
import {
  draftEmailReply,
  parseEmailReplyPayload,
  pendingDeliveryKind,
} from "../lib/email-reply";
import {
  draftSeoReport,
  parseSeoReportDeliveryPayload,
  sendSeoWorklistToOwner,
} from "../lib/seo-report-email";
import { recordAlert } from "../lib/alerts-store";
import type { CreateDraftResult } from "../lib/email";
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
    clientPath: g.clientPath,
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
  pendingDeliveryKind: "monthly-report" | "email-reply" | "seo-report" | null;
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
    // The monthly-report and SEO-report drafts both surface as a held delivery
    // with no reviewable inline reply — the client-facing content lives in the
    // rendered PDF, not in the run row.
    return { pendingDeliveryKind: kind, pendingEmailReply: null };
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

/** One persisted fan-out creative variation surfaced to the run/archive view. */
interface FanoutCandidate {
  variant: number;
  text: string;
  status: string;
  winner: boolean;
  // Per-loser note: why this variation lost (empty for the winner / when absent).
  reason: string;
}

/**
 * Parse the persisted fan-out snapshot (every usable variation + the selector's
 * rationale) back into a structured shape, tolerating absent/garbled data. Null
 * when this run was not a fan-out run.
 */
function parseFanoutCandidates(value: string | null): {
  rationale: string;
  candidates: FanoutCandidate[];
} | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const raw = (parsed as { candidates?: unknown }).candidates;
    if (!Array.isArray(raw)) return null;
    const candidates = raw
      .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
      .map((c) => ({
        variant: typeof c.variant === "number" ? c.variant : 0,
        text: typeof c.text === "string" ? c.text : "",
        status: typeof c.status === "string" ? c.status : "completed",
        winner: c.winner === true,
        reason: typeof c.reason === "string" ? c.reason : "",
      }))
      .filter((c) => c.text.trim().length > 0);
    if (candidates.length === 0) return null;
    const rationale =
      typeof (parsed as { rationale?: unknown }).rationale === "string"
        ? (parsed as { rationale: string }).rationale
        : "";
    return { rationale, candidates };
  } catch {
    return null;
  }
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
    // The effective quality-gate flags this run resolved to. Read-only audit
    // signal so a reviewer can see what drove the gate (e.g. whether the
    // Humanizer ran for client-facing text). Null on runs that failed before the
    // gate resolved.
    clientFacing: g.clientFacing ?? null,
    touchesLiveAccount: g.touchesLiveAccount ?? null,
    // For a fan-out lead step: every usable creative variation that was
    // generated plus the selector's rationale (winner flagged), so the archive
    // can show the alternatives, not just the auto-chosen winner. Null for runs
    // that did not fan out.
    fanoutCandidates: parseFanoutCandidates(g.fanoutCandidates),
  };
}

/** The reviewable shape of an agent's internal handoff brief. */
interface HandoffBriefWire {
  decisions: string[];
  keyFacts: string[];
  openQuestions: string[];
  forNext: string | null;
  clientFacing: boolean | null;
  touchesLiveAccount: boolean | null;
}

/**
 * Parse the JSON handoff-brief stored on a step back into a typed object for the
 * audit panel, tolerating bad/legacy data (returns null). This is an
 * internal-only reliability trail; it is shown only in the run timeline and
 * never reaches a client-facing deliverable.
 */
function parseHandoffBrief(value: string | null): HandoffBriefWire | null {
  if (!value) return null;
  let raw: unknown = null;
  try {
    raw = JSON.parse(value);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  const strArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const bool = (v: unknown): boolean | null =>
    typeof v === "boolean" ? v : null;
  const brief: HandoffBriefWire = {
    decisions: strArray(p.decisions),
    keyFacts: strArray(p.keyFacts),
    openQuestions: strArray(p.openQuestions),
    forNext: typeof p.forNext === "string" && p.forNext ? p.forNext : null,
    clientFacing: bool(p.clientFacing),
    touchesLiveAccount: bool(p.touchesLiveAccount),
  };
  const empty =
    brief.decisions.length === 0 &&
    brief.keyFacts.length === 0 &&
    brief.openQuestions.length === 0 &&
    brief.forNext === null &&
    brief.clientFacing === null &&
    brief.touchesLiveAccount === null;
  return empty ? null : brief;
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
    // The agent's internal handoff brief (decisions / key facts / open
    // questions / note + gate flags), parsed for the per-agent audit panel.
    // Null for briefless agents and non-agent steps. Never client-facing.
    handoffBrief: parseHandoffBrief(s.handoffBrief),
    createdAt: s.createdAt.toISOString(),
  };
}

router.get("/generations", async (req, res) => {
  // Optional per-client filter for the dossier's document history. An equality
  // match on the doc-graph client path (e.g. "clients/db/17.md"); omitted =
  // the full archive.
  const raw = req.query.clientPath;
  const clientPath =
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
  const rows = await listGenerations(clientPath);
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
 * Approve a held client-facing draft: render the PDF + e-mail from the snapshot
 * taken at run time and stage it as a Gmail DRAFT under the agency mailbox (both
 * the monthly report and an in-thread client reply). Nothing is sent here — the
 * owner does the final send from Gmail himself; this only happens after a human
 * signs off. If the draft API fails the held draft stays pending so it can be
 * retried.
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
          doneTitle: "Antwoord — concept klaargezet in Gmail",
          failVerb: "Concept aanmaken",
          failTail: "Concept blijft in afwachting.",
        }
      : kind === "seo-report"
        ? {
            unreadable: "Het bewaarde SEO-rapport is onleesbaar; genereer opnieuw.",
            doneTitle: "SEO-rapport — concept klaargezet in Gmail",
            failVerb: "Concept aanmaken",
            failTail: "Concept blijft in afwachting.",
          }
        : {
            unreadable: "Het bewaarde rapport is onleesbaar; genereer opnieuw.",
            doneTitle: "Maandrapport — concept klaargezet in Gmail",
            failVerb: "Concept aanmaken",
            failTail: "Concept blijft in afwachting.",
          };

  const report =
    kind === "monthly-report" ? parseReportDeliveryPayload(raw) : null;
  const reply = kind === "email-reply" ? parseEmailReplyPayload(raw) : null;
  const seoReport =
    kind === "seo-report" ? parseSeoReportDeliveryPayload(raw) : null;
  if (!report && !reply && !seoReport) {
    // Unreadable snapshot: release the claim back to pending (state must not be
    // stuck "approved" with a draft we never sent).
    await revertGenerationApprovalToPending(id);
    res.status(422).json({ error: labels.unreadable });
    return;
  }

  // Claim is held; act now. The in-thread client reply, the monthly Ads report
  // and the SEO report are all placed as Gmail DRAFTS under the agency mailbox —
  // nothing is sent here; the owner does the final send from Gmail himself. On
  // failure revert to pending so it can be retried; clear the held snapshot only
  // once it succeeds.
  let draftResult: CreateDraftResult | null = null;
  try {
    if (reply) {
      draftResult = await draftEmailReply(reply);
    } else if (seoReport) {
      draftResult = await draftSeoReport(seoReport);
    } else if (report) {
      draftResult = await draftMonthlyReport(report);
    }
  } catch (err) {
    // Failed: release the claim back to pending with the snapshot intact so the
    // owner can retry. Best-effort — even if the revert itself fails the worst
    // case is a stuck "approved" draft, never an unapproved send.
    try {
      await revertGenerationApprovalToPending(id);
    } catch {
      /* leave the 502 to the client; the revert is best-effort */
    }
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({
      error: `${labels.failVerb} mislukt: ${message}. ${labels.failTail}`,
    });
    return;
  }

  let updated = await setGenerationApproval(id, {
    status: "approved",
    clearPending: true,
  });
  await appendGenerationStep(id, {
    agentPath: row.workflowPath,
    agentTitle: labels.doneTitle,
    role: "deliverable",
    status: "completed",
    durationMs: null,
    inputTokens: null,
    outputTokens: null,
    charCount: null,
    errorMessage: null,
  });

  // Best-effort: for an approved SEO report, also SEND the internal "werklijst"
  // (the technical actions) straight to the agency owner — never to the client.
  // The client draft is already committed above, so a failure here must not
  // revert it; it becomes a "Te doen" alert instead. Runs at most once because
  // the pending snapshot was cleared on approval (no retry re-enters this path).
  if (seoReport) {
    try {
      const wl = await sendSeoWorklistToOwner(seoReport);
      if (wl.status === "skipped" && wl.reason === "no-owner-email") {
        await recordAlert({
          source: "seo-report",
          severity: "warn",
          message:
            "Interne werklijst niet verstuurd: stel OWNER_EMAIL in om ze te ontvangen.",
          context: { key: "worklist-no-owner", generationId: id },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordAlert({
        source: "seo-report",
        severity: "warn",
        message: `Interne werklijst kon niet naar het bureau verstuurd worden: ${message.slice(
          0,
          200,
        )}`,
        context: { key: `worklist-send:${id}`, generationId: id },
      });
    }
  }

  // Best-effort: record/advance the e-mail conversation from the DRAFT's
  // threadId. Gmail keeps that threadId when the owner sends the draft, so the
  // conversation is tracked from now on and an inbound client reply can be
  // routed back to this Head and threaded correctly. A bookkeeping failure must
  // never turn into an error here.
  if (draftResult?.threadId) {
    try {
      const headAgentPath =
        reply?.headAgentPath ??
        report?.headAgentPath ??
        seoReport?.headAgentPath ??
        row.leadAgentPath;
      const subject =
        reply?.subject ?? report?.subject ?? seoReport?.subject ?? "";
      const thread = await recordOutboundThread({
        gmailThreadId: draftResult.threadId,
        clientPath: row.clientPath,
        headAgentPath,
        subject,
        lastMessageIdHeader: draftResult.messageId || null,
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
