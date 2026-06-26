import { ReplitConnectors } from "@replit/connectors-sdk";
import type { EmailThread } from "@workspace/db";
import { logger } from "./logger";
import {
  resolveGenerationContext,
  runGeneration,
  type EmailReplyContext,
} from "./generate-engine";
import { listOpenThreads, claimInbound } from "./email-threads-store";
import { getClientRow, dbClientIdFromPath } from "./clients-store";
import { ownerEmail } from "./email-identity";

/**
 * Phase 2 inbound side of two-way agent email. A periodic poller reads the
 * agency mailbox (via the same Gmail connector used for sending) and, for each
 * open conversation, looks at the newest message. When that message is a genuine
 * inbound reply from the client, it routes it to the responsible department Head
 * and runs the team to DRAFT a reply — which is then held for human approval by
 * the engine (nothing is ever sent here).
 *
 * Safety is layered:
 * - Strict sender whitelist: a message is only acted on when its From address
 *   equals the client's configured `reportEmail`. This is the loop/spoof guard —
 *   our own sends, the CC'd owner, auto-replies and mailer-daemons can never
 *   trigger a draft.
 * - Claim-first: the inbound message id is recorded BEFORE the team runs, so a
 *   message is drafted for at most once even across overlapping ticks or a
 *   crash mid-run.
 * - Read-scope probe: if the connected mailbox lacks Gmail read scope, the
 *   poller disables itself with a clear log instead of erroring every tick.
 */

const POLL_INTERVAL_MS = 60_000;
const WORKFLOW_PATH = "workflows/client-email.md";

/** Gmail message ids of senders that must never trigger a drafted reply. */
const BLOCKED_SENDER_RE =
  /(^|[<\s.])(mailer-daemon|postmaster|no-?reply|do-?not-?reply|noreply)([@>\s.]|$)/i;

interface GmailHeader {
  name: string;
  value: string;
}
interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}
interface GmailMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: GmailHeader[]; mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };
}
interface GmailThreadResponse {
  messages?: GmailMessage[];
}

/** Read a header value by name, case-insensitively. */
function header(headers: GmailHeader[] | undefined, name: string): string | null {
  const lower = name.toLowerCase();
  const found = (headers ?? []).find((h) => h.name.toLowerCase() === lower);
  return found ? found.value : null;
}

/** Extract the bare email address from a `Name <addr>` or bare `addr` header. */
export function parseEmailAddress(value: string | null): string | null {
  if (!value) return null;
  const angle = value.match(/<([^>]+)>/);
  const raw = (angle ? angle[1] : value).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw : null;
}

/** Decode a Gmail base64url body part into UTF-8 text. */
function decodeBody(data: string | undefined): string {
  if (!data) return "";
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf-8",
    );
  } catch {
    return "";
  }
}

/** Strip tags from an HTML body as a last-resort fallback for the text. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|br|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Recursively find the best body text in a message payload (prefer text/plain). */
function extractText(msg: GmailMessage): string {
  let plain = "";
  let html = "";
  const walk = (part: GmailPart | undefined): void => {
    if (!part) return;
    const type = (part.mimeType ?? "").toLowerCase();
    if (type === "text/plain" && part.body?.data) {
      plain += decodeBody(part.body.data);
    } else if (type === "text/html" && part.body?.data) {
      html += decodeBody(part.body.data);
    }
    for (const child of part.parts ?? []) walk(child);
  };
  walk(msg.payload);
  const text = plain.trim() || (html.trim() ? htmlToText(html) : "");
  return text.trim() || (msg.snippet ?? "").trim();
}

/** A single GET against the Gmail REST API via the connector. */
async function gmailGet(path: string): Promise<Response> {
  const connectors = new ReplitConnectors();
  return connectors.proxy("google-mail", path, { method: "GET" });
}

/**
 * One-off probe that the connected mailbox grants Gmail READ scope. Returns true
 * on a 200, false on 401/403 (insufficient scope) so the poller can disable
 * itself, and throws on a transient error so the caller leaves scope "unknown"
 * and re-probes later.
 */
export async function probeGmailReadScope(): Promise<boolean> {
  const res = await gmailGet("/gmail/v1/users/me/messages?maxResults=1");
  if (res.ok) return true;
  if (res.status === 401 || res.status === 403) return false;
  const detail = await res.text().catch(() => "");
  throw new Error(`Gmail read probe failed (HTTP ${res.status}). ${detail.slice(0, 200)}`);
}

