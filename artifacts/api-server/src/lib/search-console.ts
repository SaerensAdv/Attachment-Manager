/**
 * Google Search Console intake — READ ONLY.
 *
 * The app ("brain") pulls a client's organic search performance (top queries +
 * pages, last 28 days) from the Search Console API and turns it into a compact,
 * Dutch, human-readable report plus a few sharp signals that feed the agents.
 * We never write anything: only `searchAnalytics/query` reporting calls are sent.
 *
 * Auth is the shared read-only OAuth token (`google-oauth.ts`); the only
 * per-client config is the verified property URL (`sc-domain:example.com` for a
 * domain property, or `https://example.com/` for a URL-prefix property).
 *
 * Search Console data lags ~2-3 days and updates roughly daily, so a 6-hour
 * in-memory cache is plenty and a gentle rate limiter keeps us well under quota.
 */

import { createHash } from "crypto";
import { getReadonlyAccessToken } from "./google-oauth";
import {
  computeSearchConsoleSignals,
  renderSearchConsoleSignals,
} from "./search-console-signals";

const SC_BASE = "https://searchconsole.googleapis.com/webmasters/v3";

/** GSC data is final after ~2-3 days; end the window a few days back. */
const SC_DATA_LAG_DAYS = 3;
const SC_WINDOW_DAYS = 28;
const MAX_ROWS = 50;
const MAX_REPORT_LEN = 20_000;

/** Cache (6h) — GSC refreshes ~daily, so this never serves meaningfully stale data. */
const SC_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface ScCacheEntry {
  rows: ScApiRow[];
  expiresAt: number;
}
const searchConsoleCache = new Map<string, ScCacheEntry>();

function scCacheKey(siteUrl: string, body: Record<string, unknown>): string {
  return createHash("sha256")
    .update(`${siteUrl}:${JSON.stringify(body)}`)
    .digest("hex");
}

/** Token-bucket rate limiter. GSC quota is generous; default 10/min, burst 3. */
class SearchConsoleRateLimiter {
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

const searchConsoleLimiter = new SearchConsoleRateLimiter(3, 10 / 60_000);

export { searchConsoleLimiter, searchConsoleCache };

/** Thrown for missing/invalid config (e.g. bad site URL) — surfaced as a 400. */
export class SearchConsoleConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchConsoleConfigError";
  }
}

export type SearchConsoleErrorCode =
  | "AUTH_ERROR"
  | "RATE_LIMIT"
  | "NOT_FOUND"
  | "API_ERROR"
  | "NETWORK_ERROR"
  | "UNKNOWN_ERROR";

/** Thrown when the API returns an error or the call fails — surfaced as a 502. */
export class SearchConsoleError extends Error {
  code: SearchConsoleErrorCode;
  constructor(message: string, code: SearchConsoleErrorCode = "UNKNOWN_ERROR") {
    super(message);
    this.name = "SearchConsoleError";
    this.code = code;
  }
}

function classifyError(status: number, isNetwork = false): SearchConsoleErrorCode {
  if (isNetwork) return "NETWORK_ERROR";
  if (status === 429) return "RATE_LIMIT";
  if (status === 401 || status === 403) return "AUTH_ERROR";
  if (status === 404) return "NOT_FOUND";
  if (status >= 500) return "API_ERROR";
  if (status >= 400) return "API_ERROR";
  return "UNKNOWN_ERROR";
}

/** One normalized Search Console row (a query or a page). */
export interface SearchConsoleRow {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number; // fraction 0..1
  position: number; // average; lower is better
}

export interface SearchConsoleReport {
  siteUrl: string;
  startDate: string;
  endDate: string;
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  topQueries: SearchConsoleRow[];
  topPages: SearchConsoleRow[];
}

interface ScApiRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

/**
 * A verified property is either a domain property (`sc-domain:example.com`) or a
 * URL-prefix property (`https://example.com/`). Reject anything else early so we
 * never interpolate junk into the request path.
 */
export function validateSiteUrl(raw: string): string {
  const v = (raw ?? "").trim();
  if (!v) {
    throw new SearchConsoleConfigError(
      "Geen Search Console-property ingesteld voor deze klant.",
    );
  }
  if (/^sc-domain:[a-z0-9.-]+$/i.test(v)) return v;
  if (/^https?:\/\/[^\s]+$/i.test(v)) return v;
  throw new SearchConsoleConfigError(
    `Ongeldige Search Console-property: "${v}". Gebruik "sc-domain:voorbeeld.be" of "https://voorbeeld.be/".`,
  );
}

