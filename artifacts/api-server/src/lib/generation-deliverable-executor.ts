import { anthropic } from "@workspace/integrations-anthropic-ai";
import type { Client } from "@workspace/db";
import {
  deliverableMeta,
  buildDeliverablePrompt,
  type DeliverableKind,
} from "./deliverables";
import {
  extractFinalReport,
  splitReportDeliverables,
  stripHumanizerMeta,
  toClientFacingReport,
} from "./generation-text";
import { resolveHeadIdentity, ownerEmail } from "./email-identity";
import type { ReportDeliveryPayload } from "./monthly-report-email";
import type { SeoReportDeliveryPayload } from "./seo-report-email";
import { seoReportEyebrow } from "./seo-report-email";
import type { EmailReplyPayload } from "./email-reply";
import type { GoogleAdsMetrics } from "./google-ads";
import type {
  SeoReportCadence,
  SeoReportMetrics,
} from "./seo-report-data";
import type {
  GenerationSink,
  StepRecord,
  EmailReplyContext,
} from "./generation-types";

/**
 * The deliverable / side-effect executor: turns the team's combined work into
 * the concrete end product a workflow declares (a streamed deliverable, an
 * e-mailed monthly report held for approval, or a held inbound-reply draft).
 *
 * Every function here is a functional core: it performs its own streaming /
 * model calls and emits SSE events through the injected `send`, but it NEVER
 * mutates the run's shared state. Instead it RETURNS the step it produced
 * (without an order), whether the run should be downgraded to "partial", and —
 * for the held actions — the approval payload to snapshot. The orchestrator (the
 * imperative shell) assigns the step order, pushes the step, folds the status
 * and records the approval, so the audit trail's ordering stays in one place.
 * This lets a deliverable's behaviour change without touching the orchestrator.
 */

/** A step whose order the orchestrator assigns from its running counter. */
type OrderlessStep = Omit<StepRecord, "stepOrder">;

/** Effect of the streamed deliverable step (no step when skipped). */
export interface DeliverableEffect {
  step: OrderlessStep | null;
  downgrade: boolean;
}

/** Effect of an action deliverable that holds a draft for human approval. */
export interface ActionEffect {
  step: OrderlessStep;
  downgrade: boolean;
  approval: { status: string; payload: string } | null;
}

/**
 * Everything the deliverable + the held e-mail actions read. Built once by the
 * orchestrator from the post-QC snapshot; treated as read-only here.
 */
export interface DeliverableExecContext {
  send: GenerationSink;
  signal: AbortSignal;
  isGone: () => boolean;
  workflowPath: string;
  clientName: string;
  clientContent: string;
  request: string;
  deliverableKind: DeliverableKind;
  /** The combined team work (+ humanized pass) that feeds the end product. */
  deliverableSource: string;
  adCopyLiveData: string | null;
  negativesLiveData: string | null;
  reportClient: Client | null;
  reportMetrics: GoogleAdsMetrics | null;
  /** SEO report snapshot captured at run start (drives the PDF/email/KPIs). */
  reportSeoMetrics: SeoReportMetrics | null;
  /** SEO report cadence resolved from the workflow (monthly vs quarterly). */
  reportSeoCadence: SeoReportCadence;
  /** Human label of the period the SEO report covers (e.g. "mei 2026"). */
  reportSeoPeriodLabel: string;
  memberTitles: string[];
  teamPaths: string[];
  humanizerRan: boolean;
  humanizerTitle: string;
  reviewerText: string;
  /** Read-only view of the steps so far (to detect a truncated humanizer). */
  steps: readonly StepRecord[];
  emailReply: EmailReplyContext | null;
}

/**
 * Deliverable layer: turn the combined team work into the concrete end product
 * the workflow declares. Best-effort — a failure here never loses the run; it's
 * reported and the run still finishes with the markdown. Returns no step when
 * the run was aborted or the kind has no concrete deliverable.
 */
