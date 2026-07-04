import sharp from "sharp";
import { renderReportPdf } from "./report-pdf";
import {
  createGmailDraft,
  type CreateDraftResult,
  type InlineImage,
  type SendEmailInput,
} from "./email";
import type { GoogleAdsMetrics } from "./google-ads";
import { loadPortraitBytes } from "./portraits";
import { saerensLogoUrl } from "./brand-logo";

/**
 * Building the client-facing monthly report e-mail lives here, apart from the
 * generation engine, because delivery is gated behind a human approval
 * checkpoint. The engine drafts the report + cover e-mail and HOLDS a
 * `ReportDeliveryPayload` snapshot on the run; after approval the route renders
 * the PDF and places the e-mail as a Gmail DRAFT (under the agency mailbox) via
 * `draftMonthlyReport`, so the owner does the final send from Gmail himself.
 */

/**
 * Everything needed to render + send the monthly report, snapshotted when the
 * team finishes so the send can happen later (after approval) without re-running
 * the model. Persisted as JSON in `generations.pendingDelivery`.
 */
export interface ReportDeliveryPayload {
  recipient: string;
  subject: string;
  clientName: string;
  periodLabel: string;
  dateLabel: string;
  /** The model-written cover e-mail body (plain text, no subject line). */
  emailBody: string;
  /** The client-facing report markdown that becomes the attached PDF. */
  clientReport: string;
  metrics: GoogleAdsMetrics | null;
  // Sender identity, snapshotted at run time so the held draft sends correctly
  // after approval. Client mail is signed by the agency OWNER (Axel); these
  // fields carry that owner identity. All optional: when absent the mail falls
  // back to the primary mailbox.
  /** Full "From" display name, e.g. "Axel Saerens — Saerens Advertising". */
  fromName?: string;
  /** Sender address (the owner); only honoured as a verified Gmail "send as". */
  fromAddress?: string;
  /** Optional extra CC (unused for owner-signed mail; kept for back-compat). */
  cc?: string;
  /** Plain-text footer signature (owner name + agency). */
  signature?: string;
  /** The responsible Head's doc path — routes inbound replies back to the team. */
  headAgentPath?: string;
}

/** Narrow an arbitrary JSON value into a ReportDeliveryPayload, or null. */
export function parseReportDeliveryPayload(
  raw: unknown,
): ReportDeliveryPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim().length > 0 ? v : null;
  const recipient = str(p.recipient);
  const subject = str(p.subject);
  const clientName = str(p.clientName);
  const clientReport = str(p.clientReport);
  if (!recipient || !subject || !clientName || !clientReport) return null;
  const optStr = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim().length > 0 ? v : undefined;
  return {
    recipient,
    subject,
    clientName,
    periodLabel: typeof p.periodLabel === "string" ? p.periodLabel : "",
    dateLabel: typeof p.dateLabel === "string" ? p.dateLabel : "",
    emailBody: typeof p.emailBody === "string" ? p.emailBody : "",
    clientReport,
    metrics: (p.metrics ?? null) as GoogleAdsMetrics | null,
    // Carry the snapshotted sender identity (the owner) through, or the held
    // draft would lose its From/signature when re-read at approval time and
    // fall back to the primary mailbox with no signature.
    fromName: optStr(p.fromName),
    fromAddress: optStr(p.fromAddress),
    cc: optStr(p.cc),
    signature: optStr(p.signature),
    headAgentPath: optStr(p.headAgentPath),
  };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * The footer sentence pointing the reader at the attached PDF(s), pluralised for
 * nl-BE: a single attachment reads "de bijgevoegde PDF", multiple reads "de
 * bijgevoegde PDF's" (e.g. a combined monthly + quarterly send). Defaults to the
 * singular when the count is unknown.
 */
export function attachmentIntro(count?: number): string {
  const n = typeof count === "number" && count > 0 ? count : 1;
  return n > 1
    ? "De volledige rapporten vind je in de bijgevoegde PDF's."
    : "Het volledige rapport vind je in de bijgevoegde PDF.";
}