/** Build the reply subject from the thread subject, collapsing repeated "Re:". */
export function replySubject(threadSubject: string): string {
  const base = (threadSubject ?? "").replace(/^(\s*re\s*:\s*)+/i, "").trim();
  return base ? `Re: ${base}` : "Re:";
}

/** Build the References chain: prior thread chain + the inbound Message-ID. */
function buildReferences(
  priorChain: string | null,
  inboundMessageId: string | null,
): string | null {
  const parts = [priorChain?.trim(), inboundMessageId?.trim()].filter(
    (p): p is string => Boolean(p),
  );
  return parts.length ? parts.join(" ") : null;
}

/** Resolve the whitelisted client recipient (reportEmail) for a thread. */
async function clientReportEmail(clientPath: string): Promise<string | null> {
  const id = dbClientIdFromPath(clientPath);
  if (id === null) return null;
  const client = await getClientRow(id);
  const email = client?.reportEmail?.trim().toLowerCase();
  return email && email.length > 0 ? email : null;
}

/**
 * Decide whether the newest message in a thread is a genuine inbound client
 * reply we should draft an answer to. Returns the reason to skip, or null to
 * proceed. Exported for unit testing of the whitelist/skip logic.
 */
export function inboundSkipReason(args: {
  message: GmailMessage;
  whitelistEmail: string;
  ownerAddress: string | null;
  alreadyProcessedId: string | null;
}): string | null {
  const { message, whitelistEmail, ownerAddress, alreadyProcessedId } = args;
  const labels = message.labelIds ?? [];
  if (labels.includes("SENT") || labels.includes("DRAFT")) return "own-message";
  if (message.id === alreadyProcessedId) return "already-processed";

  const headers = message.payload?.headers;
  const fromAddr = parseEmailAddress(header(headers, "From"));
  if (!fromAddr) return "no-from";
  if (BLOCKED_SENDER_RE.test(header(headers, "From") ?? "")) return "system-sender";
  if (ownerAddress && fromAddr === ownerAddress.toLowerCase()) return "owner-message";

  const autoSubmitted = (header(headers, "Auto-Submitted") ?? "").toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return "auto-submitted";
  const precedence = (header(headers, "Precedence") ?? "").toLowerCase();
  if (["bulk", "list", "junk", "auto_reply"].includes(precedence)) return "bulk";

  // The strict whitelist: only the client's own configured address may trigger a
  // drafted reply. This is the loop/spoof guard.
  if (fromAddr !== whitelistEmail.toLowerCase()) return "not-whitelisted";

  return null;
}

/**
 * Process one open conversation: detect a new client reply and draft an answer.
 * Exported for focused engine-level testing of the resolve -> route -> claim ->
 * draft flow (the whitelist + exactly-once guards).
 */
