/**
 * Google Analytics 4 (Analytics Data API v1beta) intake — READ ONLY.
 *
 * The app ("brain") pulls a client's website analytics (sessions, users,
 * conversions, engagement; top channels and landing pages; last 28 days) from
 * the GA4 Data API and turns it into a compact, Dutch, human-readable report
 * plus a few sharp signals that feed the agents. We never write anything: only
 * `runReport` reporting calls are sent.
 *
 * Auth is the shared read-only OAuth token (`google-oauth.ts`, scope
 * `analytics.readonly`); the only per-client config is the numeric GA4 property
 * id (e.g. `123456789`).
 *
 * GA4 data is mostly final after ~1 day, so a 6-hour in-memory cache is plenty
 * and a gentle rate limiter keeps us well under quota.
 */

import { createHash } from "crypto";
import { getReadonlyAccessToken } from "./google-oauth";
import {
  computeGa4Signals,
  renderGa4Signals,
  type Ga4ChannelRow,
  type Ga4LandingPageRow,
  type Ga4Totals,
} from "./ga4-signals";

const GA4_BASE = "https://analyticsdata.googleapis.com/v1beta";

/** GA4 data is largely final after ~1 day; end the window a day back. */
const GA4_DATA_LAG_DAYS = 1;
const GA4_WINDOW_DAYS = 28;
const MAX_ROWS = 25;
const MAX_REPORT_LEN = 20_000;

/** Cache (6h) — GA4 refreshes ~daily, so this never serves meaningfully stale data. */
const GA4_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface Ga4CacheEntry {
  report: Ga4ApiReport;
  expiresAt: number;
}
const ga4Cache = new Map<string, Ga4CacheEntry>();

function ga4CacheKey(propertyId: string, body: Record<string, unknown>): string {
  return createHash("sha256")
    .update(`${propertyId}:${JSON.stringify(body)}`)
    .digest("hex");
}

/** Token-bucket rate limiter. GA4 quota is generous; default 10/min, burst 3. */
class Ga4RateLimiter {
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

const ga4Limiter = new Ga4RateLimiter(3, 10 / 60_000);

export { ga4Limiter, ga4Cache };

/** Thrown for missing/invalid config (e.g. bad property id) — surfaced as a 400. */
export class Ga4ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Ga4ConfigError";
  }
}

export type Ga4ErrorCode =
  | "AUTH_ERROR"
  | "RATE_LIMIT"
  | "NOT_FOUND"
  | "API_ERROR"
  | "NETWORK_ERROR"
  | "UNKNOWN_ERROR";

/** Thrown when the API returns an error or the call fails — surfaced as a 502. */
export class Ga4Error extends Error {
  code: Ga4ErrorCode;
  constructor(message: string, code: Ga4ErrorCode = "UNKNOWN_ERROR") {
    super(message);
    this.name = "Ga4Error";
    this.code = code;
  }
}

function classifyError(status: number, isNetwork = false): Ga4ErrorCode {
  if (isNetwork) return "NETWORK_ERROR";
  if (status === 429) return "RATE_LIMIT";
  if (status === 401 || status === 403) return "AUTH_ERROR";
  if (status === 404) return "NOT_FOUND";
  if (status >= 400) return "API_ERROR";
  return "UNKNOWN_ERROR";
}

interface Ga4ApiReport {
  dimensionHeaders?: { name?: string }[];
  metricHeaders?: { name?: string; type?: string }[];
  rows?: {
    dimensionValues?: { value?: string }[];
    metricValues?: { value?: string }[];
  }[];
}

export interface Ga4Report {
  propertyId: string;
  startDate: string;
  endDate: string;
  totals: Ga4Totals;
  channels: Ga4ChannelRow[];
  landingPages: Ga4LandingPageRow[];
}

/**
 * A GA4 property id is numeric. Accept an optional `properties/` prefix and
 * digit-grouping junk, then validate the bare number so we never interpolate
 * garbage into the request path.
 */
