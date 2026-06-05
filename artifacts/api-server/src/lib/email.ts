import { ReplitConnectors } from "@replit/connectors-sdk";

/**
 * Email sending via the Replit Gmail connector (integration: google-mail).
 *
 * The connectors SDK proxies authenticated requests to the Gmail REST API and
 * handles OAuth token injection/refresh — we never touch credentials directly.
 * We build a raw RFC 822 MIME message (multipart/mixed so we can attach the
 * report PDF) and hand it to users.messages.send as a base64url `raw` payload.
 *
 * Never cache the client: tokens expire, so a fresh ReplitConnectors() is made
 * per send.
 */

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  content: Buffer;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  /** HTML body. */
  html: string;
  attachments?: EmailAttachment[];
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

/** Basic single-address validation; rejects anything with header-breaking chars. */
function assertValidRecipient(to: string): string {
  const safe = sanitizeHeaderValue(to);
  if (safe !== to.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safe)) {
    throw new Error(`Ongeldig e-mailadres voor ontvanger: "${to}".`);
  }
  return safe;
}

/** Split base64 into 76-char lines as required for MIME body parts. */
function chunk76(b64: string): string {
  return b64.replace(/.{76}/g, "$&\r\n");
}

function buildMime(input: SendEmailInput): string {
  const boundary = `saerens_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2)}`;

  const headers = [
    `To: ${assertValidRecipient(input.to)}`,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];

  const parts: string[] = [];

  // HTML body (base64 so UTF-8 content travels safely).
  parts.push(
    [
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      chunk76(Buffer.from(input.html, "utf-8").toString("base64")),
    ].join("\r\n"),
  );

  for (const att of input.attachments ?? []) {
    const safeName = sanitizeHeaderValue(att.filename).replace(/"/g, "");
    const safeType = sanitizeHeaderValue(att.mimeType).replace(/"/g, "");
    parts.push(
      [
        `--${boundary}`,
        `Content-Type: ${safeType}; name="${safeName}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${safeName}"`,
        "",
        chunk76(att.content.toString("base64")),
      ].join("\r\n"),
    );
  }

  return [headers.join("\r\n"), "", parts.join("\r\n"), `--${boundary}--`, ""].join(
    "\r\n",
  );
}

function toBase64Url(raw: string): string {
  return Buffer.from(raw, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Send an email (optionally with attachments) via the Gmail connector. */
export async function sendEmail(
  input: SendEmailInput,
): Promise<{ id: string }> {
  const connectors = new ReplitConnectors();
  const raw = toBase64Url(buildMime(input));

  const res = await connectors.proxy(
    "google-mail",
    "/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ raw }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Gmail kon de e-mail niet versturen (HTTP ${res.status}). ${detail.slice(0, 400)}`,
    );
  }

  const json = (await res.json().catch(() => null)) as { id?: string } | null;
  return { id: json?.id ?? "" };
}
