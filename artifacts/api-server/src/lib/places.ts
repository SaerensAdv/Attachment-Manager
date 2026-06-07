/**
 * Google Maps / Places (Places API New) intake — READ ONLY.
 *
 * The app ("brain") looks up a client's own Google listing plus any named
 * competitors and turns their public reputation (rating, review count, category,
 * business status) into a compact, Dutch report plus a few sharp signals that
 * feed the agents. We never write anything: only `places:searchText` calls.
 *
 * Auth is a plain API key (`GOOGLE_MAPS_API_KEY`) passed as the `X-Goog-Api-Key`
 * header; the field mask keeps the response (and the bill) tight. Calls are
 * billed per request, so an in-memory cache and a token-bucket rate limiter are
 * mandatory, mirroring `serpapi.ts` / `google-ads.ts`.
 */

import { createHash } from "crypto";
import {
  computePlaceSignals,
  renderPlaceSignals,
  type PlaceRecord,
} from "./places-signals";

const PLACES_BASE = "https://places.googleapis.com/v1/places:searchText";

/** Reputation data changes slowly; a 6-hour cache is plenty. */
const PLACES_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const MAX_COMPETITORS = 10;
const MAX_REPORT_LEN = 20_000;

/** Only the fields we actually use — keeps the response and the bill tight. */
const FIELD_MASK = [
  "places.displayName",
  "places.rating",
  "places.userRatingCount",
  "places.primaryType",
  "places.formattedAddress",
  "places.businessStatus",
].join(",");

interface PlacesCacheEntry {
  json: Record<string, unknown>;
  expiresAt: number;
}
const placesCache = new Map<string, PlacesCacheEntry>();

function placesCacheKey(textQuery: string, region: string): string {
  return createHash("sha256")
    .update(`${region}:${textQuery.toLowerCase()}`)
    .digest("hex");
}

/** Token-bucket rate limiter. Places quota is generous; default 10/min, burst 3. */
class PlacesRateLimiter {
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

const placesLimiter = new PlacesRateLimiter(3, 10 / 60_000);

export { placesLimiter, placesCache };

/** Thrown when the Maps key is missing — surfaced to the user as a 400. */
export class PlacesConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlacesConfigError";
  }
}

export type PlacesErrorCode =
  | "AUTH_ERROR"
  | "RATE_LIMIT"
  | "NOT_FOUND"
  | "API_ERROR"
  | "NETWORK_ERROR"
  | "UNKNOWN_ERROR";

/** Thrown when Places returns an error or the call fails — surfaced as a 502. */
export class PlacesError extends Error {
  code: PlacesErrorCode;
  constructor(message: string, code: PlacesErrorCode = "UNKNOWN_ERROR") {
    super(message);
    this.name = "PlacesError";
    this.code = code;
  }
}

function classifyError(status: number, isNetwork = false): PlacesErrorCode {
  if (isNetwork) return "NETWORK_ERROR";
  if (status === 429) return "RATE_LIMIT";
  if (status === 401 || status === 403) return "AUTH_ERROR";
  if (status === 404) return "NOT_FOUND";
  if (status >= 400) return "API_ERROR";
  return "UNKNOWN_ERROR";
}

function readApiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim() ?? "";
  if (!key) {
    throw new PlacesConfigError(
      "Google Maps is nog niet geconfigureerd. Ontbrekende secret: GOOGLE_MAPS_API_KEY.",
    );
  }
  return key;
}

function num(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Core provider call: run one Places text search and return the parsed JSON.
 * Cached (6h TTL), rate-limited, with a single 429 retry after backoff. Keep all
 * Places specifics here so callers stay provider-agnostic.
 */
export async function placesSearchText(
  textQuery: string,
  region: string,
): Promise<Record<string, unknown>> {
  const apiKey = readApiKey();
  const cacheKey = placesCacheKey(textQuery, region);
  const cached = placesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.json;
  }

  await placesLimiter.consume();

  const doFetch = async (): Promise<Record<string, unknown>> => {
    let res: Response;
    try {
      res = await fetch(PLACES_BASE, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify({
          textQuery,
          languageCode: "nl",
          regionCode: region,
          maxResultCount: 1,
        }),
      });
    } catch (err) {
      throw new PlacesError(
        `Kon geen verbinding maken met de Places API: ${(err as Error).message}`,
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
      throw new PlacesError(`Places API-fout: ${detail}`, classifyError(res.status));
    }

    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new PlacesError(
        "Onverwacht antwoord van de Places API (geen geldige JSON).",
        "API_ERROR",
      );
    }
  };

  let json: Record<string, unknown>;
  try {
    json = await doFetch();
  } catch (err) {
    if (err instanceof PlacesError && err.code === "RATE_LIMIT") {
      placesLimiter.halveRate();
      await new Promise((r) => setTimeout(r, 2000));
      await placesLimiter.consume();
      json = await doFetch();
    } else {
      throw err;
    }
  }

  placesCache.set(cacheKey, { json, expiresAt: Date.now() + PLACES_CACHE_TTL_MS });
  return json;
}

