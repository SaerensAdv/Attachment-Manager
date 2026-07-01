import { renderReportPdf } from "./report-pdf";
import {
  createGmailDraft,
  sendEmail,
  type CreateDraftResult,
  type SendEmailInput,
} from "./email";
import type { SeoReportCadence, SeoReportMetrics } from "./seo-report-data";
import {
  buildBrandedEmail,
  escapeHtml,
  resolveHeadPortrait,
} from "./monthly-report-email";
import { ownerEmail } from "./email-identity";
import { SAERENS_LOGO_CID, saerensLogoInlineImage } from "./brand-logo";

/**
 * Building the client-facing recurring SEO/website report e-mail lives here,
 * apart from the generation engine, because delivery is gated behind the same
 * human-approval checkpoint as the monthly Ads report. The engine drafts the
 * report + cover e-mail and HOLDS a `SeoReportDeliveryPayload` snapshot on the
 * run; after approval the route renders the PDF and places the e-mail as a Gmail
 * DRAFT (under the agency mailbox) via `draftSeoReport`, so the owner does the
 * final send from Gmail himself.
 *
 * This mirrors `monthly-report-email.ts` but for the organic/SEO report: the PDF
 * and e-mail are rendered with `reportType: "seo"` and the SEO KPI strip, and
 * the payload carries the report cadence (monthly vs quarterly) plus the
 * structured SEO snapshot instead of Google Ads metrics.
 */

/**
 * Everything needed to render + send the recurring SEO report, snapshotted when
 * the team finishes so the send can happen later (after approval) without
 * re-running the model. Persisted as JSON in `generations.pendingDelivery`. The
 * `kind` discriminant lets the approval route tell it apart from the Ads report
 * and the inbound-reply payloads.
 */
export interface SeoReportDeliveryPayload {
  kind: "seo-report";
  recipient: string;
  subject: string;
  clientName: string;
  /** Monthly vs quarterly — drives the eyebrow ("SEO-rapport" / "…kwartaal…"). */
  cadence: SeoReportCadence;
  periodLabel: string;
  dateLabel: string;
  /** The model-written cover e-mail body (plain text, no subject line). */
  emailBody: string;
  /** The client-facing report markdown that becomes the attached PDF. */
  clientReport: string;
  /**
   * The internal "werklijst" markdown — the technical actions for the agency +
   * web developer, captured from the team's internal section. NEVER attached to
   * the client e-mail; rendered as a separate internal PDF. Optional and
   * back-compatible: older held payloads simply carry none.
   */
  internalWorklist?: string | null;
  /** Structured SEO snapshot; drives the PDF cover + charts + KPI strip. */
  metrics: SeoReportMetrics | null;
  // Sender identity (the responsible Head) + owner CC, snapshotted at run time
  // so the held draft sends from the right Head after approval. All optional:
  // when absent the mail falls back to the primary mailbox with no CC.
  /** Full "From" display name, e.g. "Sara — SEO, Saerens Advertising". */
  fromName?: string;
  /** Derived alias address; only honoured as a verified Gmail "send as". */
  fromAddress?: string;
  /** Agency owner kept in CC. */
  cc?: string;
  /** Plain-text footer signature (Head name + role). */
  signature?: string;
  /** The Head agent's doc path — used to route inbound replies. */
  headAgentPath?: string;
}

/** Narrow an arbitrary JSON value into a SeoReportDeliveryPayload, or null. */
export function parseSeoReportDeliveryPayload(
  raw: unknown,
): SeoReportDeliveryPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (p.kind !== "seo-report") return null;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim().length > 0 ? v : null;
  const recipient = str(p.recipient);
  const subject = str(p.subject);
  const clientName = str(p.clientName);
  const clientReport = str(p.clientReport);
  if (!recipient || !subject || !clientName || !clientReport) return null;
  const optStr = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim().length > 0 ? v : undefined;
  const cadence: SeoReportCadence =
    p.cadence === "quarterly" ? "quarterly" : "monthly";
  return {
    kind: "seo-report",
    recipient,
    subject,
    clientName,
    cadence,
    periodLabel: typeof p.periodLabel === "string" ? p.periodLabel : "",
    dateLabel: typeof p.dateLabel === "string" ? p.dateLabel : "",
    emailBody: typeof p.emailBody === "string" ? p.emailBody : "",
    clientReport,
    internalWorklist:
      typeof p.internalWorklist === "string" &&
      p.internalWorklist.trim().length > 0
        ? p.internalWorklist
        : null,
    metrics: (p.metrics ?? null) as SeoReportMetrics | null,
    // Carry the snapshotted sender identity through, or the held draft would
    // lose its From/Cc/signature when re-read at approval time and send from
    // the primary mailbox instead of the responsible Head.
    fromName: optStr(p.fromName),
    fromAddress: optStr(p.fromAddress),
    cc: optStr(p.cc),
    signature: optStr(p.signature),
    headAgentPath: optStr(p.headAgentPath),
  };
}

/** The uppercase eyebrow for the SEO report cover/email, by cadence. */
export function seoReportEyebrow(cadence: SeoReportCadence): string {
  return cadence === "quarterly" ? "SEO-kwartaalrapport" : "SEO-maandrapport";
}