/**
 * The fixed Content-ID under which the Head's portrait is embedded; the HTML
 * refers to it as `cid:head-portrait`. A single inline image used by the footer
 * signature band.
 */
export const HEAD_PORTRAIT_CID = "head-portrait";

/**
 * Square size (px) of the embedded portrait thumbnail. The chip/signature render
 * at 44–56px, so this covers 2x DPR while keeping the inline image small enough
 * to clear the send proxy's request-size limit.
 */
const EMAIL_PORTRAIT_PX = 128;

/** Derive an agent slug (`agents/google-ads-strategist.md` -> the basename). */
export function slugFromAgentPath(path?: string): string | null {
  if (!path) return null;
  const base = path.split("/").pop() ?? "";
  const slug = base.replace(/\.md$/i, "").trim();
  return slug || null;
}

/**
 * Resolve the responsible Head's portrait as an inline image, or null when the
 * agent has no stored portrait / storage is unreachable. Best-effort: the email
 * renders without a photo when this returns null.
 */
export async function resolveHeadPortrait(
  headAgentPath?: string,
): Promise<InlineImage | null> {
  const slug = slugFromAgentPath(headAgentPath);
  if (!slug) return null;
  const bytes = await loadPortraitBytes(slug);
  if (!bytes) return null;
  // Embed a small, round-ready thumbnail rather than the full-size portrait: the
  // footer signature renders at 56px, so 128px covers 2x DPR while keeping the
  // MIME payload tiny. A full-res PNG trips the send
  // proxy's request-size limit with a 413, so if the resize fails we drop the
  // photo (text-only signature) rather than embed the raw bytes and risk failing
  // the whole, owner-approved send.
  try {
    const thumb = await sharp(bytes)
      .resize(EMAIL_PORTRAIT_PX, EMAIL_PORTRAIT_PX, { fit: "cover" })
      .png()
      .toBuffer();
    return { cid: HEAD_PORTRAIT_CID, mimeType: "image/png", content: thumb };
  } catch {
    return null;
  }
}

/**
 * The "SA" monogram chip for the dark header band, locked up to the LEFT of the
 * wordmark. Rendered only when the logo is embedded. Inline styles + explicit
 * dimensions so it renders in email clients that ignore CSS.
 */
export function headerLogo(logoUrl?: string): string {
  if (!logoUrl) return "";
  return (
    `<td valign="middle" style="width:40px;padding-right:12px;">` +
    `<img src="${escapeHtml(logoUrl)}" width="36" height="36" alt="Saerens Advertising" ` +
    `style="display:block;width:36px;height:36px;" />` +
    `</td>`
  );
}

/**
 * The footer signature band: the Head's round portrait beside the name/role
 * lines. Falls back to a text-only band when no portrait is embedded so the
 * signature always renders.
 */
export function signatureBand(args: {
  portraitCid?: string;
  textHtml: string;
  hair: string;
  muted: string;
}): string {
  const text =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;` +
    `line-height:1.5;color:${args.muted};">${args.textHtml}</div>`;
  if (!args.portraitCid) {
    return (
      `<tr><td style="padding:18px 32px 26px;border-top:1px solid ${args.hair};">` +
      `${text}</td></tr>`
    );
  }
  return (
    `<tr><td style="padding:18px 32px 26px;border-top:1px solid ${args.hair};">` +
    `<table role="presentation" cellpadding="0" cellspacing="0"><tr>` +
    `<td valign="top" style="padding-right:14px;">` +
    `<img src="cid:${args.portraitCid}" width="56" height="56" alt="" ` +
    `style="display:block;width:56px;height:56px;border-radius:50%;` +
    `object-fit:cover;border:1px solid ${args.hair};" />` +
    `</td>` +
    `<td valign="top">${text}</td>` +
    `</tr></table></td></tr>`
  );
}

/** Build a Saerens-branded, email-client-safe HTML body (inline styles only).
 * Report-agnostic: the eyebrow line and the (optional) KPI cells are supplied by
 * the caller so the same template serves the Ads and SEO reports. */