/** Map the top place of a searchText response into a normalized record. */
function parseTopPlace(
  json: Record<string, unknown>,
  query: string,
  role: "client" | "competitor",
): PlaceRecord {
  const places = Array.isArray(json.places)
    ? (json.places as Record<string, unknown>[])
    : [];
  const top = places[0];
  if (!top) {
    return {
      query,
      role,
      name: "",
      found: false,
      rating: 0,
      reviewCount: 0,
      primaryType: "",
      formattedAddress: "",
      businessStatus: "",
    };
  }
  const displayName =
    (top.displayName as Record<string, unknown> | undefined)?.text ?? "";
  return {
    query,
    role,
    name: String(displayName || query),
    found: true,
    rating: num(top.rating),
    reviewCount: num(top.userRatingCount),
    primaryType: String(top.primaryType ?? ""),
    formattedAddress: String(top.formattedAddress ?? ""),
    businessStatus: String(top.businessStatus ?? ""),
  };
}

function renderPlaceLine(r: PlaceRecord): string {
  if (!r.found) {
    return `- ${r.query}: geen Google-listing gevonden.`;
  }
  const parts = [`rating ${r.rating > 0 ? r.rating.toFixed(1) : "n.v.t."}`];
  parts.push(`${r.reviewCount} reviews`);
  if (r.primaryType) parts.push(r.primaryType);
  if (r.businessStatus && r.businessStatus !== "OPERATIONAL") {
    parts.push(`status: ${r.businessStatus}`);
  }
  const addr = r.formattedAddress ? ` — ${r.formattedAddress}` : "";
  return `- ${r.name} (${parts.join(", ")})${addr}`;
}

/**
 * Pull a live, read-only Places report: the client's own listing plus any named
 * competitors. Best-effort per query — one failing lookup never sinks the rest.
 */
export async function fetchPlacesReport(
  clientQuery: string,
  competitorQueries: string[],
  opts: { region?: string } = {},
): Promise<{ text: string; fetchedAt: Date; records: PlaceRecord[] }> {
  readApiKey(); // fail fast with a clear config error if the key is missing
  const region = (opts.region ?? "BE").toUpperCase();
  const records: PlaceRecord[] = [];
  const notes: string[] = [];

  const clean = (s: string) => s.trim();
  const client = clean(clientQuery);
  const competitors = competitorQueries
    .map(clean)
    .filter(Boolean)
    .slice(0, MAX_COMPETITORS);

  if (client) {
    try {
      const json = await placesSearchText(client, region);
      records.push(parseTopPlace(json, client, "client"));
    } catch (err) {
      notes.push(`- ${client}: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`);
    }
  }

  for (const q of competitors) {
    try {
      const json = await placesSearchText(q, region);
      records.push(parseTopPlace(json, q, "competitor"));
    } catch (err) {
      notes.push(`- ${q}: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`);
    }
  }

  const lines: string[] = [];
  const clientRec = records.find((r) => r.role === "client");
  if (clientRec) {
    lines.push("== Eigen Google-listing ==");
    lines.push(renderPlaceLine(clientRec));
    lines.push("");
  }
  const compRecs = records.filter((r) => r.role === "competitor");
  if (compRecs.length > 0) {
    lines.push("== Concurrenten ==");
    for (const r of compRecs) lines.push(renderPlaceLine(r));
    lines.push("");
  }

  const signals = computePlaceSignals(records);
  const renderedSignals = renderPlaceSignals(signals);
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
  if (!text) text = "Geen Places-data beschikbaar.";
  if (text.length > MAX_REPORT_LEN) {
    text = text.slice(0, MAX_REPORT_LEN) + "\n…(ingekort)";
  }

  return { text, fetchedAt: new Date(), records };
}