/** The four headline KPI cells for the SEO report email strip (null -> none). */
export function seoEmailKpis(
  metrics: SeoReportMetrics | null,
): { label: string; value: string }[] | null {
  if (!metrics) return null;
  const s = metrics.search.current;
  const intf = (n: number): string =>
    new Intl.NumberFormat("nl-BE").format(Math.round(n));
  const dec1 = (n: number): string =>
    new Intl.NumberFormat("nl-BE", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(n);
  return [
    { label: "Org. klikken", value: intf(s.clicks) },
    { label: "Vertoningen", value: intf(s.impressions) },
    { label: "CTR", value: `${dec1(s.ctr * 100)}%` },
    { label: "Gem. positie", value: dec1(s.position) },
  ];
}

/**
 * Assemble the SEO report e-mail from the held snapshot: render the branded PDF
 * (reportType "seo"), build the email-client-safe HTML cover with the SEO KPI
 * strip, embed the SA logo (+ the Head's portrait when available) and set From
 * (the responsible Head) / Cc (the owner) / subject. Kept separate so the draft
 * path uses exactly the same assembled mail.
 */
async function buildSeoReportEmailInput(
  payload: SeoReportDeliveryPayload,
): Promise<SendEmailInput> {
  const subtitlePrefix =
    payload.cadence === "quarterly" ? "SEO-kwartaalrapport" : "SEO-maandrapport";
  const pdf = await renderReportPdf(payload.clientReport, {
    clientName: payload.clientName,
    subtitle: `${subtitlePrefix} — ${payload.periodLabel}`,
    dateLabel: payload.dateLabel,
    reportType: "seo",
    seo: payload.metrics,
  });

  // Always embed the SA logo (header lockup); embed the Head's portrait when
  // available (footer signature). Both best-effort: a missing portrait -> the
  // signature renders text-only.
  const logo = saerensLogoInlineImage();
  const portrait = await resolveHeadPortrait(payload.headAgentPath);
  const inlineImages = portrait ? [logo, portrait] : [logo];

  const html = buildBrandedEmail({
    clientName: payload.clientName,
    eyebrow: seoReportEyebrow(payload.cadence),
    periodLabel: payload.periodLabel,
    dateLabel: payload.dateLabel,
    bodyText: payload.emailBody,
    kpis: seoEmailKpis(payload.metrics),
    signature: payload.signature,
    fallbackSignature: "Saerens Advertising · SEO & website",
    portraitCid: portrait?.cid,
    logoCid: SAERENS_LOGO_CID,
  });

  const cadenceSlug = payload.cadence === "quarterly" ? "kwartaal" : "maand";
  const filename = `seo-${cadenceSlug}rapport-${payload.clientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}.pdf`;

  return {
    to: payload.recipient,
    subject: payload.subject,
    html,
    fromAddress: payload.fromAddress,
    fromName: payload.fromName,
    cc: payload.cc,
    attachments: [{ filename, mimeType: "application/pdf", content: pdf }],
    inlineImages,
  };
}

/**
 * Render the held SEO report and place it as a Gmail DRAFT in the agency mailbox
 * instead of sending it: the owner reviews and does the final send from Gmail
 * himself. Called only after a human approves the held draft; throws on a bad
 * recipient (header injection) or a draft-API failure so the caller can keep the
 * snapshot pending and surface the error.
 */
export async function draftSeoReport(
  payload: SeoReportDeliveryPayload,
): Promise<CreateDraftResult> {
  return createGmailDraft(await buildSeoReportEmailInput(payload));
}

/**
 * Render the internal "werklijst" (the technical actions for the agency + web
 * developer) as its own branded PDF (reportType "internal") and SEND it straight
 * to the agency owner (OWNER_EMAIL) — never to the client. Called alongside the
 * client-report draft at approval time so the owner gets the technical follow-up
 * list in his own inbox. Sent directly (not drafted) because the only recipient
 * is the owner himself.
 *
 * Best-effort by contract: returns `{ status: "sent" }` on success, or
 * `{ status: "skipped", reason }` when there is nothing to send (no worklist
 * captured) or no owner address is configured. Throws ONLY when the Gmail send
 * itself fails, so the caller can turn that into a "Te doen" alert without ever
 * reverting the already-approved client delivery.
 */
export async function sendSeoWorklistToOwner(
  payload: SeoReportDeliveryPayload,
): Promise<{ status: "sent" | "skipped"; reason?: string }> {
  const worklist = payload.internalWorklist?.trim();
  if (!worklist) return { status: "skipped", reason: "no-worklist" };
  const owner = ownerEmail();
  if (!owner) return { status: "skipped", reason: "no-owner-email" };

  const subtitlePrefix =
    payload.cadence === "quarterly" ? "SEO-kwartaalrapport" : "SEO-maandrapport";
  const pdf = await renderReportPdf(worklist, {
    clientName: payload.clientName,
    subtitle: `Interne werklijst — ${payload.periodLabel}`,
    dateLabel: payload.dateLabel,
    reportType: "internal",
  });

  const cadenceSlug = payload.cadence === "quarterly" ? "kwartaal" : "maand";
  const slug = payload.clientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const filename = `interne-werklijst-${slug}-${cadenceSlug}.pdf`;

  const safeName = escapeHtml(payload.clientName);
  const safePeriod = escapeHtml(payload.periodLabel);
  const html =
    `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;">` +
    `<p>Interne werklijst voor <strong>${safeName}</strong> — ${safePeriod}.</p>` +
    `<p>De technische actiepunten voor het bureau en de webbouwer staan in de bijgevoegde PDF. Deze lijst gaat niet naar de klant.</p>` +
    `<p style="color:#666;">Automatisch verstuurd na goedkeuring van het ${escapeHtml(
      subtitlePrefix.toLowerCase(),
    )} — Saerens Advertising.</p>` +
    `</body></html>`;

  await sendEmail({
    to: owner,
    subject: `Interne werklijst — ${payload.clientName} — ${payload.periodLabel}`,
    html,
    attachments: [{ filename, mimeType: "application/pdf", content: pdf }],
  });
  return { status: "sent" };
}