export async function runDeliverableStep(
  dc: DeliverableExecContext,
): Promise<DeliverableEffect> {
  const meta = dc.isGone() ? null : deliverableMeta(dc.deliverableKind, dc.clientName);
  const prompt = meta
    ? buildDeliverablePrompt(dc.deliverableKind, {
        clientName: dc.clientName,
        clientContent: dc.clientContent,
        request: dc.request,
        teamWork: dc.deliverableSource,
        liveData: dc.adCopyLiveData ?? dc.negativesLiveData ?? undefined,
      })
    : null;
  if (dc.isGone() || !meta || !prompt) return { step: null, downgrade: false };

  const delStartedAt = Date.now();
  let delChars = 0;
  let delIn: number | null = null;
  let delOut: number | null = null;
  let delStatus = "completed";
  try {
    dc.send({ type: "deliverable_start", deliverable: meta });
    const dstream = anthropic.messages.stream(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 16000,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      },
      { signal: dc.signal },
    );
    for await (const event of dstream) {
      if (dc.isGone()) break;
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        delChars += event.delta.text.length;
        dc.send({ type: "deliverable_delta", content: event.delta.text });
      }
    }
    let deliverableTruncated = false;
    if (!dc.isGone()) {
      try {
        const dfinal = await dstream.finalMessage();
        deliverableTruncated = dfinal.stop_reason === "max_tokens";
        delIn = dfinal.usage?.input_tokens ?? null;
        delOut = dfinal.usage?.output_tokens ?? null;
      } catch {
        // best-effort truncation detection
      }
    }
    delStatus = dc.isGone()
      ? "aborted"
      : deliverableTruncated
        ? "truncated"
        : "completed";
    if (!dc.isGone())
      dc.send({ type: "deliverable_done", truncated: deliverableTruncated });
  } catch (err) {
    delStatus = "failed";
    if (!dc.isGone() && !(err instanceof Error && err.name === "AbortError")) {
      const message = err instanceof Error ? err.message : String(err);
      dc.send({ type: "deliverable_error", message });
    }
  }
  return {
    step: {
      agentPath: dc.workflowPath,
      agentTitle: meta.title ?? "Eindproduct",
      role: "deliverable",
      status: delStatus,
      durationMs: Date.now() - delStartedAt,
      inputTokens: delIn,
      outputTokens: delOut,
      charCount: delChars || null,
      errorMessage: null,
    },
    downgrade: delStatus !== "completed",
  };
}

/**
 * Whether the Humanizer rewrote the draft AND ran without truncation, so its
 * rewritten section is preferred as the client-facing body over the raw
 * specialist sections. Mirrors the original report/reply body selection.
 */
function humanizedUntruncated(dc: DeliverableExecContext): boolean {
  return (
    dc.humanizerRan &&
    !dc.steps.some(
      (s) =>
        s.role === "quality" &&
        s.agentTitle === dc.humanizerTitle &&
        s.status === "truncated",
    )
  );
}

/**
 * Action deliverable: draft the monthly report (PDF rendered at approval time)
 * and HOLD it for human approval — nothing is sent here. Returns the approval
 * payload to snapshot plus the audit step. Best-effort: a real drafting failure
 * marks the run partial but never loses it.
 */
