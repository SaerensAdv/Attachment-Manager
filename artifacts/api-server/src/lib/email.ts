import { randomUUID } from "node:crypto";
import { ReplitConnectors } from "@replit/connectors-sdk";

/**
 * Email sending via the Replit Gmail connector (integration: google-mail).
 *
 * The connectors SDK proxies authenticated requests to the Gmail REST API and
 * handles OAuth token injection/refresh — we never touch credentials directly.
 * We build a raw RFC 822 MIME message (multipart/mixed so we can attach the
 * report PDF) and hand it to users.messages.send as a base64url `raw` payload.
 *
 * Beyond a plain one-shot send, this supports the two-way agent↔client email
 * flow: a per-agent `From` identity, the owner in `Cc`, and the threading
 * headers (`In-Reply-To`/`References` + the Gmail `threadId`) needed to keep a
 * reply in the same conversation. We stamp our OWN `Message-ID` so the reply
 * chain can be persisted without a follow-up messages.get — Gmail preserves a
 * client-supplied Message-ID on raw sends.
 *
 * Note on `From`: the connector authenticates as the single connected mailbox.
 * Gmail honours a `From` alias only when it is a verified "send as" address on
 * that account; otherwise it silently rewrites it to the primary address. That
 * is fine here — inbound routing keys off the Gmail threadId, not the address.
 *
 * Never cache the client: tokens expire, so a fresh ReplitConnectors() is made
 * per send.
 */

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  content: Buffer;
}

/**
 * An image embedded INSIDE the HTML body (not a download). Referenced from the
 * markup as `<img src="cid:<cid>">` and carried as a `multipart/related` part
 * with a matching `Content-ID`. Used for the per-Head portrait so it renders
 * reliably in Gmail (remote/data: image sources are proxied or stripped).
 */
export interface InlineImage {
  /** Content-ID token (no angle brackets); the HTML refers to `cid:<cid>`. */
  cid: string;
  mimeType: string;
  content: Buffer;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  /** HTML body. */
  html: string;
  attachments?: EmailAttachment[];
  /** Images embedded in the HTML body via `cid:` references (see InlineImage). */
  inlineImages?: InlineImage[];
  /**
   * Sender address. Honoured only when it is a verified Gmail "send as" alias
   * on the connected mailbox; Gmail rewrites it to the primary otherwise.
   */
  fromAddress?: string;
  /** Display name shown before the sender address (e.g. the agent persona). */
  fromName?: string;
  /** Single CC recipient (e.g. the agency owner kept in the loop). */
  cc?: string;
  /** Reply-To address. */
  replyTo?: string;
  /** Message-ID we are replying to, as an RFC 822 `<id@domain>` token. */
  inReplyTo?: string;
  /** Space-separated References chain (the thread's Message-IDs). */
  references?: string;
  /** Gmail threadId to attach this message to an existing conversation. */
  threadId?: string;
  /**
   * Our own Message-ID header value. Generated when omitted, and always
   * returned so the caller can persist the conversation's threading chain.
   */
  messageId?: string;
}

export interface SendEmailResult {
  id: string;
  threadId: string;
  /** The Message-ID header value we stamped on the sent message. */
  messageId: string;
}

/**
 * Strip CR/LF (and other control chars) from a value destined for a single
 * header line. Prevents header/MIME injection: without this, a newline in
 * `to`/`subject`/filename could smuggle extra headers, recipients, or body
 * parts into the raw RFC 822 message.
 */
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n\u0000-\u001f\u007f]/g, " ").trim();
}

/** Encode a header value that may contain non-ASCII (e.g. Dutch) per RFC 2047. */
function encodeHeader(value: string): string {
  const safe = sanitizeHeaderValue(value);
  if (/^[\x00-\x7F]*$/.test(safe)) return safe;
  return `=?UTF-8?B?${Buffer.from(safe, "utf-8").toString("base64")}?=`;
}

/**
 * Encode an address display name: printable ASCII becomes a quoted-string (with
 * `\` and `"` removed so it can't break out of the quotes), anything else
 * becomes an RFC 2047 encoded-word. Either form is safe inside a header line.
 */
function encodeDisplayName(name: string): string {
  const safe = sanitizeHeaderValue(name);
  if (!safe) return "";
  if (/^[\x20-\x7E]*$/.test(safe)) {
    return `"${safe.replace(/[\\"]/g, "")}"`;
  }
  return `=?UTF-8?B?${Buffer.from(safe, "utf-8").toString("base64")}?=`;
}

/** Basic single-address validation; rejects anything with header-breaking chars. */
function assertValidAddress(addr: string): string {
  const safe = sanitizeHeaderValue(addr);
  if (safe !== addr.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safe)) {
    throw new Error(`Ongeldig e-mailadres: "${addr}".`);
  }
  return safe;
}

/** Format an optional display name + address into one safe header value. */
function formatAddress(address: string, name?: string): string {
  const addr = assertValidAddress(address);
  const display = name ? encodeDisplayName(name) : "";
  return display ? `${display} <${addr}>` : addr;
}

/** Split base64 into 76-char lines as required for MIME body parts. */
function chunk76(b64: string): string {
  return b64.replace(/.{76}/g, "$&\r\n");
}

/** A Message-ID like `<uuid@domain>`, using the sender domain when available. */
function generateMessageId(fromAddress?: string): string {
  const domain =
    fromAddress && fromAddress.includes("@")
      ? sanitizeHeaderValue(fromAddress.split("@")[1] ?? "")
      : "";
  return `<${randomUUID()}@${domain || "saerensadvertising.com"}>`;
}

