/**
 * SerpApi intake — READ ONLY competitor-ad intelligence.
 *
 * The app ("brain") pulls public competitor-advertising data from SerpApi's
 * Google Ads Transparency Center engine and turns it into compact, Dutch,
 * human-readable observations that feed the agents. We never write anything:
 * only search queries are sent.
 *
 * Why SerpApi: Google's Ads Transparency Center has NO official public API.
 * SerpApi exposes it (synchronous REST + clean JSON). This module keeps the
 * provider behind a thin boundary (`serpApiSearch`) so a cheaper provider
 * (e.g. DataForSEO) can replace it later without touching the callers.
 *
 * Auth is a single private API key (`SERPAPI_API_KEY`) passed as a query param.
 * Calls are billed per request, so an in-memory cache (longer TTL than Ads) and
 * a token-bucket rate limiter are mandatory, mirroring `google-ads.ts`.
 */

import { createHash } from "crypto";
import {
  computeCompetitorSignals,
  renderCompetitorSignals,
} from "./competitor-signals";

const SERPAPI_BASE = "https://serpapi.com/search";

/** Cache for SerpApi results. Billed per call, so a generous TTL is sensible. */
const SERPAPI_CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes

/** Cap creatives per target so one advertiser never blows up the prompt/cost. */
const MAX_ADS_PER_TARGET = 40; // one SerpApi page; no pagination (cost control)
const MAX_TARGETS = 10;
const MAX_REPORT_LEN = 20_000;

interface SerpApiCacheEntry {
  json: Record<string, unknown>;
  expiresAt: number;
}
const serpApiCache = new Map<string, SerpApiCacheEntry>();

function serpApiCacheKey(engine: string, params: Record<string, string>): string {
  const sorted = Object.keys(params)
    .filter((k) => k !== "api_key")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha256").update(`${engine}?${sorted}`).digest("hex");
}

/** Token-bucket rate limiter. SerpApi accounts have concurrency/throughput
 *  limits; default here is deliberately gentle: 5 requests/min, burst of 2. */
class SerpApiRateLimiter {
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

const serpApiLimiter = new SerpApiRateLimiter(2, 5 / 60_000);

export { serpApiLimiter, serpApiCache };

/** Thrown when the SerpApi key is missing — surfaced to the user as a 400. */
export class SerpApiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SerpApiConfigError";
  }
}

export type SerpApiErrorCode =
  | "AUTH_ERROR"
  | "RATE_LIMIT"
  | "NOT_FOUND"
  | "API_ERROR"
  | "NETWORK_ERROR"
  | "UNKNOWN_ERROR";

/** Thrown when SerpApi returns an error or the call fails — surfaced as a 502. */
export class SerpApiError extends Error {
  code: SerpApiErrorCode;
  constructor(message: string, code: SerpApiErrorCode = "UNKNOWN_ERROR") {
    super(message);
    this.name = "SerpApiError";
    this.code = code;
  }
}

function classifySerpApiError(status: number, isNetwork = false): SerpApiErrorCode {
  if (isNetwork) return "NETWORK_ERROR";
  if (status === 429) return "RATE_LIMIT";
  if (status === 401 || status === 403) return "AUTH_ERROR";
  if (status === 404) return "NOT_FOUND";
  if (status >= 500) return "API_ERROR";
  if (status >= 400) return "API_ERROR";
  return "UNKNOWN_ERROR";
}

function readApiKey(): string {
  const key = process.env.SERPAPI_API_KEY?.trim() ?? "";
  if (!key) {
    throw new SerpApiConfigError(
      "SerpApi is nog niet geconfigureerd. Ontbrekende secret: SERPAPI_API_KEY.",
    );
  }
  return key;
}

/**
 * Core provider call: run one SerpApi search and return the parsed JSON.
 * Cached (60 min TTL), rate-limited, with a single 429 retry after backoff.
 * Keep all SerpApi specifics here so callers stay provider-agnostic.
 */