export async function processThread(thread: EmailThread): Promise<void> {
  const whitelistEmail = await clientReportEmail(thread.clientPath);
  if (!whitelistEmail) return; // No recipient configured: nothing can be whitelisted.

  const metaPath =
    `/gmail/v1/users/me/threads/${encodeURIComponent(thread.gmailThreadId)}` +
    `?format=metadata` +
    ["From", "Message-ID", "Subject", "Auto-Submitted", "Precedence"]
      .map((h) => `&metadataHeaders=${h}`)
      .join("");
  const res = await gmailGet(metaPath);
  if (!res.ok) {
    if (res.status === 404) {
      logger.warn({ threadId: thread.id }, "E-mailthread niet meer gevonden bij Gmail");
    }
    return;
  }
  const data = (await res.json().catch(() => null)) as GmailThreadResponse | null;
  const messages = data?.messages ?? [];
  if (messages.length === 0) return;

  // The newest message is the last one Gmail returns (chronological order).
  const newest = messages[messages.length - 1];
  const skip = inboundSkipReason({
    message: newest,
    whitelistEmail,
    ownerAddress: ownerEmail(),
    alreadyProcessedId: thread.lastProcessedMessageId,
  });
  if (skip) return;

  // Claim BEFORE running so an inbound message is drafted at most once.
  const claimed = await claimInbound(thread.id, newest.id);
  if (!claimed) return;

  // Fetch the full message for its body + Message-ID header.
  const fullRes = await gmailGet(
    `/gmail/v1/users/me/messages/${encodeURIComponent(newest.id)}?format=full`,
  );
  if (!fullRes.ok) {
    logger.warn(
      { threadId: thread.id, messageId: newest.id, status: fullRes.status },
      "Kon inkomend bericht niet ophalen na claim",
    );
    return;
  }
  const full = (await fullRes.json().catch(() => null)) as GmailMessage | null;
  if (!full) return;

  const inboundText = extractText(full);
  if (!inboundText) {
    logger.warn({ threadId: thread.id, messageId: newest.id }, "Leeg inkomend bericht");
    return;
  }
  const inboundMessageId = header(full.payload?.headers, "Message-ID");

  const request = [
    "Een klant heeft gereageerd op een e-mail van het bureau. Stel een professioneel, eerlijk antwoord op in de taal van de klant (Nederlands/Vlaams). Beantwoord elk punt uit het bericht.",
    "",
    `Onderwerp: ${thread.subject}`,
    "",
    "Bericht van de klant:",
    inboundText,
  ].join("\n");

  const resolved = await resolveGenerationContext({
    agentPath: thread.headAgentPath,
    additionalAgentPaths: [],
    clientPath: thread.clientPath,
    workflowPath: WORKFLOW_PATH,
    request,
    clientFacing: true,
  });
  if (!resolved.ok) {
    logger.warn(
      { threadId: thread.id, error: resolved.error },
      "Inkomend antwoord kon de generatie-context niet opbouwen",
    );
    return;
  }

  const emailReply: EmailReplyContext = {
    emailThreadId: thread.id,
    gmailThreadId: thread.gmailThreadId,
    recipient: whitelistEmail,
    subject: replySubject(thread.subject),
    inReplyTo: inboundMessageId,
    references: buildReferences(thread.lastMessageIdHeader, inboundMessageId),
    inboundText,
  };
  resolved.ctx.emailReply = emailReply;

  const controller = new AbortController();
  const result = await runGeneration(resolved.ctx, {
    sink: () => {},
    signal: controller.signal,
    triggerSource: "inbound-email",
  });

  logger.info(
    {
      threadId: thread.id,
      generationId: result.generationId,
      status: result.status,
      approvalStatus: result.approvalStatus,
    },
    "Antwoord op klant-e-mail opgesteld (wacht op goedkeuring)",
  );
}

// Scope state machine: probe lazily, disable on insufficient scope, and re-probe
// periodically so a later reconnect (with read scope) auto-recovers the poller.
let scopeState: "unknown" | "ok" | "blocked" = "unknown";
let blockedTicks = 0;
const REPROBE_AFTER_TICKS = 30; // ~30 min at the 60s interval.
let polling = false;

async function pollInbound(): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    if (scopeState === "blocked") {
      if (++blockedTicks < REPROBE_AFTER_TICKS) return;
      blockedTicks = 0;
      scopeState = "unknown";
    }
    if (scopeState === "unknown") {
      try {
        scopeState = (await probeGmailReadScope()) ? "ok" : "blocked";
      } catch (err) {
        logger.warn({ err }, "Gmail read-scope probe mislukte (opnieuw proberen later)");
        return; // Stay "unknown"; transient — retry next tick.
      }
      if (scopeState === "blocked") {
        logger.warn(
          "Gmail leesrechten ontbreken: tweerichtings-e-mail (inkomende antwoorden) staat uit. Verbind de Gmail-integratie opnieuw met leesrechten om dit te activeren.",
        );
        return;
      }
    }

    const threads = await listOpenThreads();
    for (const thread of threads) {
      try {
        await processThread(thread);
      } catch (err) {
        logger.error({ err, threadId: thread.id }, "Verwerken inkomende e-mail mislukte");
      }
    }
  } catch (err) {
    logger.error({ err }, "Inbound e-mail poller tick mislukte");
  } finally {
    polling = false;
  }
}

/** Start the periodic inbound-email poller. Safe to call once at boot. */
export function startInboundPoller(): void {
  logger.info({ intervalMs: POLL_INTERVAL_MS }, "Inbound e-mail poller gestart");
  setTimeout(() => void pollInbound(), 10_000);
  setInterval(() => void pollInbound(), POLL_INTERVAL_MS);
}