export async function runReportEmailAction(
  dc: DeliverableExecContext,
): Promise<ActionEffect> {
  const actionStartedAt = Date.now();
  let actionStatus = "completed";
  let actionError: string | null = null;
  let actionIn: number | null = null;
  let actionOut: number | null = null;
  let approval: ActionEffect["approval"] = null;
  const recipient = dc.reportClient?.reportEmail?.trim() ?? null;
  const teamWork = dc.deliverableSource.trim();
  try {
    dc.send({ type: "deliverable_start", deliverable: { title: "Maandrapport opstellen" } });
    if (!recipient) {
      throw new Error(
        "Geen rapport-ontvanger ingesteld voor deze klant (veld 'Rapport-ontvanger').",
      );
    }
    if (!teamWork) {
      throw new Error("Het team leverde geen rapport om te versturen.");
    }

    // Client-facing version: the PDF + cover email must never contain
    // unfinished "[AAN TE VULLEN]" placeholders or internal-only sections.
    // No fallback to the raw body — if sanitizing leaves nothing, we refuse to
    // send rather than risk leaking internal content to the client. When the
    // Humanizer rewrote the draft (untruncated), prefer its section as the
    // report body over the raw specialist sections.
    const reportHumanized = humanizedUntruncated(dc);
    const reportTitles = reportHumanized
      ? [...dc.memberTitles, dc.humanizerTitle]
      : dc.memberTitles;
    const reportFinal = reportHumanized
      ? stripHumanizerMeta(extractFinalReport(teamWork, reportTitles))
      : extractFinalReport(teamWork, reportTitles);
    const clientReport = toClientFacingReport(reportFinal);
    if (!clientReport) {
      throw new Error(
        "De klantgerichte rapportversie is leeg na het verwijderen van interne/placeholder-secties; rapport niet verzonden.",
      );
    }

    // Short Dutch cover email summarising the report, generated by the model.
    const periodLabel = "vorige maand";
    let emailBody = "";
    try {
      const emailMsg = await anthropic.messages.create(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 1200,
          system: [
            "Je bent accountmanager bij Saerens Advertising, een Belgisch Google Ads-bureau.",
            "Schrijf een korte, professionele begeleidende e-mail (in het Nederlands/Vlaams) bij het maandrapport van een klant.",
            "De volledige analyse zit als PDF in bijlage — vat in de e-mail enkel de 3 à 5 belangrijkste punten samen (resultaten, opvallende wijzigingen, voorgestelde volgende stappen).",
            "Gebruik GEEN emoji's. Geen markdown-koppen. Begin met een aanhef en eindig met een professionele afsluiting namens Saerens Advertising.",
            "Hou het onder ~200 woorden. Geef enkel de e-mailtekst terug, zonder onderwerpregel.",
          ].join("\n"),
          messages: [
            {
              role: "user",
              content: `Klant: ${dc.clientName}\nPeriode: ${periodLabel}\n\nKlantgericht rapport:\n\n${clientReport}`,
            },
          ],
        },
        { signal: dc.signal },
      );
      emailBody = emailMsg.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim();
      actionIn = emailMsg.usage?.input_tokens ?? null;
      actionOut = emailMsg.usage?.output_tokens ?? null;
    } catch (bodyErr) {
      if (bodyErr instanceof Error && bodyErr.name === "AbortError") throw bodyErr;
      // Fall back to a minimal cover note so the report still goes out.
      emailBody = `Beste,\n\nIn bijlage vind je het maandrapport van ${dc.clientName} (${periodLabel}). De volledige analyse staat in de PDF.\n\nMet vriendelijke groeten,\nSaerens Advertising`;
    }

    const dateLabel = new Date().toLocaleDateString("nl-BE", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const subject = `Maandrapport ${dc.clientName} — ${periodLabel}`;

    if (dc.isGone()) throw new Error("Afgebroken voor opslag.");

    // Human approval checkpoint: do NOT send. Snapshot everything needed to
    // render + send later, and HOLD it. The PDF is rendered at approval time
    // from this payload, so nothing reaches the client unattended. Freeze the
    // responsible Head's email identity (derived from the lead agent's
    // department) so the held draft is sent FROM that Head with the owner in CC.
    const identity = await resolveHeadIdentity(dc.teamPaths[0]);
    const payload: ReportDeliveryPayload = {
      recipient,
      subject,
      clientName: dc.clientName,
      periodLabel,
      dateLabel,
      emailBody,
      clientReport,
      metrics: dc.reportMetrics,
      fromName: identity?.displayName,
      fromAddress: identity?.address ?? undefined,
      cc: ownerEmail() ?? undefined,
      signature: identity?.signature,
      headAgentPath: identity?.headAgentPath ?? dc.teamPaths[0],
    };
    approval = { status: "pending", payload: JSON.stringify(payload) };
    dc.send({ type: "deliverable_done", truncated: false });
    // Surface the held draft + the internal reviewer verdict so a human can
    // decide before it goes out. The reviewer text is the QC gate's output.
    dc.send({
      type: "approval_required",
      recipient,
      clientReport,
      reviewerVerdict: dc.reviewerText.trim() || null,
    });
  } catch (err) {
    if (dc.isGone() || (err instanceof Error && err.name === "AbortError")) {
      actionStatus = "aborted";
    } else {
      actionStatus = "failed";
      actionError = (err instanceof Error ? err.message : String(err)).slice(
        0,
        500,
      );
      dc.send({ type: "deliverable_error", message: actionError });
    }
  }
  return {
    step: {
      agentPath: dc.workflowPath,
      agentTitle:
        actionStatus === "completed"
          ? "Maandrapport opgesteld — wacht op goedkeuring"
          : "Maandrapport opstellen",
      role: "deliverable",
      status: actionStatus,
      durationMs: Date.now() - actionStartedAt,
      inputTokens: actionIn,
      outputTokens: actionOut,
      charCount: null,
      errorMessage: actionError,
    },
    // Drafting the report succeeded even though it is held for approval, so the
    // run itself stays "completed"; only a real drafting failure marks it
    // partial. The held send is tracked by approvalStatus, not run status.
    downgrade: actionStatus !== "completed",
    approval,
  };
}