export async function serpApiSearch(
  engine: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const apiKey = readApiKey();
  const cacheKey = serpApiCacheKey(engine, params);
  const cached = serpApiCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.json;
  }

  await serpApiLimiter.consume();

  const doFetch = async (): Promise<Record<string, unknown>> => {
    const url = new URL(SERPAPI_BASE);
    url.searchParams.set("engine", engine);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("output", "json");

    let res: Response;
    try {
      res = await fetch(url, { method: "GET" });
    } catch (err) {
      throw new SerpApiError(
        `Kon geen verbinding maken met SerpApi: ${(err as Error).message}`,
        "NETWORK_ERROR",
      );
    }

    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = null;
    }

    if (!res.ok) {
      const detail =
        (json?.error as string | undefined) || text.slice(0, 500) || `HTTP ${res.status}`;
      throw new SerpApiError(
        `SerpApi-fout: ${detail}`,
        classifySerpApiError(res.status),
      );
    }

    // SerpApi can return HTTP 200 with a top-level `error` string (e.g. no
    // results, hasn't run). Treat as an empty result, not a hard failure.
    if (json && typeof json.error === "string") {
      return { error: json.error };
    }
    if (!json) {
      throw new SerpApiError(
        "Onverwacht antwoord van SerpApi (geen geldige JSON).",
        "API_ERROR",
      );
    }
    return json;
  };

  let json: Record<string, unknown>;
  try {
    json = await doFetch();
  } catch (err) {
    if (err instanceof SerpApiError && err.code === "RATE_LIMIT") {
      serpApiLimiter.halveRate();
      await new Promise((r) => setTimeout(r, 2000));
      await serpApiLimiter.consume();
      json = await doFetch();
    } else {
      throw err;
    }
  }

  serpApiCache.set(cacheKey, { json, expiresAt: Date.now() + SERPAPI_CACHE_TTL_MS });
  return json;
}

/** One competitor ad creative, normalized from the Ads Transparency response. */
export interface CompetitorAd {
  advertiserId: string;
  advertiser: string;
  adCreativeId: string;
  /** "text" | "image" | "video" | other, as SerpApi reports it. */
  format: string;
  /** When the ad was first/last seen running (null if SerpApi omitted it). */
  firstShown: Date | null;
  lastShown: Date | null;
  /** Total number of days the creative has been observed running. */
  totalDaysShown: number;
}

/** Aggregated result for a single competitor target (advertiser id or query). */
export interface CompetitorAdvertiserResult {
  /** The raw target the caller asked for (advertiser id or domain/text). */
  target: string;
  /** How the target was interpreted. */
  kind: "advertiser_id" | "text";
  /** Primary advertiser name, when resolvable from the returned creatives. */
  advertiser: string;
  /** SerpApi's reported total (may far exceed the page we fetched). */
  totalResults: number;
  ads: CompetitorAd[];
}

const ADVERTISER_ID_RE = /^AR\d+$/i;

function unixToDate(value: unknown): Date | null {
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (!Number.isFinite(n) || n <= 0) return null;
  // SerpApi reports first/last shown as unix SECONDS.
  return new Date(n * 1000);
}