export function validatePropertyId(raw: string): string {
  const v = (raw ?? "").trim().replace(/^properties\//i, "");
  if (!v) {
    throw new Ga4ConfigError(
      "Geen GA4 property-id ingesteld voor deze klant.",
    );
  }
  if (!/^\d{6,}$/.test(v)) {
    throw new Ga4ConfigError(
      `Ongeldig GA4 property-id: "${raw}". Gebruik het numerieke property-id (bv. 123456789).`,
    );
  }
  return v;
}

function num(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Compute the [start, end] reporting window (UTC), accounting for GA4 lag. */
function reportWindow(now: number): { startDate: string; endDate: string } {
  const end = new Date(now - GA4_DATA_LAG_DAYS * 86_400_000);
  const start = new Date(end.getTime() - (GA4_WINDOW_DAYS - 1) * 86_400_000);
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

/**
 * Low-level `runReport` call with caching + rate limiting. Cache key excludes
 * the access token (it's auth, not query identity). On 429, halves the rate and
 * retries once after a short backoff.
 */
export async function ga4RunReport(
  accessToken: string,
  propertyId: string,
  body: Record<string, unknown>,
): Promise<Ga4ApiReport> {
  const cacheKey = ga4CacheKey(propertyId, body);
  const cached = ga4Cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.report;
  }

  await ga4Limiter.consume();

  const doFetch = async (): Promise<Ga4ApiReport> => {
    const url = `${GA4_BASE}/properties/${encodeURIComponent(propertyId)}:runReport`;
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
      throw new Ga4Error(
        `Kon geen verbinding maken met de GA4 Data API: ${(err as Error).message}`,
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
      throw new Ga4Error(`GA4 API-fout: ${detail}`, classifyError(res.status));
    }

    try {
      return JSON.parse(text) as Ga4ApiReport;
    } catch {
      throw new Ga4Error(
        "Onverwacht antwoord van de GA4 Data API (geen geldige JSON).",
        "API_ERROR",
      );
    }
  };

  let report: Ga4ApiReport;
  try {
    report = await doFetch();
  } catch (err) {
    if (err instanceof Ga4Error && err.code === "RATE_LIMIT") {
      ga4Limiter.halveRate();
      await new Promise((r) => setTimeout(r, 2000));
      await ga4Limiter.consume();
      report = await doFetch();
    } else {
      throw err;
    }
  }

  ga4Cache.set(cacheKey, { report, expiresAt: Date.now() + GA4_CACHE_TTL_MS });
  return report;
}

/** Map a runReport response into a metric-name → value lookup per row. */
function indexRows(
  report: Ga4ApiReport,
): { dims: string[]; metrics: Record<string, number> }[] {
  const metricNames = (report.metricHeaders ?? []).map((h) => h.name ?? "");
  return (report.rows ?? []).map((row) => {
    const dims = (row.dimensionValues ?? []).map((d) => d.value ?? "");
    const metrics: Record<string, number> = {};
    (row.metricValues ?? []).forEach((m, i) => {
      const name = metricNames[i];
      if (name) metrics[name] = num(m.value);
    });
    return { dims, metrics };
  });
}

const TOTALS_METRICS = [
  "sessions",
  "totalUsers",
  "screenPageViews",
  "conversions",
  "engagementRate",
];

function renderChannelLines(rows: Ga4ChannelRow[]): string[] {
  const lines = ["== Top kanalen (op sessies) =="];
  if (rows.length === 0) {
    lines.push("Geen data in deze periode.");
    return lines;
  }
  for (const r of rows) {
    lines.push(
      `- ${r.channel || "(onbekend)"} — sessies ${r.sessions}, conversies ${r.conversions}, ` +
        `engagement ${(r.engagementRate * 100).toFixed(1)}%`,
    );
  }
  return lines;
}

function renderLandingLines(rows: Ga4LandingPageRow[]): string[] {
  const lines = ["== Top landingspagina's (op sessies) =="];
  if (rows.length === 0) {
    lines.push("Geen data in deze periode.");
    return lines;
  }
  for (const r of rows) {
    lines.push(
      `- ${r.page || "(onbekend)"} — sessies ${r.sessions}, conversies ${r.conversions}`,
    );
  }
  return lines;
}

/**
 * Pull a live, read-only GA4 report for one property. Best-effort per section:
 * a failing channel query never sinks the whole report.
 */
export async function fetchGa4Report(
  rawPropertyId: string,
  opts: { now?: number } = {},
): Promise<{ text: string; fetchedAt: Date; report: Ga4Report }> {
  const propertyId = validatePropertyId(rawPropertyId);
  const now = opts.now ?? Date.now();
  const { startDate, endDate } = reportWindow(now);
  const accessToken = await getReadonlyAccessToken();

  const dateRanges = [{ startDate, endDate }];
  const warnings: string[] = [];

  // 1. Totals (no dimensions → a single aggregate row).
  let totals: Ga4Totals = {
    sessions: 0,
    totalUsers: 0,
    screenPageViews: 0,
    conversions: 0,
    engagementRate: 0,
  };
  try {
    const rep = await ga4RunReport(accessToken, propertyId, {
      dateRanges,
      metrics: TOTALS_METRICS.map((name) => ({ name })),
    });
    const m = indexRows(rep)[0]?.metrics ?? {};
    totals = {
      sessions: m.sessions ?? 0,
      totalUsers: m.totalUsers ?? 0,
      screenPageViews: m.screenPageViews ?? 0,
      conversions: m.conversions ?? 0,
      engagementRate: m.engagementRate ?? 0,
    };
  } catch (err) {
    warnings.push(
      `Totalen konden niet worden opgehaald: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 2. Top channels by sessions.
  let channels: Ga4ChannelRow[] = [];
  try {
    const rep = await ga4RunReport(accessToken, propertyId, {
      dateRanges,
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [
        { name: "sessions" },
        { name: "conversions" },
        { name: "engagementRate" },
      ],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: MAX_ROWS,
    });
    channels = indexRows(rep).map(({ dims, metrics }) => ({
      channel: dims[0] ?? "",
      sessions: metrics.sessions ?? 0,
      conversions: metrics.conversions ?? 0,
      engagementRate: metrics.engagementRate ?? 0,
    }));
  } catch (err) {
    warnings.push(
      `Kanaaldata kon niet worden opgehaald: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 3. Top landing pages by sessions (best-effort).
  let landingPages: Ga4LandingPageRow[] = [];
  try {
    const rep = await ga4RunReport(accessToken, propertyId, {
      dateRanges,
      dimensions: [{ name: "landingPage" }],
      metrics: [{ name: "sessions" }, { name: "conversions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: MAX_ROWS,
    });
    landingPages = indexRows(rep).map(({ dims, metrics }) => ({
      page: dims[0] ?? "",
      sessions: metrics.sessions ?? 0,
      conversions: metrics.conversions ?? 0,
    }));
  } catch (err) {
    warnings.push(
      `Landingspaginadata kon niet worden opgehaald: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const lines: string[] = [];
  lines.push(`GA4 property: ${propertyId}`);
  lines.push(`Periode: ${startDate} t/m ${endDate}`);
  lines.push("");
  lines.push("== Totalen ==");
  lines.push(`Sessies: ${totals.sessions}`);
  lines.push(`Gebruikers: ${totals.totalUsers}`);
  lines.push(`Paginaweergaven: ${totals.screenPageViews}`);
  lines.push(`Conversies: ${totals.conversions}`);
  lines.push(`Engagement rate: ${(totals.engagementRate * 100).toFixed(1)}%`);
  lines.push("");
  lines.push(...renderChannelLines(channels.slice(0, MAX_ROWS)));
  lines.push("");
  lines.push(...renderLandingLines(landingPages.slice(0, MAX_ROWS)));

  const signals = computeGa4Signals({ totals, channels, landingPages });
  const renderedSignals = renderGa4Signals(signals);
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
    report: { propertyId, startDate, endDate, totals, channels, landingPages },
  };
}