/**
 * Action deliverable: draft the recurring SEO/website report (PDF rendered at
 * approval time) and HOLD it for human approval — nothing is sent here. Mirrors
 * `runReportEmailAction` but for the organic report: it uses the SEO snapshot,
 * cadence and period label captured at run start. Returns the approval payload
 * to snapshot plus the audit step. Best-effort: a real drafting failure marks
 * the run partial but never loses it.
 */
export async function runSeoReportEmailAction(
  dc: DeliverableExecContext,
): Promise<ActionEffect> {
  const actionStartedAt = Date.now();
  let actionStatus = "completed";
  let actionError: string | null = null;
  let actionIn: number | null = null;
  let actionOut: number | null = null;
  let approval: ActionEffect["approval"] = null;
  const cadence = dc.reportSeoCadence;
  const cadenceWord = cadence === "quarterly" ? "kwartaal" : "maand";
  const startLabel =
    cadence === "quarterly" ? "SEO-kwartaalrapport opstellen" : "SEO-maandrapport opstellen";
  const recipient = dc.reportClient?.reportEmail?.trim() ?? null;
  const teamWork = dc.deliverableSource.trim();
  try {
    dc.send({ type: "deliverable_start", deliverable: { title: startLabel } });
    if (!recipient) {
      throw new Error(
        "Geen rapport-ontvanger ingesteld voor deze klant (veld 'Rapport-ontvanger').",
      );
    }
    if (!teamWork) {
      throw new Error("Het team leverde geen rapport om te versturen.");
    }

    // Split the team output into the SHORT client report (PDF + cover e-mail)
    // and the separate INTERNAL werklijst (agency + web developer only). The
    // client report is authored by the LEAD; later members only append internal
    // detail. `splitReportDeliverables` is the single source of truth for this
    // split (shared with the re-render script) — it prefers the Humanizer's
    // rewrite when it ran untruncated, else the lead's bounded section, and
    // harvests the werklijst from the whole team body. Both outputs pass through
    // client-facing/worklist sanitisation, so no internal content leaks to the
    // client and no QC meta bleeds into the werklijst.
    const reportHumanized = humanizedUntruncated(dc);
    const { clientReport, internalWorklist } = splitReportDeliverables(teamWork, {
      memberTitles: dc.memberTitles,
      humanizerTitle: dc.humanizerTitle,
      humanizerRan: reportHumanized,
    });
    if (!clientReport) {
      throw new Error(
        "De klantgerichte rapportversie is leeg na het verwijderen van interne/placeholder-secties; rapport niet verzonden.",
      );
    }

    // The period the report covers, as a human label. Prefer the snapshot's
    // Search Console period (real numbers); fall back to a cadence word.
    const periodLabel =
      dc.reportSeoPeriodLabel.trim() ||
      (cadence === "quarterly" ? "vorig kwartaal" : "vorige maand");

    // Short Dutch cover email summarising the report, generated by the model.
    let emailBody = "";
    try {
      const emailMsg = await anthropic.messages.create(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 1200,
          system: [
            "Je bent accountmanager bij Saerens Advertising, een Belgisch digitaal marketingbureau.",
            `Schrijf een korte, professionele begeleidende e-mail (in het Nederlands/Vlaams) bij het SEO-/website-${cadenceWord}rapport van een klant.`,
            "Het rapport gaat over organische zoekprestaties (Search Console), technische websitegezondheid en sitesnelheid — NIET over Google Ads.",
            "De volledige analyse zit als PDF in bijlage — vat in de e-mail enkel de 3 à 5 belangrijkste punten samen (resultaten, opvallende wijzigingen, voorgestelde volgende stappen).",
            "Gebruik GEEN emoji's. Geen markdown-koppen. Begin met een aanhef en eindig met een professionele afsluiting namens Saerens Advertising.",
            "Hou het onder ~200 woorden. Geef enkel de e-mailtekst terug, zonder onderwerpregel.",
          ].join("\n"),
          messages: [
            {
              role: "user",
              content: `Klant: ${dc.clientName}\nPeriode: ${periodLabel}\n\nKlantgericht rapport:\n\n${clientReport}`,
            },
          ],
        },
        { signal: dc.signal },
      );
      emailBody = emailMsg.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim();
      actionIn = emailMsg.usage?.input_tokens ?? null;
      actionOut = emailMsg.usage?.output_tokens ?? null;
    } catch (bodyErr) {
      if (bodyErr instanceof Error && bodyErr.name === "AbortError") throw bodyErr;
      // Fall back to a minimal cover note so the report still goes out.
      emailBody = `Beste,\n\nIn bijlage vind je het SEO-/website-${cadenceWord}rapport van ${dc.clientName} (${periodLabel}). De volledige analyse staat in de PDF.\n\nMet vriendelijke groeten,\nSaerens Advertising`;
    }

    const dateLabel = new Date().toLocaleDateString("nl-BE", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const subject = `${seoReportEyebrow(cadence)} ${dc.clientName} — ${periodLabel}`;

    if (dc.isGone()) throw new Error("Afgebroken voor opslag.");

    // Human approval checkpoint: do NOT send. Snapshot everything needed to
    // render + send later, and HOLD it. The PDF is rendered at approval time
    // from this payload, so nothing reaches the client unattended. Freeze the
    // responsible Head's email identity (derived from the lead agent's
    // department) so the held draft is sent FROM that Head with the owner in CC.
    const identity = await resolveHeadIdentity(dc.teamPaths[0]);
    const payload: SeoReportDeliveryPayload = {
      kind: "seo-report",
      recipient,
      subject,
      clientName: dc.clientName,
      cadence,
      periodLabel,
      dateLabel,
      emailBody,
      clientReport,
      internalWorklist,
      metrics: dc.reportSeoMetrics,
      fromName: identity?.displayName,
      fromAddress: identity?.address ?? undefined,
      cc: ownerEmail() ?? undefined,
      signature: identity?.signature,
      headAgentPath: identity?.headAgentPath ?? dc.teamPaths[0],
    };
    approval = { status: "pending", payload: JSON.stringify(payload) };
    dc.send({ type: "deliverable_done", truncated: false });
    // Surface the held draft + the internal reviewer verdict so a human can
    // decide before it goes out. The reviewer text is the QC gate's output.
    dc.send({
      type: "approval_required",
      recipient,
      clientReport,
      reviewerVerdict: dc.reviewerText.trim() || null,
    });
  } catch (err) {
    if (dc.isGone() || (err instanceof Error && err.name === "AbortError")) {
      actionStatus = "aborted";
    } else {
      actionStatus = "failed";
      actionError = (err instanceof Error ? err.message : String(err)).slice(
        0,
        500,
      );
      dc.send({ type: "deliverable_error", message: actionError });
    }
  }
  return {
    step: {
      agentPath: dc.workflowPath,
      agentTitle:
        actionStatus === "completed"
          ? `${seoReportEyebrow(cadence)} opgesteld — wacht op goedkeuring`
          : startLabel,
      role: "deliverable",
      status: actionStatus,
      durationMs: Date.now() - actionStartedAt,
      inputTokens: actionIn,
      outputTokens: actionOut,
      charCount: null,
      errorMessage: actionError,
    },
    // Drafting the report succeeded even though it is held for approval, so the
    // run itself stays "completed"; only a real drafting failure marks it
    // partial. The held send is tracked by approvalStatus, not run status.
    downgrade: actionStatus !== "completed",
    approval,
  };
}