/**
 * Build a raw RFC 822 MIME message and the Message-ID stamped on it. Exported
 * for unit testing of header construction, injection resistance, and threading.
 */
export function buildMime(input: SendEmailInput): {
  mime: string;
  messageId: string;
} {
  const boundary = `saerens_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2)}`;

  const messageId = input.messageId
    ? sanitizeHeaderValue(input.messageId)
    : generateMessageId(input.fromAddress);

  const headers: string[] = [];
  if (input.fromAddress) {
    headers.push(`From: ${formatAddress(input.fromAddress, input.fromName)}`);
  }
  headers.push(`To: ${assertValidAddress(input.to)}`);
  if (input.cc) headers.push(`Cc: ${assertValidAddress(input.cc)}`);
  if (input.replyTo) {
    headers.push(`Reply-To: ${assertValidAddress(input.replyTo)}`);
  }
  headers.push(`Subject: ${encodeHeader(input.subject)}`);
  headers.push(`Message-ID: ${messageId}`);
  if (input.inReplyTo) {
    headers.push(`In-Reply-To: ${sanitizeHeaderValue(input.inReplyTo)}`);
  }
  if (input.references) {
    headers.push(`References: ${sanitizeHeaderValue(input.references)}`);
  }
  headers.push("MIME-Version: 1.0");

  const inlineImages = input.inlineImages ?? [];
  const attachments = input.attachments ?? [];

  // A MIME part body (its own headers + encoded content), WITHOUT the leading
  // boundary delimiter — `wrap` adds the delimiters and closing marker.
  const htmlPart = [
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    chunk76(Buffer.from(input.html, "utf-8").toString("base64")),
  ].join("\r\n");

  const inlineParts = inlineImages.map((img) => {
    const cid = sanitizeHeaderValue(img.cid).replace(/[<>"]/g, "");
    const safeType = sanitizeHeaderValue(img.mimeType).replace(/"/g, "");
    return [
      `Content-Type: ${safeType}`,
      "Content-Transfer-Encoding: base64",
      `Content-ID: <${cid}>`,
      "Content-Disposition: inline",
      "",
      chunk76(img.content.toString("base64")),
    ].join("\r\n");
  });

  const attachmentParts = attachments.map((att) => {
    const safeName = sanitizeHeaderValue(att.filename).replace(/"/g, "");
    const safeType = sanitizeHeaderValue(att.mimeType).replace(/"/g, "");
    return [
      `Content-Type: ${safeType}; name="${safeName}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${safeName}"`,
      "",
      chunk76(att.content.toString("base64")),
    ].join("\r\n");
  });

  // Join part bodies into one multipart block delimited by `b`.
  const wrap = (b: string, partBodies: string[]): string =>
    `${partBodies.map((p) => `--${b}\r\n${p}`).join("\r\n")}\r\n--${b}--`;

  let topContentType: string;
  let bodyBlock: string;
  if (inlineImages.length === 0) {
    // No inline images: the original multipart/mixed { html, ...attachments }.
    topContentType = `multipart/mixed; boundary="${boundary}"`;
    bodyBlock = wrap(boundary, [htmlPart, ...attachmentParts]);
  } else if (attachments.length === 0) {
    // HTML + inline images only: a single multipart/related.
    topContentType = `multipart/related; boundary="${boundary}"`;
    bodyBlock = wrap(boundary, [htmlPart, ...inlineParts]);
  } else {
    // Both: multipart/mixed { multipart/related { html, inlines }, attachments }
    // so the inline-referenced images stay bound to the HTML while the PDF
    // remains a normal download.
    // The inner boundary must NOT have the outer boundary as a prefix, or a
    // lenient parser matching delimiters with a startsWith check would truncate
    // the message at the first inner delimiter. Prefixing (not suffixing) keeps
    // the two strings divergent from the first character.
    const relBoundary = `rel_${boundary}`;
    const relatedPart = [
      `Content-Type: multipart/related; boundary="${relBoundary}"`,
      "",
      wrap(relBoundary, [htmlPart, ...inlineParts]),
    ].join("\r\n");
    topContentType = `multipart/mixed; boundary="${boundary}"`;
    bodyBlock = wrap(boundary, [relatedPart, ...attachmentParts]);
  }
  headers.push(`Content-Type: ${topContentType}`);

  const mime = [headers.join("\r\n"), "", bodyBlock, ""].join("\r\n");

  return { mime, messageId };
}

function toBase64Url(raw: string): string {
  return Buffer.from(raw, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Send an email (optionally with attachments + threading) via the Gmail
 * connector. Returns the Gmail message id + threadId and the Message-ID we
 * stamped, so a two-way conversation's thread state can be persisted.
 */
export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const connectors = new ReplitConnectors();
  const { mime, messageId } = buildMime(input);
  const raw = toBase64Url(mime);

  const body: Record<string, unknown> = { raw };
  if (input.threadId) body.threadId = sanitizeHeaderValue(input.threadId);

  const res = await connectors.proxy(
    "google-mail",
    "/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Gmail kon de e-mail niet versturen (HTTP ${res.status}). ${detail.slice(0, 400)}`,
    );
  }

  const json = (await res.json().catch(() => null)) as
    | { id?: string; threadId?: string }
    | null;
  return {
    id: json?.id ?? "",
    threadId: json?.threadId ?? "",
    messageId,
  };
}
