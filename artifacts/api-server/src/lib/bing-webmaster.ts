/**
 * Bing Webmaster Tools intake — READ ONLY.
 *
 * The app ("brain") pulls a client's organic Bing-search performance (top
 * queries + pages, recent ~4 weeks) from the Bing Webmaster Tools API and turns
 * it into a compact, Dutch, human-readable report plus a few sharp signals that
 * feed the agents. We never write anything: only the read-only `Get*` reporting
 * methods are called.
 *
 * Auth is a single API key (`BING_WEBMASTER_API_KEY`) passed as the `apikey`
 * query param. One key works for every site verified in the account, so the only
 * per-client config is the verified site URL (`https://example.com/`).
 *
 * Bing quirks this module hides from the rest of the app:
 *  - Responses are wrapped in a top-level `d` array (WCF JSON).
 *  - Dates are `/Date(ms)/` strings (epoch ms, sometimes with a `-0700` suffix).
 *  - GetQueryStats / GetPageStats return WEEKLY buckets with no date or row
 *    limit — we aggregate the most recent ~4 weeks ourselves.
 *  - Those two methods return positions multiplied by 10 (180 = position 18.0),
 *    so we divide by `BING_POSITION_SCALE`.
 *  - CTR is never returned, so we derive it from clicks / impressions.
 */

import { createHash } from "crypto";
import { computeBingSignals, renderBingSignals } from "./bing-webmaster-signals";

const BING_BASE = "https://ssl.bing.com/webmaster/api.svc/json";

/** GetQueryStats/GetPageStats return positions ×10 (180 → 18.0). */
const BING_POSITION_SCALE = 10;
/** Aggregate the most recent ~4 weeks (28 days) of weekly/daily buckets. */
const BING_WINDOW_DAYS = 28;
const MAX_ROWS = 50;
const MAX_REPORT_LEN = 20_000;

/** Cache (6h) — Bing data updates ~weekly, so this never serves stale data. */
const BING_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface BingCacheEntry {
  rows: BingApiRow[];
  expiresAt: number;
}
const bingCache = new Map<string, BingCacheEntry>();

function bingCacheKey(method: string, siteUrl: string): string {
  return createHash("sha256").update(`${method}:${siteUrl}`).digest("hex");
}

/** Token-bucket rate limiter. Bing's quota is generous; default 10/min, burst 3. */
class BingRateLimiter {
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

const bingLimiter = new BingRateLimiter(3, 10 / 60_000);

export { bingLimiter, bingCache };

/** Thrown for missing config (no API key / bad site URL) — surfaced as a 400. */
export class BingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BingConfigError";
  }
}

export type BingErrorCode =
  | "AUTH_ERROR"
  | "RATE_LIMIT"
  | "NOT_FOUND"
  | "API_ERROR"
  | "NETWORK_ERROR"
  | "UNKNOWN_ERROR";

/** Thrown when the API returns an error or the call fails — surfaced as a 502. */
export class BingError extends Error {
  code: BingErrorCode;
  constructor(message: string, code: BingErrorCode = "UNKNOWN_ERROR") {
    super(message);
    this.name = "BingError";
    this.code = code;
  }
}

function classifyError(status: number, isNetwork = false): BingErrorCode {
  if (isNetwork) return "NETWORK_ERROR";
  if (status === 429) return "RATE_LIMIT";
  if (status === 401 || status === 403) return "AUTH_ERROR";
  if (status === 404) return "NOT_FOUND";
  if (status >= 400) return "API_ERROR";
  return "UNKNOWN_ERROR";
}

function readApiKey(): string {
  const key = process.env.BING_WEBMASTER_API_KEY?.trim() ?? "";
  if (!key) {
    throw new BingConfigError(
      "Bing Webmaster is nog niet geconfigureerd. Ontbrekende secret: BING_WEBMASTER_API_KEY.",
    );
  }
  return key;
}

/** One normalized Bing row (a query or a page). */
export interface BingRow {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number; // fraction 0..1, derived from clicks / impressions
  position: number; // average; lower is better
}

export interface BingReport {
  siteUrl: string;
  startDate: string;
  endDate: string;
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  topQueries: BingRow[];
  topPages: BingRow[];
}

/** Raw Bing API row (fields PascalCase, positions ×10, dates WCF strings). */
interface BingApiRow {
  Query?: string;
  Date?: string;
  Clicks?: number;
  Impressions?: number;
  AvgClickPosition?: number;
  AvgImpressionPosition?: number;
}