function num(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Compute the [start, end] reporting window (UTC), accounting for GSC lag. */
function reportWindow(now: number): { startDate: string; endDate: string } {
  const end = new Date(now - SC_DATA_LAG_DAYS * 86_400_000);
  const start = new Date(end.getTime() - (SC_WINDOW_DAYS - 1) * 86_400_000);
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

/**
 * Low-level `searchAnalytics/query` call with caching + rate limiting.
 * Cache key excludes the access token (it's auth, not query identity).
 * On 429, halves the rate and retries once after a short backoff.
 */
export async function searchConsoleQuery(
  accessToken: string,
  siteUrl: string,
  body: Record<string, unknown>,
): Promise<ScApiRow[]> {
  const cacheKey = scCacheKey(siteUrl, body);
  const cached = searchConsoleCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.rows;
  }

  await searchConsoleLimiter.consume();

  const doFetch = async (): Promise<ScApiRow[]> => {
    const url = `${SC_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new SearchConsoleError(
        `Kon geen verbinding maken met de Search Console API: ${(err as Error).message}`,
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
      throw new SearchConsoleError(
        `Search Console API-fout: ${detail}`,
        classifyError(res.status),
      );
    }

    let parsed: { rows?: ScApiRow[] };
    try {
      parsed = JSON.parse(text) as { rows?: ScApiRow[] };
    } catch {
      throw new SearchConsoleError(
        "Onverwacht antwoord van de Search Console API (geen geldige JSON).",
        "API_ERROR",
      );
    }
    return parsed.rows ?? [];
  };

  let rows: ScApiRow[];
  try {
    rows = await doFetch();
  } catch (err) {
    if (err instanceof SearchConsoleError && err.code === "RATE_LIMIT") {
      searchConsoleLimiter.halveRate();
      await new Promise((r) => setTimeout(r, 2000));
      await searchConsoleLimiter.consume();
      rows = await doFetch();
    } else {
      throw err;
    }
  }

  searchConsoleCache.set(cacheKey, {
    rows,
    expiresAt: Date.now() + SC_CACHE_TTL_MS,
  });
  return rows;
}

function toRow(r: ScApiRow): SearchConsoleRow {
  return {
    key: r.keys?.[0] ?? "",
    clicks: num(r.clicks),
    impressions: num(r.impressions),
    ctr: num(r.ctr),
    position: num(r.position),
  };
}

function renderRowLines(rows: SearchConsoleRow[], label: string): string[] {
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
 * Pull a live, read-only Search Console report for one verified property.
 * Best-effort per section: a failing pages query never sinks the whole report.
 */
export async function fetchSearchConsoleReport(
  rawSiteUrl: string,
  opts: { now?: number; dateRange?: { startDate: string; endDate: string } } = {},
): Promise<{ text: string; fetchedAt: Date; report: SearchConsoleReport }> {
  const siteUrl = validateSiteUrl(rawSiteUrl);
  const now = opts.now ?? Date.now();
  // A caller can pin an exact reporting window (e.g. a completed calendar month
  // for the SEO report's period-over-period comparison); otherwise fall back to
  // the rolling 28-day window that accounts for GSC's ~3-day data lag.
  const { startDate, endDate } = opts.dateRange ?? reportWindow(now);
  const accessToken = await getReadonlyAccessToken();

  const base = { startDate, endDate, dataState: "final" as const };

  // 1. Totals (no dimensions → a single aggregate row).
  const totalsRows = await searchConsoleQuery(accessToken, siteUrl, { ...base });
  const t = totalsRows[0] ?? {};
  const totals = {
    clicks: num(t.clicks),
    impressions: num(t.impressions),
    ctr: num(t.ctr),
    position: num(t.position),
  };

  const warnings: string[] = [];

  // 2. Top queries by clicks.
  let topQueries: SearchConsoleRow[] = [];
  try {
    const rows = await searchConsoleQuery(accessToken, siteUrl, {
      ...base,
      dimensions: ["query"],
      rowLimit: MAX_ROWS,
    });
    topQueries = rows.map(toRow);
  } catch (err) {
    warnings.push(
      `Zoektermdata kon niet worden opgehaald: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 3. Top pages by clicks (best-effort).
  let topPages: SearchConsoleRow[] = [];
  try {
    const rows = await searchConsoleQuery(accessToken, siteUrl, {
      ...base,
      dimensions: ["page"],
      rowLimit: MAX_ROWS,
    });
    topPages = rows.map(toRow);
  } catch (err) {
    warnings.push(
      `Paginadata kon niet worden opgehaald: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const lines: string[] = [];
  lines.push(`Search Console: ${siteUrl}`);
  lines.push(`Periode: ${startDate} t/m ${endDate}`);
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

  const signals = computeSearchConsoleSignals(topQueries, {}, now);
  const renderedSignals = renderSearchConsoleSignals(signals);
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
    report: { siteUrl, startDate, endDate, totals, topQueries, topPages },
  };
}

/** One verified property the OAuth user can access in Search Console. */
export interface SearchConsoleSite {
  /** e.g. "sc-domain:voorbeeld.be" or "https://voorbeeld.be/". */
  siteUrl: string;
  /** "siteOwner" | "siteFullUser" | "siteRestrictedUser" | "siteUnverifiedUser". */
  permissionLevel: string;
}

/**
 * List the verified Search Console properties the read-only user can access —
 * READ ONLY. Unverified properties are dropped (no useful data behind them).
 * Powers client discovery; never writes anything.
 */
export async function listSearchConsoleSites(): Promise<SearchConsoleSite[]> {
  const accessToken = await getReadonlyAccessToken();
  let res: Response;
  try {
    res = await fetch(`${SC_BASE}/sites`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    throw new SearchConsoleError(
      `Kon geen verbinding maken met de Search Console API: ${(err as Error).message}`,
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
    throw new SearchConsoleError(
      `Search Console API-fout: ${detail}`,
      classifyError(res.status),
    );
  }
  let parsed: { siteEntry?: SearchConsoleSite[] };
  try {
    parsed = JSON.parse(text) as { siteEntry?: SearchConsoleSite[] };
  } catch {
    throw new SearchConsoleError(
      "Onverwacht antwoord van de Search Console API (geen geldige JSON).",
      "API_ERROR",
    );
  }
  return (parsed.siteEntry ?? [])
    .filter(
      (e): e is SearchConsoleSite =>
        !!e?.siteUrl && e.permissionLevel !== "siteUnverifiedUser",
    )
    .map((e) => ({
      siteUrl: e.siteUrl,
      permissionLevel: e.permissionLevel ?? "",
    }));
}