export function buildBrandedEmail(args: {
  clientName: string;
  /** Small uppercase eyebrow, e.g. "Maandrapport Google Ads" / "SEO-rapport". */
  eyebrow: string;
  periodLabel: string;
  dateLabel: string;
  bodyText: string;
  /** Headline KPI cells for the top strip; omitted/empty renders no strip. */
  kpis?: { label: string; value: string }[] | null;
  /** Footer signature (Head name + role); falls back to `fallbackSignature`. */
  signature?: string;
  /**
   * Agency line shown when no Head signature is set. Caller-supplied so the
   * channel is correct per report type (e.g. "· Google Ads" vs "· SEO &
   * website"); defaults to the plain agency name.
   */
  fallbackSignature?: string;
  /** Content-ID of the Head's embedded portrait (footer signature only). */
  portraitCid?: string;
  /** Absolute HTTPS URL of the SA logo (header lockup); omitted -> no logo. */
  logoUrl?: string;
  /**
   * Number of PDFs attached to the mail; drives the footer wording ("de
   * bijgevoegde PDF" vs "de bijgevoegde PDF's"). Defaults to 1.
   */
  attachmentCount?: number;
}): string {
  const { clientName, eyebrow, periodLabel, dateLabel, bodyText, kpis } = args;
  const NEARBLACK = "#0A0A0B";
  const INDIGO = "#29274E";
  const PURPLE = "#716BEB";
  const AMBER = "#F4A425";
  const INK = "#1A1A22";
  const MUTED = "#6B6B72";
  const HAIR = "#E4E2EE";

  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:${INK};">${escapeHtml(
          p,
        ).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

  let kpiBlock = "";
  if (kpis && kpis.length > 0) {
    const cells = kpis
      .map(
        (k) =>
          `<td style="padding:12px 10px;text-align:center;border:1px solid ${HAIR};">` +
          `<div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};">${escapeHtml(
            k.label,
          )}</div>` +
          `<div style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:${INDIGO};margin-top:4px;">${escapeHtml(
            k.value,
          )}</div>` +
          `</td>`,
      )
      .join("");
    kpiBlock =
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
      `style="border-collapse:collapse;margin:4px 0 22px;"><tr>${cells}</tr></table>`;
  }

  return (
    `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F5F5F8;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F8;padding:24px 0;">` +
    `<tr><td align="center">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#FFFFFF;border-radius:10px;overflow:hidden;border:1px solid ${HAIR};">` +
    // header band (SA logo + company wordmark lockup, left-aligned)
    `<tr><td style="background:${NEARBLACK};padding:22px 32px;border-bottom:3px solid ${PURPLE};">` +
    `<table role="presentation" cellpadding="0" cellspacing="0"><tr>` +
    headerLogo(args.logoUrl) +
    `<td valign="middle"><div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;letter-spacing:2px;color:#FFFFFF;">SAERENS ADVERTISING</div></td>` +
    `</tr></table>` +
    `</td></tr>` +
    // title
    `<tr><td style="padding:28px 32px 6px;">` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${PURPLE};font-weight:bold;">${escapeHtml(
      eyebrow,
    )}</div>` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:bold;color:${INK};margin-top:6px;">${escapeHtml(
      clientName,
    )}</div>` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${MUTED};margin-top:4px;">${escapeHtml(
      periodLabel,
    )} · ${escapeHtml(dateLabel)}</div>` +
    `</td></tr>` +
    // body
    `<tr><td style="padding:18px 32px 4px;">${kpiBlock}${paragraphs}</td></tr>` +
    // footer signature band (Head portrait + name/role)
    signatureBand({
      portraitCid: args.portraitCid,
      hair: HAIR,
      muted: MUTED,
      textHtml: `${attachmentIntro(args.attachmentCount)}<br>${
        args.signature && args.signature.trim()
          ? escapeHtml(args.signature.trim()).replace(/\n/g, "<br>")
          : escapeHtml(
              (args.fallbackSignature && args.fallbackSignature.trim()) ||
                "Saerens Advertising",
            )
      }`,
    }) +
    `</table></td></tr></table></body></html>`
  );
}

/** The four headline KPI cells for the Ads report email strip (null -> no strip). */
function adsEmailKpis(
  metrics: GoogleAdsMetrics | null,
): { label: string; value: string }[] | null {
  if (!metrics) return null;
  const cur = metrics.currency || "EUR";
  const eur = (n: number, d = 0): string => {
    try {
      return new Intl.NumberFormat("nl-BE", {
        style: "currency",
        currency: cur,
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      }).format(n);
    } catch {
      return `${n.toFixed(d)} ${cur}`;
    }
  };
  const intf = (n: number): string =>
    new Intl.NumberFormat("nl-BE").format(Math.round(n));
  return [
    { label: "Adspend", value: eur(metrics.totals.cost) },
    { label: "Leads", value: intf(metrics.totals.conversions) },
    {
      label: "Cost / lead",
      value: metrics.totals.cpa !== null ? eur(metrics.totals.cpa, 2) : "n.v.t.",
    },
    {
      label: "ROAS",
      value:
        metrics.totals.roas !== null
          ? `${new Intl.NumberFormat("nl-BE", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(metrics.totals.roas)}×`
          : "n.v.t.",
    },
  ];
}

/**
 * Assemble the report e-mail from the held snapshot: render the branded PDF,
 * build the email-client-safe HTML cover, embed the SA logo (+ the Head's
 * portrait when available) and set From (the responsible Head) / Cc (the owner) /
 * subject. Kept separate so the draft path uses exactly the same assembled mail.
 */
async function buildReportEmailInput(
  payload: ReportDeliveryPayload,
): Promise<SendEmailInput> {
  const pdf = await renderReportPdf(payload.clientReport, {
    clientName: payload.clientName,
    subtitle: `Maandrapport — ${payload.periodLabel}`,
    dateLabel: payload.dateLabel,
    reportType: "ads",
    metrics: payload.metrics,
  });

  // Reference the SA logo by public HTTPS URL (Gmail drops `cid:` inline logos
  // after send). Client email is owner-signed with a text-only footer, so no
  // portrait is embedded; a missing public base URL simply renders no logo.
  const inlineImages: InlineImage[] = [];

  const attachments = [
    { filename: filenameFor(payload.clientName), mimeType: "application/pdf", content: pdf },
  ];

  const html = buildBrandedEmail({
    clientName: payload.clientName,
    eyebrow: "Maandrapport Google Ads",
    periodLabel: payload.periodLabel,
    dateLabel: payload.dateLabel,
    bodyText: payload.emailBody,
    kpis: adsEmailKpis(payload.metrics),
    signature: payload.signature,
    fallbackSignature: "Saerens Advertising · Google Ads",
    portraitCid: undefined,
    logoUrl: saerensLogoUrl() ?? undefined,
    attachmentCount: attachments.length,
  });

  return {
    to: payload.recipient,
    subject: payload.subject,
    html,
    fromAddress: payload.fromAddress,
    fromName: payload.fromName,
    cc: payload.cc,
    attachments,
    inlineImages,
  };
}

/** The download filename for a client's monthly report PDF. */
function filenameFor(clientName: string): string {
  return `maandrapport-${clientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}.pdf`;
}

/**
 * Render the held report and place it as a Gmail DRAFT in the agency mailbox
 * (axel@…) instead of sending it: the owner reviews and does the final send from
 * Gmail himself. Called only after a human approves the held draft; throws on a
 * bad recipient (header injection) or a draft-API failure so the caller can keep
 * the snapshot pending and surface the error.
 *
 * Note: because the real send happens later, by hand in Gmail, the app does not
 * learn the sent Message-ID/threadId, so the monthly report is not tracked for
 * inbound-reply threading (unlike the in-thread reply path).
 */
export async function draftMonthlyReport(
  payload: ReportDeliveryPayload,
): Promise<CreateDraftResult> {
  return createGmailDraft(await buildReportEmailInput(payload));
}
