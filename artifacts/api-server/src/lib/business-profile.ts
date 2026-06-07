/**
 * Google Business Profile (GMB) intake — READ ONLY.
 *
 * The app ("brain") pulls a location's local performance (impressions on Maps +
 * Search, calls, website clicks, direction requests, conversations over the last
 * ~30 days) from the Business Profile Performance API and turns it into a
 * compact, Dutch report plus a few sharp signals that feed the agents. We never
 * write anything: only `fetchMultiDailyMetricsTimeSeries` reporting calls.
 *
 * Auth is the shared read-only OAuth token (`google-oauth.ts`, business.manage
 * scope). The only per-client config is the location id (`locations/123…` or a
 * bare numeric id). NOTE: this API additionally requires Google's allowlist
 * approval before it returns live data — until then calls fail with an auth/quota
 * error, which we surface clearly. Data lags ~2-3 days like other Google sources,
 * so a 6-hour in-memory cache and a gentle rate limiter keep us under quota.
 */

import { createHash } from "crypto";
import { getReadonlyAccessToken } from "./google-oauth";
import {
  computeGmbSignals,
  renderGmbSignals,
  type GmbReport,
} from "./business-profile-signals";

const GMB_BASE = "https://businessprofileperformance.googleapis.com/v1";

/** GMB data is final after ~2-3 days; end the window a few days back. */
const GMB_DATA_LAG_DAYS = 3;
const GMB_WINDOW_DAYS = 30;
const MAX_REPORT_LEN = 20_000;

/** Cache (6h) — GMB refreshes ~daily, so this never serves meaningfully stale data. */
const GMB_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** The daily metrics we pull. Impressions are split four ways by the API. */
const IMPRESSION_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
] as const;
const ACTION_METRICS = [
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
  "BUSINESS_CONVERSATIONS",
] as const;
const ALL_METRICS = [...IMPRESSION_METRICS, ...ACTION_METRICS];

interface GmbCacheEntry {
  totals: Record<string, number>;
  expiresAt: number;
}
const businessProfileCache = new Map<string, GmbCacheEntry>();

function gmbCacheKey(locationId: string, start: string, end: string): string {
  return createHash("sha256")
    .update(`${locationId}:${start}:${end}`)
    .digest("hex");
}

/** Token-bucket rate limiter. GMB quota is modest; default ~6/min, burst 2. */
class BusinessProfileRateLimiter {
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

const businessProfileLimiter = new BusinessProfileRateLimiter(2, 6 / 60_000);

export { businessProfileLimiter, businessProfileCache };

/** Thrown for missing/invalid config (e.g. bad location id) — surfaced as a 400. */
export class BusinessProfileConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessProfileConfigError";
  }
}

export type BusinessProfileErrorCode =
  | "AUTH_ERROR"
  | "RATE_LIMIT"
  | "NOT_FOUND"
  | "API_ERROR"
  | "NETWORK_ERROR"
  | "UNKNOWN_ERROR";

/** Thrown when the API returns an error or the call fails — surfaced as a 502. */
export class BusinessProfileError extends Error {
  code: BusinessProfileErrorCode;
  constructor(
    message: string,
    code: BusinessProfileErrorCode = "UNKNOWN_ERROR",
  ) {
    super(message);
    this.name = "BusinessProfileError";
    this.code = code;
  }
}

function classifyError(status: number, isNetwork = false): BusinessProfileErrorCode {
  if (isNetwork) return "NETWORK_ERROR";
  if (status === 429) return "RATE_LIMIT";
  if (status === 401 || status === 403) return "AUTH_ERROR";
  if (status === 404) return "NOT_FOUND";
  if (status >= 400) return "API_ERROR";
  return "UNKNOWN_ERROR";
}

/**
 * Normalize a location id into the bare numeric id used in the request path.
 * Accepts "locations/123", "accounts/9/locations/123", or "123".
 */
export function normalizeLocationId(raw: string): string {
  const v = (raw ?? "").trim();
  if (!v) {
    throw new BusinessProfileConfigError(
      "Geen Business Profile-locatie ingesteld voor deze klant.",
    );
  }
  const match = v.match(/(?:^|\/)locations\/([^/]+)/i);
  const id = match ? match[1] : v;
  if (!/^[A-Za-z0-9]+$/.test(id)) {
    throw new BusinessProfileConfigError(
      `Ongeldige Business Profile-locatie: "${v}". Gebruik "locations/123…" of het numerieke locatie-id.`,
    );
  }
  return id;
}