/**
 * Action deliverable (Phase 2): hold a team-drafted REPLY to an inbound client
 * message. Same human-approval checkpoint as the monthly report — nothing is
 * sent here — but the snapshot carries the threading headers so the approved
 * reply lands in the original Gmail conversation.
 */
export async function runEmailReplyAction(
  dc: DeliverableExecContext,
): Promise<ActionEffect> {
  const actionStartedAt = Date.now();
  let actionStatus = "completed";
  let actionError: string | null = null;
  let approval: ActionEffect["approval"] = null;
  const er = dc.emailReply ?? null;
  try {
    dc.send({ type: "deliverable_start", deliverable: { title: "Antwoord opstellen" } });
    if (!er) {
      throw new Error(
        "Geen e-mailthread-context voor dit antwoord (interne fout).",
      );
    }
    const teamWork = dc.deliverableSource.trim();
    if (!teamWork) {
      throw new Error("Het team leverde geen antwoord om te versturen.");
    }

    // Client-facing: strip internal/placeholder sections, and prefer the
    // Humanizer's rewritten section over the raw specialist text when it ran
    // without truncation (mirrors the monthly-report body selection).
    const replyHumanized = humanizedUntruncated(dc);
    const replyTitles = replyHumanized
      ? [...dc.memberTitles, dc.humanizerTitle]
      : dc.memberTitles;
    const replyFinal = replyHumanized
      ? stripHumanizerMeta(extractFinalReport(teamWork, replyTitles))
      : extractFinalReport(teamWork, replyTitles);
    const replyBody = toClientFacingReport(replyFinal);
    if (!replyBody) {
      throw new Error(
        "Het klantgerichte antwoord is leeg na het verwijderen van interne/placeholder-secties; niet verzonden.",
      );
    }

    if (dc.isGone()) throw new Error("Afgebroken voor opslag.");

    // Freeze the responsible Head's identity (same derivation as the report)
    // so the held reply is sent FROM that Head with the owner in CC.
    const identity = await resolveHeadIdentity(dc.teamPaths[0]);
    const payload: EmailReplyPayload = {
      kind: "email-reply",
      recipient: er.recipient,
      subject: er.subject,
      clientName: dc.clientName,
      replyBody,
      inboundText: er.inboundText,
      fromName: identity?.displayName,
      fromAddress: identity?.address ?? undefined,
      cc: ownerEmail() ?? undefined,
      signature: identity?.signature,
      headAgentPath: identity?.headAgentPath ?? dc.teamPaths[0],
      threadId: er.gmailThreadId,
      inReplyTo: er.inReplyTo ?? undefined,
      references: er.references ?? undefined,
      emailThreadId: er.emailThreadId,
    };
    approval = { status: "pending", payload: JSON.stringify(payload) };
    dc.send({ type: "deliverable_done", truncated: false });
    // Surface the inbound message + the held reply draft + the internal
    // reviewer verdict so a human can decide before it goes out.
    dc.send({
      type: "approval_required",
      recipient: er.recipient,
      clientReport: replyBody,
      reviewerVerdict: dc.reviewerText.trim() || null,
    });
  } catch (err) {
    if (dc.isGone() || (err instanceof Error && err.name === "AbortError")) {
      actionStatus = "aborted";
    } else {
      actionStatus = "failed";
      actionError = (err instanceof Error ? err.message : String(err)).slice(
        0,
        500,
      );
      dc.send({ type: "deliverable_error", message: actionError });
    }
  }
  return {
    step: {
      agentPath: dc.workflowPath,
      agentTitle:
        actionStatus === "completed"
          ? "Antwoord opgesteld — wacht op goedkeuring"
          : "Antwoord opstellen",
      role: "deliverable",
      status: actionStatus,
      durationMs: Date.now() - actionStartedAt,
      inputTokens: null,
      outputTokens: null,
      charCount: null,
      errorMessage: actionError,
    },
    downgrade: actionStatus !== "completed",
    approval,
  };
}