function intOf(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** Parse one SerpApi Ads Transparency response into normalized creatives. */
function parseAdCreatives(json: Record<string, unknown>): {
  ads: CompetitorAd[];
  totalResults: number;
  advertiser: string;
} {
  const rawAds = Array.isArray(json.ad_creatives)
    ? (json.ad_creatives as Record<string, unknown>[])
    : [];
  const ads: CompetitorAd[] = rawAds.slice(0, MAX_ADS_PER_TARGET).map((a) => ({
    advertiserId: String(a.advertiser_id ?? ""),
    advertiser: String(a.advertiser ?? ""),
    adCreativeId: String(a.ad_creative_id ?? ""),
    format: String(a.format ?? "unknown").toLowerCase(),
    firstShown: unixToDate(a.first_shown),
    lastShown: unixToDate(a.last_shown),
    totalDaysShown: intOf(a.total_days_shown),
  }));
  const info = (json.search_information as Record<string, unknown> | undefined) ?? {};
  const totalResults = intOf(info.total_results) || ads.length;
  const advertiser = ads.find((a) => a.advertiser)?.advertiser ?? "";
  return { ads, totalResults, advertiser };
}

/** Build a compact, Dutch text report for one competitor (grounded only in
 *  the fields SerpApi actually returns: format, run dates, counts). */
function renderCompetitorReport(result: CompetitorAdvertiserResult): string {
  const lines: string[] = [];
  const name = result.advertiser || result.target;
  lines.push(`### ${name}`);
  if (result.kind === "advertiser_id") {
    lines.push(`Advertiser-ID: ${result.target}`);
  } else {
    lines.push(`Zoekterm/domein: ${result.target}`);
  }

  if (result.ads.length === 0) {
    lines.push("Geen actieve advertenties gevonden in het Transparency Center.");
    return lines.join("\n");
  }

  const formatCounts = new Map<string, number>();
  for (const ad of result.ads) {
    formatCounts.set(ad.format, (formatCounts.get(ad.format) ?? 0) + 1);
  }
  const formatStr = [...formatCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([fmt, n]) => `${n}x ${fmt}`)
    .join(", ");

  const shownN = result.ads.length;
  const totalNote =
    result.totalResults > shownN
      ? ` (van ${result.totalResults} in totaal; bovenste ${shownN} bekeken)`
      : "";
  lines.push(`Actieve advertenties: ${shownN}${totalNote}.`);
  lines.push(`Formaten: ${formatStr}.`);

  const withFirst = result.ads.filter((a) => a.firstShown);
  if (withFirst.length > 0) {
    const newest = withFirst.reduce((acc, a) =>
      a.firstShown! > acc.firstShown! ? a : acc,
    );
    lines.push(
      `Nieuwste advertentie sinds: ${newest.firstShown!.toISOString().slice(0, 10)}.`,
    );
  }
  const longest = result.ads.reduce((acc, a) =>
    a.totalDaysShown > acc.totalDaysShown ? a : acc,
  );
  if (longest.totalDaysShown > 0) {
    lines.push(
      `Langstlopende advertentie: ${longest.totalDaysShown} dagen (${longest.format}).`,
    );
  }

  return lines.join("\n");
}

/**
 * Pull live, read-only competitor-ad data for a list of targets.
 * Each target is either a Google advertiser id (e.g. "AR1782...") or a free-text
 * query / domain (e.g. "concurrent.be"). Returns a compact Dutch text report,
 * the structured results, and the fetch timestamp.
 *
 * Best-effort per target: one target failing (or empty) never sinks the rest.
 */
export async function fetchCompetitorAds(
  targets: string[],
  opts: { region?: string } = {},
): Promise<{
  text: string;
  fetchedAt: Date;
  results: CompetitorAdvertiserResult[];
}> {
  readApiKey(); // fail fast with a clear config error if the key is missing
  const cleaned = targets
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, MAX_TARGETS);

  const results: CompetitorAdvertiserResult[] = [];
  const notes: string[] = [];

  for (const target of cleaned) {
    const isId = ADVERTISER_ID_RE.test(target);
    const params: Record<string, string> = isId
      ? { advertiser_id: target }
      : { text: target };
    if (opts.region) params.region = opts.region;

    try {
      const json = await serpApiSearch("google_ads_transparency_center", params);
      if (typeof json.error === "string") {
        results.push({
          target,
          kind: isId ? "advertiser_id" : "text",
          advertiser: "",
          totalResults: 0,
          ads: [],
        });
        continue;
      }
      const { ads, totalResults, advertiser } = parseAdCreatives(json);
      results.push({
        target,
        kind: isId ? "advertiser_id" : "text",
        advertiser,
        totalResults,
        ads,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notes.push(`- ${target}: ${msg.slice(0, 200)}`);
    }
  }

  const sections = results.map(renderCompetitorReport);
  let text = "";
  if (sections.length > 0) {
    text += sections.join("\n\n");
  }

  // Signals step (fetch → cache → SIGNALS → inject): turn the raw creatives into
  // a few sharp Dutch market observations so the agents get strategy, not just
  // a data dump. Grounded only in the fields we already pulled.
  const signals = computeCompetitorSignals(results);
  const renderedSignals = renderCompetitorSignals(signals);
  if (renderedSignals) {
    text += `${text ? "\n\n" : ""}### Signalen\n${renderedSignals}`;
  }

  if (notes.length > 0) {
    text += `${text ? "\n\n" : ""}_Niet opgehaald:_\n${notes.join("\n")}`;
  }
  if (!text.trim()) {
    text = "Geen concurrent-advertentiedata beschikbaar.";
  }
  if (text.length > MAX_REPORT_LEN) text = text.slice(0, MAX_REPORT_LEN);

  return { text, fetchedAt: new Date(), results };
}