function num(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Compute the [start, end] reporting window (UTC), accounting for GMB lag. */
function reportWindow(now: number): { start: Date; end: Date } {
  const end = new Date(now - GMB_DATA_LAG_DAYS * 86_400_000);
  const start = new Date(end.getTime() - (GMB_WINDOW_DAYS - 1) * 86_400_000);
  return { start, end };
}

interface DatedValue {
  date?: { year?: number; month?: number; day?: number };
  value?: string | number;
}
interface DailyMetricTimeSeries {
  dailyMetric?: string;
  timeSeries?: { datedValues?: DatedValue[] };
}
interface MultiResponse {
  multiDailyMetricTimeSeries?: {
    dailyMetricTimeSeries?: DailyMetricTimeSeries[];
  }[];
}

/**
 * Low-level `fetchMultiDailyMetricsTimeSeries` call with caching + rate
 * limiting. Returns per-metric totals (summed over the window). Cache key
 * excludes the access token (it's auth, not query identity). On 429, halves the
 * rate and retries once after a short backoff.
 */
export async function fetchDailyMetricTotals(
  accessToken: string,
  locationId: string,
  start: Date,
  end: Date,
): Promise<Record<string, number>> {
  const cacheKey = gmbCacheKey(locationId, isoDate(start), isoDate(end));
  const cached = businessProfileCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.totals;
  }

  await businessProfileLimiter.consume();

  const url = new URL(
    `${GMB_BASE}/locations/${encodeURIComponent(locationId)}:fetchMultiDailyMetricsTimeSeries`,
  );
  for (const m of ALL_METRICS) url.searchParams.append("dailyMetrics", m);
  url.searchParams.set("dailyRange.startDate.year", String(start.getUTCFullYear()));
  url.searchParams.set("dailyRange.startDate.month", String(start.getUTCMonth() + 1));
  url.searchParams.set("dailyRange.startDate.day", String(start.getUTCDate()));
  url.searchParams.set("dailyRange.endDate.year", String(end.getUTCFullYear()));
  url.searchParams.set("dailyRange.endDate.month", String(end.getUTCMonth() + 1));
  url.searchParams.set("dailyRange.endDate.day", String(end.getUTCDate()));

  const doFetch = async (): Promise<Record<string, number>> => {
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: "GET",
        headers: { authorization: `Bearer ${accessToken}` },
      });
    } catch (err) {
      throw new BusinessProfileError(
        `Kon geen verbinding maken met de Business Profile API: ${(err as Error).message}`,
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
      throw new BusinessProfileError(
        `Business Profile API-fout: ${detail}`,
        classifyError(res.status),
      );
    }

    let parsed: MultiResponse;
    try {
      parsed = JSON.parse(text) as MultiResponse;
    } catch {
      throw new BusinessProfileError(
        "Onverwacht antwoord van de Business Profile API (geen geldige JSON).",
        "API_ERROR",
      );
    }

    const totals: Record<string, number> = {};
    for (const m of ALL_METRICS) totals[m] = 0;
    for (const multi of parsed.multiDailyMetricTimeSeries ?? []) {
      for (const series of multi.dailyMetricTimeSeries ?? []) {
        const metric = series.dailyMetric ?? "";
        if (!(metric in totals)) continue;
        for (const dv of series.timeSeries?.datedValues ?? []) {
          totals[metric] += num(dv.value);
        }
      }
    }
    return totals;
  };

  let totals: Record<string, number>;
  try {
    totals = await doFetch();
  } catch (err) {
    if (err instanceof BusinessProfileError && err.code === "RATE_LIMIT") {
      businessProfileLimiter.halveRate();
      await new Promise((r) => setTimeout(r, 2000));
      await businessProfileLimiter.consume();
      totals = await doFetch();
    } else {
      throw err;
    }
  }

  businessProfileCache.set(cacheKey, {
    totals,
    expiresAt: Date.now() + GMB_CACHE_TTL_MS,
  });
  return totals;
}

function sum(totals: Record<string, number>, keys: readonly string[]): number {
  return keys.reduce((acc, k) => acc + (totals[k] ?? 0), 0);
}

const METRIC_LABELS: Record<string, string> = {
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "Vertoningen — Maps (desktop)",
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "Vertoningen — Zoeken (desktop)",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "Vertoningen — Maps (mobiel)",
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "Vertoningen — Zoeken (mobiel)",
  CALL_CLICKS: "Telefoonklikken",
  WEBSITE_CLICKS: "Websiteklikken",
  BUSINESS_DIRECTION_REQUESTS: "Route-aanvragen",
  BUSINESS_CONVERSATIONS: "Berichten",
};

/**
 * Pull a live, read-only Business Profile report for one location and turn it
 * into a Dutch report + signals. Throws config/auth errors so the route can map
 * them to clear HTTP statuses.
 */
export async function fetchBusinessProfileReport(
  rawLocationId: string,
  opts: { now?: number } = {},
): Promise<{ text: string; fetchedAt: Date; report: GmbReport }> {
  const locationId = normalizeLocationId(rawLocationId);
  const now = opts.now ?? Date.now();
  const { start, end } = reportWindow(now);
  const accessToken = await getReadonlyAccessToken();

  const totals = await fetchDailyMetricTotals(accessToken, locationId, start, end);

  const impressions = sum(totals, IMPRESSION_METRICS);
  const calls = totals.CALL_CLICKS ?? 0;
  const websiteClicks = totals.WEBSITE_CLICKS ?? 0;
  const directionRequests = totals.BUSINESS_DIRECTION_REQUESTS ?? 0;
  const conversations = totals.BUSINESS_CONVERSATIONS ?? 0;
  const actions = calls + websiteClicks + directionRequests + conversations;

  const report: GmbReport = {
    locationId,
    startDate: isoDate(start),
    endDate: isoDate(end),
    metrics: totals,
    impressions,
    calls,
    websiteClicks,
    directionRequests,
    conversations,
    actions,
  };

  const lines: string[] = [];
  lines.push(`Business Profile-locatie: ${locationId}`);
  lines.push(`Periode: ${report.startDate} t/m ${report.endDate}`);
  lines.push("");
  lines.push("== Totalen ==");
  lines.push(`Vertoningen (totaal): ${impressions}`);
  for (const m of ALL_METRICS) {
    lines.push(`${METRIC_LABELS[m] ?? m}: ${totals[m] ?? 0}`);
  }
  lines.push(`Acties (totaal): ${actions}`);

  const signals = computeGmbSignals(report);
  const renderedSignals = renderGmbSignals(signals);
  if (renderedSignals) {
    lines.push("");
    lines.push("== Signalen ==");
    lines.push(renderedSignals);
  }

  let text = lines.join("\n");
  if (text.length > MAX_REPORT_LEN) {
    text = text.slice(0, MAX_REPORT_LEN) + "\n…(ingekort)";
  }

  return { text, fetchedAt: new Date(now), report };
}
