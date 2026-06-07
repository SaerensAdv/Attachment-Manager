/**
 * PageSpeed Insights (Lighthouse) intake — READ ONLY.
 *
 * The app ("brain") measures a client's landing pages and turns Lighthouse's
 * public performance score plus Core Web Vitals (LCP, CLS, INP/TBT) into a
 * compact, Dutch report and a few sharp signals that feed the agents. We never
 * write anything: only `runPagespeed` GET calls.
 *
 * Auth is a plain API key (`PAGESPEED_API_KEY`) passed as the `key` query param;
 * the field is optional for tiny volumes but required here for headroom. Calls
 * are rate-limited, so an in-memory cache and a token-bucket rate limiter are
 * mandatory, mirroring `places.ts` / `serpapi.ts`.
 */

import { createHash } from "crypto";
import {
  computePageSpeedSignals,
  renderPageSpeedSignals,
  type PageSpeedRecord,
} from "./pagespeed-signals";

const PAGESPEED_BASE =
  "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

/** Lighthouse scores move slowly between deploys; a 6-hour cache is plenty. */
const PAGESPEED_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const MAX_URLS = 5;
const MAX_REPORT_LEN = 20_000;

type Strategy = "mobile" | "desktop";

interface PageSpeedCacheEntry {
  json: Record<string, unknown>;
  expiresAt: number;
}
const pagespeedCache = new Map<string, PageSpeedCacheEntry>();

function pagespeedCacheKey(url: string, strategy: Strategy): string {
  return createHash("sha256")
    .update(`${strategy}:${url.toLowerCase()}`)
    .digest("hex");
}

/** Token-bucket rate limiter. PageSpeed quota is modest; default ~6/min, burst 2. */
class PageSpeedRateLimiter {
  private tokens: number;
  private lastRefill: number;
  constructor(
    private capacity: number,
    private ratePerMs: number,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  async consume(n = 1): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.ratePerMs);
    this.lastRefill = now;
    if (this.tokens < n) {
      const waitMs = (n - this.tokens) / this.ratePerMs;
      await new Promise((r) => setTimeout(r, waitMs));
      this.tokens = 0;
    } else {
      this.tokens -= n;
    }
  }

  halveRate(): void {
    this.ratePerMs = this.ratePerMs / 2;
  }

  reset(capacity?: number): void {
    if (capacity !== undefined) this.capacity = capacity;
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }
}

const pagespeedLimiter = new PageSpeedRateLimiter(2, 6 / 60_000);

export { pagespeedLimiter, pagespeedCache };

/** Thrown when the PageSpeed key is missing — surfaced to the user as a 400. */
export class PageSpeedConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageSpeedConfigError";
  }
}

export type PageSpeedErrorCode =
  | "AUTH_ERROR"
  | "RATE_LIMIT"
  | "NOT_FOUND"
  | "API_ERROR"
  | "NETWORK_ERROR"
  | "UNKNOWN_ERROR";

/** Thrown when PageSpeed returns an error or the call fails — surfaced as a 502. */
export class PageSpeedError extends Error {
  code: PageSpeedErrorCode;
  constructor(message: string, code: PageSpeedErrorCode = "UNKNOWN_ERROR") {
    super(message);
    this.name = "PageSpeedError";
    this.code = code;
  }
}

function classifyError(status: number, isNetwork = false): PageSpeedErrorCode {
  if (isNetwork) return "NETWORK_ERROR";
  if (status === 429) return "RATE_LIMIT";
  if (status === 401 || status === 403) return "AUTH_ERROR";
  if (status === 404) return "NOT_FOUND";
  if (status >= 400) return "API_ERROR";
  return "UNKNOWN_ERROR";
}

function readApiKey(): string {
  const key = process.env.PAGESPEED_API_KEY?.trim() ?? "";
  if (!key) {
    throw new PageSpeedConfigError(
      "PageSpeed Insights is nog niet geconfigureerd. Ontbrekende secret: PAGESPEED_API_KEY.",
    );
  }
  return key;
}

function num(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Core provider call: run one Lighthouse audit and return the parsed JSON.
 * Cached (6h TTL), rate-limited, with a single 429 retry after backoff. Keep all
 * PageSpeed specifics here so callers stay provider-agnostic.
 */
export async function runPagespeed(
  url: string,
  strategy: Strategy,
): Promise<Record<string, unknown>> {
  const apiKey = readApiKey();
  const cacheKey = pagespeedCacheKey(url, strategy);
  const cached = pagespeedCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.json;
  }

  await pagespeedLimiter.consume();

  const target = new URL(PAGESPEED_BASE);
  target.searchParams.set("url", url);
  target.searchParams.set("strategy", strategy);
  target.searchParams.set("category", "performance");
  target.searchParams.set("key", apiKey);

  const doFetch = async (): Promise<Record<string, unknown>> => {
    let res: Response;
    try {
      res = await fetch(target.toString(), { method: "GET" });
    } catch (err) {
      throw new PageSpeedError(
        `Kon geen verbinding maken met de PageSpeed API: ${(err as Error).message}`,
        "NETWORK_ERROR",
      );
    }

    const text = await res.text();
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(text);
        detail = parsed?.error?.message || JSON.stringify(parsed).slice(0, 500);
      } catch {
        detail = text.slice(0, 500) || detail;
      }
      throw new PageSpeedError(
        `PageSpeed API-fout: ${detail}`,
        classifyError(res.status),
      );
    }

    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new PageSpeedError(
        "Onverwacht antwoord van de PageSpeed API (geen geldige JSON).",
        "API_ERROR",
      );
    }
  };

  let json: Record<string, unknown>;
  try {
    json = await doFetch();
  } catch (err) {
    if (err instanceof PageSpeedError && err.code === "RATE_LIMIT") {
      pagespeedLimiter.halveRate();
      await new Promise((r) => setTimeout(r, 2000));
      await pagespeedLimiter.consume();
      json = await doFetch();
    } else {
      throw err;
    }
  }

  pagespeedCache.set(cacheKey, {
    json,
    expiresAt: Date.now() + PAGESPEED_CACHE_TTL_MS,
  });
  return json;
}