/**
 * A Bing verified site is a full URL-prefix property (`https://example.com/`).
 * Bing has no `sc-domain:` concept, so reject anything that isn't an http(s)
 * URL early — we never interpolate junk into the request.
 */
export function validateBingSiteUrl(raw: string): string {
  const v = (raw ?? "").trim();
  if (!v) {
    throw new BingConfigError(
      "Geen Bing Webmaster-site ingesteld voor deze klant.",
    );
  }
  if (/^https?:\/\/[^\s]+$/i.test(v)) return v;
  throw new BingConfigError(
    `Ongeldige Bing Webmaster-site: "${v}". Gebruik de volledige URL, bv. "https://voorbeeld.be/".`,
  );
}

function num(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse a WCF `/Date(1399100400000)/` (or `/Date(...-0700)/`) into epoch ms. */
function parseWcfDate(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = /\/Date\((-?\d+)/.exec(raw);
  if (!m) return null;
  const ms = Number(m[1]);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Low-level GET for a Bing Webmaster `Get*` method, with caching + rate
 * limiting. Cache key excludes the API key (it's auth, not query identity).
 * On 429, halves the rate and retries once after a short backoff.
 */
async function bingFetch(
  apiKey: string,
  method: string,
  siteUrl?: string,
): Promise<BingApiRow[]> {
  const cacheKey = bingCacheKey(method, siteUrl ?? "");
  const cached = bingCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.rows;
  }

  await bingLimiter.consume();

  const doFetch = async (): Promise<BingApiRow[]> => {
    const url = new URL(`${BING_BASE}/${method}`);
    url.searchParams.set("apikey", apiKey);
    if (siteUrl) url.searchParams.set("siteUrl", siteUrl);
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: { accept: "application/json" },
      });
    } catch (err) {
      throw new BingError(
        `Kon geen verbinding maken met de Bing Webmaster API: ${(err as Error).message}`,
        "NETWORK_ERROR",
      );
    }

    const text = await res.text();
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(text);
        detail =
          parsed?.Message ||
          parsed?.error?.message ||
          JSON.stringify(parsed).slice(0, 500);
      } catch {
        detail = text.slice(0, 500) || detail;
      }
      throw new BingError(
        `Bing Webmaster API-fout: ${detail}`,
        classifyError(res.status),
      );
    }

    let parsed: { d?: BingApiRow[] };
    try {
      parsed = JSON.parse(text) as { d?: BingApiRow[] };
    } catch {
      throw new BingError(
        "Onverwacht antwoord van de Bing Webmaster API (geen geldige JSON).",
        "API_ERROR",
      );
    }
    return Array.isArray(parsed.d) ? parsed.d : [];
  };

  let rows: BingApiRow[];
  try {
    rows = await doFetch();
  } catch (err) {
    if (err instanceof BingError && err.code === "RATE_LIMIT") {
      bingLimiter.halveRate();
      await new Promise((r) => setTimeout(r, 2000));
      await bingLimiter.consume();
      rows = await doFetch();
    } else {
      throw err;
    }
  }

  bingCache.set(cacheKey, { rows, expiresAt: Date.now() + BING_CACHE_TTL_MS });
  return rows;
}

/**
 * The most recent bucket date present in the rows, or `now` when none parse.
 * Bing data lags by an unknown amount, so we anchor the window to the freshest
 * data Bing actually returned rather than to wall-clock time.
 */
function latestBucket(rows: BingApiRow[], now: number): number {
  let max = 0;
  for (const r of rows) {
    const ms = parseWcfDate(r.Date);
    if (ms !== null && ms > max) max = ms;
  }
  return max > 0 ? max : now;
}

/**
 * Aggregate weekly query/page buckets within the recent window into one row per
 * key: clicks + impressions summed, position impression-weighted (so a week with
 * more impressions counts more), CTR derived. Positions are de-scaled (÷10).
 */
