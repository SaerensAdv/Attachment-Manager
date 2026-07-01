import { renderReportPdf } from "./report-pdf";
import {
  createGmailDraft,
  type CreateDraftResult,
  type SendEmailInput,
} from "./email";
import type { SeoReportCadence, SeoReportMetrics } from "./seo-report-data";
import {
  buildBrandedEmail,
  resolveHeadPortrait,
} from "./monthly-report-email";
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