/** Read one numeric audit value (numericValue) from a Lighthouse result. */
function auditNumeric(
  audits: Record<string, unknown> | undefined,
  id: string,
): number {
  const audit = audits?.[id] as Record<string, unknown> | undefined;
  return num(audit?.numericValue);
}

/** Map a runPagespeed response into a normalized record. */
export function parsePagespeed(
  json: Record<string, unknown>,
  url: string,
  strategy: Strategy,
): PageSpeedRecord {
  const lh = json.lighthouseResult as Record<string, unknown> | undefined;
  if (!lh) {
    return {
      url,
      strategy,
      found: false,
      performanceScore: 0,
      lcpMs: 0,
      cls: 0,
      inpMs: 0,
    };
  }
  const categories = lh.categories as Record<string, unknown> | undefined;
  const perf = categories?.performance as Record<string, unknown> | undefined;
  const score = num(perf?.score); // 0..1
  const audits = lh.audits as Record<string, unknown> | undefined;

  return {
    url,
    strategy,
    found: true,
    performanceScore: Math.round(score * 100),
    lcpMs: auditNumeric(audits, "largest-contentful-paint"),
    cls: auditNumeric(audits, "cumulative-layout-shift"),
    // Lab proxy for INP: total blocking time (INP itself is field-only).
    inpMs: auditNumeric(audits, "total-blocking-time"),
  };
}

function renderPageSpeedLine(r: PageSpeedRecord): string {
  if (!r.found) {
    return `- ${r.url} (${r.strategy}): geen Lighthouse-resultaat.`;
  }
  const parts = [`score ${r.performanceScore}/100`];
  if (r.lcpMs > 0) parts.push(`LCP ${(r.lcpMs / 1000).toFixed(1)}s`);
  parts.push(`CLS ${r.cls.toFixed(2)}`);
  if (r.inpMs > 0) parts.push(`TBT ${Math.round(r.inpMs)}ms`);
  return `- ${r.url} (${r.strategy === "mobile" ? "mobiel" : "desktop"}): ${parts.join(", ")}`;
}

/** Normalize a raw URL list entry: ensure it has a scheme. */
function normalizeUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

/**
 * Pull a live, read-only PageSpeed report for a client's landing pages. Each URL
 * is measured on mobile (the strategy that matters most for Ads). Best-effort
 * per URL — one failing audit never sinks the rest.
 */
export async function fetchPageSpeedReport(
  urls: string[],
  opts: { strategy?: Strategy } = {},
): Promise<{ text: string; fetchedAt: Date; records: PageSpeedRecord[] }> {
  readApiKey(); // fail fast with a clear config error if the key is missing
  const strategy = opts.strategy ?? "mobile";
  const records: PageSpeedRecord[] = [];
  const notes: string[] = [];

  const targets = urls
    .map(normalizeUrl)
    .filter(Boolean)
    .slice(0, MAX_URLS);

  for (const url of targets) {
    try {
      const json = await runPagespeed(url, strategy);
      records.push(parsePagespeed(json, url, strategy));
    } catch (err) {
      notes.push(
        `- ${url}: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`,
      );
    }
  }

  const lines: string[] = [];
  if (records.length > 0) {
    lines.push(`== Landingspagina-snelheid (${strategy === "mobile" ? "mobiel" : "desktop"}) ==`);
    for (const r of records) lines.push(renderPageSpeedLine(r));
    lines.push("");
  }

  const signals = computePageSpeedSignals(records);
  const renderedSignals = renderPageSpeedSignals(signals);
  if (renderedSignals) {
    lines.push("== Signalen ==");
    lines.push(renderedSignals);
  }

  if (notes.length > 0) {
    lines.push("");
    lines.push("_Niet opgehaald:_");
    lines.push(...notes);
  }

  let text = lines.join("\n").trim();
  if (!text) text = "Geen PageSpeed-data beschikbaar.";
  if (text.length > MAX_REPORT_LEN) {
    text = text.slice(0, MAX_REPORT_LEN) + "\n…(ingekort)";
  }

  return { text, fetchedAt: new Date(), records };
}