function aggregateBuckets(rows: BingApiRow[], windowEnd: number): BingRow[] {
  const windowStart = windowEnd - (BING_WINDOW_DAYS - 1) * 86_400_000;
  const acc = new Map<
    string,
    { clicks: number; impressions: number; posWeighted: number; posImpr: number }
  >();
  for (const r of rows) {
    const ms = parseWcfDate(r.Date);
    // Keep undated rows (already aggregated by Bing); drop dated rows outside
    // the window.
    if (ms !== null && (ms < windowStart || ms > windowEnd)) continue;
    const key = (r.Query ?? "").trim();
    if (!key) continue;
    const clicks = num(r.Clicks);
    const impressions = num(r.Impressions);
    const pos = num(r.AvgImpressionPosition) / BING_POSITION_SCALE;
    const cur =
      acc.get(key) ?? { clicks: 0, impressions: 0, posWeighted: 0, posImpr: 0 };
    cur.clicks += clicks;
    cur.impressions += impressions;
    if (pos > 0 && impressions > 0) {
      cur.posWeighted += pos * impressions;
      cur.posImpr += impressions;
    }
    acc.set(key, cur);
  }
  const out: BingRow[] = [];
  for (const [key, v] of acc) {
    out.push({
      key,
      clicks: v.clicks,
      impressions: v.impressions,
      ctr: v.impressions > 0 ? v.clicks / v.impressions : 0,
      position: v.posImpr > 0 ? v.posWeighted / v.posImpr : 0,
    });
  }
  out.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
  return out;
}

function renderRowLines(rows: BingRow[], label: string): string[] {
  const lines = [`== ${label} ==`];
  if (rows.length === 0) {
    lines.push("Geen data in deze periode.");
    return lines;
  }
  for (const r of rows) {
    lines.push(
      `- ${r.key || "(leeg)"} — klikken ${r.clicks}, vertoningen ${r.impressions}, ` +
        `CTR ${(r.ctr * 100).toFixed(1)}%, gem. positie ${r.position.toFixed(1)}`,
    );
  }
  return lines;
}

/**
 * Pull a live, read-only Bing Webmaster report for one verified site.
 * Best-effort per section: a failing pages call never sinks the whole report.
 */
