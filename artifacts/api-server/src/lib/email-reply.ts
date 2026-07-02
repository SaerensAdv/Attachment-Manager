import { createGmailDraft, type CreateDraftResult } from "./email";
import {
  escapeHtml,
  headerLogo,
  resolveHeadPortrait,
  signatureBand,
} from "./monthly-report-email";
import { saerensLogoUrl } from "./brand-logo";

/**
 * The second kind of human-gated client email: a REPLY drafted by the team in
 * response to an inbound client message (Phase 2). It shares the exact same
 * approval checkpoint as the monthly report — nothing reaches the client until
 * the owner approves — but carries the threading headers needed to stage the
 * reply as a Gmail draft in the original conversation.
 *
 * `pendingDelivery` on a generation is therefore a small tagged union: a held
 * draft with `kind: "email-reply"` is an EmailReplyPayload; anything else (no
 * `kind`) is the original monthly-report payload, so old held drafts keep
 * working unchanged.
 */
export interface EmailReplyPayload {
  kind: "email-reply";
  recipient: string;
  subject: string;
  clientName: string;
  /** The model-written reply body (plain text). */
  replyBody: string;
  /** The client's inbound message text, kept so a human can review in context. */
  inboundText: string;
  // Sender identity (the responsible Head) + owner CC — same shape as the report.
  fromName?: string;
  fromAddress?: string;
  cc?: string;
  signature?: string;
  headAgentPath?: string;
  // Threading: keep the reply in the same Gmail conversation.
  /** Gmail threadId to attach this reply to. */
  threadId?: string;
  /** Message-ID of the client message we are replying to. */
  inReplyTo?: string;
  /** Space-separated References chain (the thread's Message-IDs so far). */
  references?: string;
  /** FK to the email_threads row this conversation belongs to (Phase 2). */
  emailThreadId?: number;
}

/**
 * Discriminate a parsed `pendingDelivery` JSON value. Held drafts are tagged by
 * `kind` ("email-reply", "seo-report"); everything else (including legacy drafts
 * written before this union existed) is treated as a monthly report.
 */
export function pendingDeliveryKind(
  raw: unknown,
): "monthly-report" | "email-reply" | "seo-report" {
  if (raw && typeof raw === "object") {
    const kind = (raw as Record<string, unknown>).kind;
    if (kind === "email-reply") return "email-reply";
    if (kind === "seo-report") return "seo-report";
  }
  return "monthly-report";
}

/** Narrow an arbitrary JSON value into an EmailReplyPayload, or null. */
export function parseEmailReplyPayload(raw: unknown): EmailReplyPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (p.kind !== "email-reply") return null;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim().length > 0 ? v : null;
  const optStr = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim().length > 0 ? v : undefined;
  const recipient = str(p.recipient);
  const subject = str(p.subject);
  const clientName = str(p.clientName);
  const replyBody = str(p.replyBody);
  if (!recipient || !subject || !clientName || !replyBody) return null;
  return {
    kind: "email-reply",
    recipient,
    subject,
    clientName,
    replyBody,
    inboundText: typeof p.inboundText === "string" ? p.inboundText : "",
    fromName: optStr(p.fromName),
    fromAddress: optStr(p.fromAddress),
    cc: optStr(p.cc),
    signature: optStr(p.signature),
    headAgentPath: optStr(p.headAgentPath),
    threadId: optStr(p.threadId),
    inReplyTo: optStr(p.inReplyTo),
    references: optStr(p.references),
    emailThreadId:
      typeof p.emailThreadId === "number" && Number.isInteger(p.emailThreadId)
        ? p.emailThreadId
        : undefined,
  };
}

/** Build a Saerens-branded, email-client-safe HTML reply (inline styles only). */
export function buildReplyEmail(args: {
  bodyText: string;
  signature?: string;
  /** Content-ID of the Head's embedded portrait (footer signature only). */
  portraitCid?: string;
  /** Absolute HTTPS URL of the SA logo (header lockup); omitted -> no logo. */
  logoUrl?: string;
}): string {
  const NEARBLACK = "#0A0A0B";
  const PURPLE = "#716BEB";
  const INK = "#1A1A22";
  const MUTED = "#6B6B72";
  const HAIR = "#E4E2EE";

  const paragraphs = args.bodyText
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

  const footer =
    args.signature && args.signature.trim()
      ? escapeHtml(args.signature.trim()).replace(/\n/g, "<br>")
      : "Saerens Advertising";

  return (
    `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F5F5F8;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F8;padding:24px 0;">` +
    `<tr><td align="center">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#FFFFFF;border-radius:10px;overflow:hidden;border:1px solid ${HAIR};">` +
    `<tr><td style="background:${NEARBLACK};padding:22px 32px;border-bottom:3px solid ${PURPLE};">` +
    `<table role="presentation" cellpadding="0" cellspacing="0"><tr>` +
    headerLogo(args.logoUrl) +
    `<td valign="middle"><div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;letter-spacing:2px;color:#FFFFFF;">SAERENS ADVERTISING</div></td>` +
    `</tr></table>` +
    `</td></tr>` +
    `<tr><td style="padding:26px 32px 6px;">${paragraphs}</td></tr>` +
    signatureBand({
      portraitCid: args.portraitCid,
      hair: HAIR,
      muted: MUTED,
      textHtml: footer,
    }) +
    `</table></td></tr></table></body></html>`
  );
}

/**
 * Stage a team-drafted reply as a Gmail DRAFT in the original conversation
 * (threaded via threadId + In-Reply-To/References) instead of sending it: the
 * owner reviews it in the app, then does the final send from Gmail himself.
 * Called only after a human approves the held draft; throws on a bad recipient
 * or a draft-API failure so the caller can keep the held draft pending and
 * surface the error. Returns the draft's Gmail thread + Message-ID so the
 * conversation can be tracked for the next inbound reply.
 */
export async function draftEmailReply(
  payload: EmailReplyPayload,
): Promise<CreateDraftResult> {
  // Reference the SA logo by public HTTPS URL (Gmail drops `cid:` inline logos
  // after send). Embed only the Head's portrait when available (footer
  // signature); best-effort -> a missing portrait renders the signature
  // text-only, a missing public base URL renders no logo.
  const portrait = await resolveHeadPortrait(payload.headAgentPath);
  const inlineImages = portrait ? [portrait] : [];
  const html = buildReplyEmail({
    bodyText: payload.replyBody,
    signature: payload.signature,
    portraitCid: portrait?.cid,
    logoUrl: saerensLogoUrl() ?? undefined,
  });
  return createGmailDraft({
    to: payload.recipient,
    subject: payload.subject,
    html,
    fromAddress: payload.fromAddress,
    fromName: payload.fromName,
    cc: payload.cc,
    inReplyTo: payload.inReplyTo,
    references: payload.references,
    threadId: payload.threadId,
    inlineImages,
  });
}
