import { clientsTable, type Client } from "@workspace/db";
import { collectClientUrls } from "../lib/website-intake";

/**
 * Helpers shared across the split clients route modules (core CRM,
 * integrations/live-data, billing, discovery). Kept in one place so the modules
 * stay decoupled without duplicating the request parsing / serialization rules.
 */

/** Trim a value to a non-empty string, or `null` when blank / not a string. */
export function asTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Parse a positive integer id from a route param, or `null` when invalid. */
export function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Shape a DB row for the API response (timestamps as ISO strings). */
export function serialize(client: Client) {
  return {
    ...client,
    websiteIntakeAt: client.websiteIntakeAt
      ? client.websiteIntakeAt.toISOString()
      : null,
    googleAdsLiveAt: client.googleAdsLiveAt
      ? client.googleAdsLiveAt.toISOString()
      : null,
    competitorAdsLiveAt: client.competitorAdsLiveAt
      ? client.competitorAdsLiveAt.toISOString()
      : null,
    searchConsoleLiveAt: client.searchConsoleLiveAt
      ? client.searchConsoleLiveAt.toISOString()
      : null,
    bingLiveAt: client.bingLiveAt ? client.bingLiveAt.toISOString() : null,
    ga4LiveAt: client.ga4LiveAt ? client.ga4LiveAt.toISOString() : null,
    placesLiveAt: client.placesLiveAt
      ? client.placesLiveAt.toISOString()
      : null,
    pagespeedLiveAt: client.pagespeedLiveAt
      ? client.pagespeedLiveAt.toISOString()
      : null,
    businessProfileLiveAt: client.businessProfileLiveAt
      ? client.businessProfileLiveAt.toISOString()
      : null,
    crawlLiveAt: client.crawlLiveAt ? client.crawlLiveAt.toISOString() : null,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
  };
}

/**
 * Resolve which URLs PageSpeed should measure. Explicit `pagespeedUrls` win; if
 * none are set we fall back to the client's own Website (+ landing pages) so a
 * client never has to type the URL twice and PageSpeed runs automatically in the
 * bulk "Alles verversen" loop. Also drives the coverage matrix's "configured"
 * flag, so it lives here next to the other shared client helpers.
 */
export function resolvePagespeedUrls(row: Client): string[] {
  const explicit = (row.pagespeedUrls ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (explicit.length > 0) return explicit;
  return collectClientUrls(row.website, row.landingPages);
}

// Re-export so consumers can grab the table alongside the helpers if needed.
export { clientsTable };
