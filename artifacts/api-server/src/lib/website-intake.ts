/**
 * Fase 2 — website-intake. Reads the client's own website (homepage + any listed
 * landing pages) server-side, strips the HTML to readable text, and returns a
 * bounded blob. Stored on the client and rendered into the client markdown so the
 * agents reason over what the site actually says instead of guessing.
 *
 * No HTML library is used on purpose (keeps the dependency surface small); the
 * extraction is a deliberate, conservative strip rather than a full DOM parse.
 */

import { lookup } from "node:dns/promises";
import net from "node:net";

const MAX_PAGES = 6;
const PER_PAGE_CHARS = 12_000;
const MAX_TOTAL_CHARS = 40_000;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 2_000_000;
const MAX_REDIRECTS = 4;

const USER_AGENT =
  "Mozilla/5.0 (compatible; SaerensBrain/1.0; +https://saerensadvertising.com)";

export interface WebsiteIntakeResult {
  /** Combined readable text across all fetched pages (may be empty). */
  text: string;
  /** Per-URL failures, for surfacing a helpful error. */
  errors: string[];
  /** URLs that yielded usable text. */
  fetched: string[];
}

/** Normalize a raw URL-ish string into an absolute http(s) URL, or null. */
function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProto = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withProto);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Gather the pages to read for a client: the main website plus each listed
 * landing page (one per line). Deduplicated and capped at MAX_PAGES.
 */
export function collectClientUrls(
  website: string | null,
  landingPages: string | null,
): string[] {
  const candidates = [
    ...(website ? [website] : []),
    ...(landingPages ?? "").split(/\r?\n/),
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const url = normalizeUrl(candidate);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= MAX_PAGES) break;
  }
  return out;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  euro: "\u20ac",
  copy: "\u00a9",
  reg: "\u00ae",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  rsquo: "\u2019",
  lsquo: "\u2018",
  ldquo: "\u201c",
  rdquo: "\u201d",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Conservatively convert an HTML document into readable plain text. */
export function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(
    /<(script|style|noscript|template|svg|iframe)\b[\s\S]*?<\/\1>/gi,
    " ",
  );
  s = s.replace(/<head\b[\s\S]*?<\/head>/gi, " ");
  // Block-level closers and <br> become line breaks so structure survives.
  s = s.replace(
    /<\/(p|div|section|article|header|footer|li|tr|h[1-6]|ul|ol|table|nav|main|figure|blockquote)\s*>/gi,
    "\n",
  );
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = s.replace(/[ \t\f\v]+/g, " ");
  s = s.replace(/ *\n */g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

/* --- SSRF protection -----------------------------------------------------
 * This endpoint fetches user-supplied URLs server-side, so it is a classic
 * SSRF surface. We resolve every hostname and refuse loopback / private /
 * link-local / reserved targets, and we follow redirects manually so each hop
 * is re-validated. (Residual DNS-rebinding TOCTOU between lookup and connect is
 * accepted for this internal tool; a full fix would require pinning the IP.)
 */

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    n = (n << 8) | octet;
  }
  return n >>> 0;
}

function isBlockedIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true;
  const inRange = (base: string, bits: number) => {
    const baseInt = ipv4ToInt(base);
    if (baseInt === null) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (baseInt & mask);
  };
  return (
    inRange("0.0.0.0", 8) || // current network
    inRange("10.0.0.0", 8) || // RFC1918 private
    inRange("100.64.0.0", 10) || // carrier-grade NAT
    inRange("127.0.0.0", 8) || // loopback
    inRange("169.254.0.0", 16) || // link-local
    inRange("172.16.0.0", 12) || // RFC1918 private
    inRange("192.0.0.0", 24) || // IETF protocol assignments
    inRange("192.168.0.0", 16) || // RFC1918 private
    inRange("198.18.0.0", 15) || // benchmarking
    inRange("224.0.0.0", 4) || // multicast
    inRange("240.0.0.0", 4) // reserved
  );
}

function isBlockedIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().split("%")[0];
  if (addr === "::1" || addr === "::") return true;
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIPv4(mapped[1]);
  if (/^fe[89ab]/.test(addr)) return true; // link-local fe80::/10
  if (/^f[cd]/.test(addr)) return true; // unique local fc00::/7
  if (addr.startsWith("ff")) return true; // multicast
  return false;
}

function isBlockedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isBlockedIPv4(ip);
  if (family === 6) return isBlockedIPv6(ip);
  return true;
}

async function assertPublicUrl(rawUrl: string): Promise<void> {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("alleen http/https toegestaan");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^localhost$/i.test(host) || host.toLowerCase().endsWith(".localhost")) {
    throw new Error("geblokkeerd host");
  }
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new Error("geblokkeerd intern IP-adres");
    return;
  }
  const records = await lookup(host, { all: true });
  if (records.length === 0) throw new Error("DNS-resolutie mislukt");
  for (const record of records) {
    if (isBlockedIp(record.address)) {
      throw new Error("geblokkeerd intern IP-adres");
    }
  }
}

/** Read a response body up to a hard byte cap, aborting once exceeded. */
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (total + value.length > maxBytes) {
      chunks.push(value.slice(0, maxBytes - total));
      await reader.cancel();
      break;
    }
    chunks.push(value);
    total += value.length;
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function fetchPageText(startUrl: string): Promise<string> {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": USER_AGENT },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel();
      if (!location) throw new Error(`redirect zonder location (${res.status})`);
      url = new URL(location, url).toString();
      continue;
    }

    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`HTTP ${res.status}`);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("text/plain")
    ) {
      await res.body?.cancel();
      throw new Error(`niet-HTML inhoud (${contentType.split(";")[0]})`);
    }

    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_HTML_BYTES) {
      await res.body?.cancel();
      throw new Error("pagina te groot");
    }

    return htmlToText(await readCapped(res, MAX_HTML_BYTES));
  }
  throw new Error("te veel redirects");
}

/**
 * Fetch and extract readable text for the given URLs, bounded per page and in
 * total so a large site can never blow up the agent prompt context.
 */
export async function fetchWebsiteIntake(
  urls: string[],
): Promise<WebsiteIntakeResult> {
  const blocks: string[] = [];
  const errors: string[] = [];
  const fetched: string[] = [];
  let total = 0;

  for (const url of urls) {
    if (total >= MAX_TOTAL_CHARS) break;
    try {
      const text = await fetchPageText(url);
      if (!text) {
        errors.push(`${url}: geen leesbare tekst`);
        continue;
      }
      let body =
        text.length > PER_PAGE_CHARS
          ? text.slice(0, PER_PAGE_CHARS) + "\n[... ingekort ...]"
          : text;
      if (total + body.length > MAX_TOTAL_CHARS) {
        body = body.slice(0, MAX_TOTAL_CHARS - total) + "\n[... ingekort ...]";
      }
      blocks.push(`# ${url}\n\n${body}`);
      fetched.push(url);
      total += body.length;
    } catch (err) {
      errors.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { text: blocks.join("\n\n---\n\n"), errors, fetched };
}