export async function fetchBingReport(
  rawSiteUrl: string,
  opts: { now?: number } = {},
): Promise<{ text: string; fetchedAt: Date; report: BingReport }> {
  const siteUrl = validateBingSiteUrl(rawSiteUrl);
  const now = opts.now ?? Date.now();
  const apiKey = readApiKey();

  const warnings: string[] = [];
  // Track whether the two primary data sources actually responded. A wrong API
  // key or wrong site URL makes every read fail; readApiKey only throws on a
  // *missing* key, so without this guard a bad key would be persisted as a
  // zeros-only report with HTTP 200, masking the failure (see end of function).
  let firstError: unknown = null;
  let trafficOk = false;
  let queriesOk = false;

  // 1. Totals from daily traffic stats (accurate clicks/impressions).
  let totals = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  let trafficEnd = now;
  try {
    const trafficRows = await bingFetch(apiKey, "GetRankAndTrafficStats", siteUrl);
    trafficEnd = latestBucket(trafficRows, now);
    const windowStart = trafficEnd - (BING_WINDOW_DAYS - 1) * 86_400_000;
    let clicks = 0;
    let impressions = 0;
    for (const r of trafficRows) {
      const ms = parseWcfDate(r.Date);
      if (ms !== null && (ms < windowStart || ms > trafficEnd)) continue;
      clicks += num(r.Clicks);
      impressions += num(r.Impressions);
    }
    totals = {
      clicks,
      impressions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      position: 0,
    };
    trafficOk = true;
  } catch (err) {
    firstError ??= err;
    warnings.push(
      `Verkeerstotalen konden niet worden opgehaald: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 2. Top queries (weekly buckets → aggregated over the recent window).
  let topQueries: BingRow[] = [];
  try {
    const rows = await bingFetch(apiKey, "GetQueryStats", siteUrl);
    topQueries = aggregateBuckets(rows, latestBucket(rows, now));
    queriesOk = true;
  } catch (err) {
    firstError ??= err;
    warnings.push(
      `Zoektermdata kon niet worden opgehaald: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 3. Top pages (best-effort; reuses the QueryStats shape with a page in `Query`).
  let topPages: BingRow[] = [];
  try {
    const rows = await bingFetch(apiKey, "GetPageStats", siteUrl);
    topPages = aggregateBuckets(rows, latestBucket(rows, now));
  } catch (err) {
    firstError ??= err;
    warnings.push(
      `Paginadata kon niet worden opgehaald: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // If neither primary data source could be read, the config is almost certainly
  // bad (wrong key or wrong site URL). Surface the original error (502/400)
  // instead of silently persisting an all-zeros report — this mirrors the
  // Search Console contract, where a failed totals call sinks the whole run.
  if (!trafficOk && !queriesOk) {
    throw (
      firstError ??
      new BingError("Bing Webmaster gaf geen data terug.", "API_ERROR")
    );
  }

  // Totals position: impression-weighted average over the aggregated queries
  // (the traffic-stats endpoint's position field is scaled inconsistently, so we
  // derive it from the already-de-scaled query rows instead).
  const posImpr = topQueries.reduce(
    (s, q) => (q.position > 0 ? s + q.impressions : s),
    0,
  );
  if (posImpr > 0) {
    totals.position =
      topQueries.reduce(
        (s, q) => (q.position > 0 ? s + q.position * q.impressions : s),
        0,
      ) / posImpr;
  }

  const endDate = isoDate(new Date(trafficEnd));
  const startDate = isoDate(
    new Date(trafficEnd - (BING_WINDOW_DAYS - 1) * 86_400_000),
  );

  const lines: string[] = [];
  lines.push(`Bing Webmaster: ${siteUrl}`);
  lines.push(`Periode (recentste ~4 weken): ${startDate} t/m ${endDate}`);
  lines.push("");
  lines.push("== Totalen ==");
  lines.push(`Klikken: ${totals.clicks}`);
  lines.push(`Vertoningen: ${totals.impressions}`);
  lines.push(`CTR: ${(totals.ctr * 100).toFixed(1)}%`);
  lines.push(`Gem. positie: ${totals.position.toFixed(1)}`);
  lines.push("");
  lines.push(...renderRowLines(topQueries.slice(0, MAX_ROWS), "Top zoektermen (op klikken)"));
  lines.push("");
  lines.push(...renderRowLines(topPages.slice(0, MAX_ROWS), "Top pagina's (op klikken)"));

  const signals = computeBingSignals(topQueries, {}, now);
  const renderedSignals = renderBingSignals(signals);
  if (renderedSignals) {
    lines.push("");
    lines.push("== Signalen ==");
    lines.push(renderedSignals);
  }

  if (warnings.length > 0) {
    lines.push("");
    lines.push("_Waarschuwingen:_");
    for (const w of warnings) lines.push(`- ${w}`);
  }

  let text = lines.join("\n");
  if (text.length > MAX_REPORT_LEN) {
    text = text.slice(0, MAX_REPORT_LEN) + "\n…(ingekort)";
  }

  return {
    text,
    fetchedAt: new Date(now),
    report: {
      siteUrl,
      startDate,
      endDate,
      totals,
      topQueries: topQueries.slice(0, MAX_ROWS),
      topPages: topPages.slice(0, MAX_ROWS),
    },
  };
}

/** One verified site the API key can access in Bing Webmaster Tools. */
export interface BingSite {
  /** e.g. "https://voorbeeld.be/". */
  siteUrl: string;
  isVerified: boolean;
}

interface BingSiteApiRow {
  Url?: string;
  IsVerified?: boolean;
}

/**
 * List the verified sites the API key can access in Bing Webmaster Tools —
 * READ ONLY. Unverified sites are dropped (no useful data behind them).
 * Never writes anything.
 */
export async function listBingSites(): Promise<BingSite[]> {
  const apiKey = readApiKey();
  const url = new URL(`${BING_BASE}/GetUserSites`);
  url.searchParams.set("apikey", apiKey);
  let res: Response;
  try {
    res = await fetch(url.toString(), { headers: { accept: "application/json" } });
  } catch (err) {
    throw new BingError(
      `Kon geen verbinding maken met de Bing Webmaster API: ${(err as Error).message}`,
      "NETWORK_ERROR",
    );
  }
  const text = await res.text();
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      detail =
        parsed?.Message ||
        parsed?.error?.message ||
        JSON.stringify(parsed).slice(0, 500);
    } catch {
      detail = text.slice(0, 500) || detail;
    }
    throw new BingError(
      `Bing Webmaster API-fout: ${detail}`,
      classifyError(res.status),
    );
  }
  let parsed: { d?: BingSiteApiRow[] };
  try {
    parsed = JSON.parse(text) as { d?: BingSiteApiRow[] };
  } catch {
    throw new BingError(
      "Onverwacht antwoord van de Bing Webmaster API (geen geldige JSON).",
      "API_ERROR",
    );
  }
  return (parsed.d ?? [])
    .filter((e): e is BingSiteApiRow => !!e?.Url)
    .map((e) => ({ siteUrl: e.Url as string, isVerified: e.IsVerified === true }));
}
