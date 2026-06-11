import { renderReportPdf } from "./report-pdf";
import { sendEmail } from "./email";
import type { GoogleAdsMetrics } from "./google-ads";

/**
 * Building and sending the client-facing monthly report e-mail lives here, apart
 * from the generation engine, because the send is gated behind a human approval
 * checkpoint. The engine drafts the report + cover e-mail and HOLDS a
 * `ReportDeliveryPayload` snapshot on the run; the approval route later renders
 * the PDF and sends it via `deliverMonthlyReport`. Keeping the assembly here
 * means the held draft and the actual send share one implementation.
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
  return {
    recipient,
    subject,
    clientName,
    periodLabel: typeof p.periodLabel === "string" ? p.periodLabel : "",
    dateLabel: typeof p.dateLabel === "string" ? p.dateLabel : "",
    emailBody: typeof p.emailBody === "string" ? p.emailBody : "",
    clientReport,
    metrics: (p.metrics ?? null) as GoogleAdsMetrics | null,
  };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Build a Saerens-branded, email-client-safe HTML body (inline styles only). */
export function buildBrandedEmail(args: {
  clientName: string;
  periodLabel: string;
  dateLabel: string;
  bodyText: string;
  metrics: GoogleAdsMetrics | null;
}): string {
  const { clientName, periodLabel, dateLabel, bodyText, metrics } = args;
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
  if (metrics) {
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
    const kpis: { label: string; value: string }[] = [
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
    // header band
    `<tr><td style="background:${NEARBLACK};padding:26px 32px;border-bottom:3px solid ${PURPLE};">` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;letter-spacing:2px;color:#FFFFFF;">SAERENS ADVERTISING</div>` +
    `</td></tr>` +
    // title
    `<tr><td style="padding:28px 32px 6px;">` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${PURPLE};font-weight:bold;">Maandrapport Google Ads</div>` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:bold;color:${INK};margin-top:6px;">${escapeHtml(
      clientName,
    )}</div>` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${MUTED};margin-top:4px;">${escapeHtml(
      periodLabel,
    )} · ${escapeHtml(dateLabel)}</div>` +
    `</td></tr>` +
    // body
    `<tr><td style="padding:18px 32px 4px;">${kpiBlock}${paragraphs}</td></tr>` +
    // footer
    `<tr><td style="padding:18px 32px 26px;border-top:1px solid ${HAIR};">` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:${MUTED};">` +
    `Het volledige rapport vind je in de bijgevoegde PDF.<br>Saerens Advertising · Google Ads` +
    `</div></td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}

/**
 * Render the held report to a branded PDF + HTML cover and e-mail it to the
 * client's report recipient. Called only after a human approves the held draft;
 * throws on a bad recipient (header injection) or a send failure so the caller
 * can keep the draft pending and surface the error.
 */
export async function deliverMonthlyReport(
  payload: ReportDeliveryPayload,
): Promise<void> {
  const pdf = await renderReportPdf(payload.clientReport, {
    clientName: payload.clientName,
    subtitle: `Maandrapport — ${payload.periodLabel}`,
    dateLabel: payload.dateLabel,
    metrics: payload.metrics,
  });

  const html = buildBrandedEmail({
    clientName: payload.clientName,
    periodLabel: payload.periodLabel,
    dateLabel: payload.dateLabel,
    bodyText: payload.emailBody,
    metrics: payload.metrics,
  });

  const filename = `maandrapport-${payload.clientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}.pdf`;

  await sendEmail({
    to: payload.recipient,
    subject: payload.subject,
    html,
    attachments: [
      { filename, mimeType: "application/pdf", content: pdf },
    ],
  });
}
