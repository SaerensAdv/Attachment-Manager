/**
 * Client discovery (READ ONLY) — find accounts the agency manages that aren't
 * yet a client in the brain, and spot missing integration keys on the clients
 * that already exist.
 *
 * Two sources, both already wired for live reporting:
 *   - Google Ads MCC child-accounts (`listAdsAccounts`)
 *   - Search Console verified domains (`listSearchConsoleSites`)
 *
 * This module never mutates anything. It returns a structured proposal the UI
 * renders as a review list; the user confirms before any client is created or
 * any key filled (see the discovery/apply route). Each source is best-effort:
 * if one API fails we still return what the other gave us, plus a warning.
 */

import { db, clientsTable, type Client } from "@workspace/db";
import { listAdsAccounts, type AdsAccount } from "./google-ads";
import {
  listSearchConsoleSites,
  type SearchConsoleSite,
} from "./search-console";

/** Fill a single missing integration key on an existing client. */
export interface DiscoveryEnrichment {
  clientId: number;
  clientName: string;
  field: "googleAdsCustomerId" | "searchConsoleSiteUrl";
  value: string;
  /** Human-readable why-we-matched, shown in the review list. */
  reason: string;
}

/** A discovered account with no matching client — propose creating one. */
export interface DiscoveryNewClient {
  /** Stable key for the UI (the ads id, or the sc site url). */
  key: string;
  suggestedName: string;
  source: "google-ads" | "search-console";
  googleAdsCustomerId: string | null;
  searchConsoleSiteUrl: string | null;
  website: string | null;
  reason: string;
}

export interface DiscoveryResult {
  adsAvailable: boolean;
  scAvailable: boolean;
  adsAccountCount: number;
  scSiteCount: number;
  enrichments: DiscoveryEnrichment[];
  newClients: DiscoveryNewClient[];
  warnings: string[];
}

/** Lowercase, strip diacritics + common legal suffixes + all non-alphanumerics. */
function normalizeName(raw: string): string {
  const STOP = new Set([
    "bv",
    "bvba",
    "nv",
    "vof",
    "sa",
    "srl",
    "comm",
    "mcc",
  ]);
  return (raw ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP.has(t))
    .join("");
}

/** Strip a leading "www." from a hostname. */
function stripWww(host: string): string {
  return host.replace(/^www\./, "");
}

/** Normalized registrable-ish domain for a website value, or null. */
function domainFromWebsite(website: string | null | undefined): string | null {
  const v = (website ?? "").trim();
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    return stripWww(new URL(withScheme).hostname.toLowerCase()) || null;
  } catch {
    return null;
  }
}

/** Normalized domain for a Search Console property (sc-domain: or url-prefix). */
function domainFromScSite(siteUrl: string): string | null {
  const v = (siteUrl ?? "").trim();
  if (!v) return null;
  if (/^sc-domain:/i.test(v)) {
    return stripWww(v.slice("sc-domain:".length).toLowerCase()) || null;
  }
  return domainFromWebsite(v);
}

/** First domain label, stripped of non-alphanumerics — e.g. "growth-gate.be" → "growthgate". */
function siteBaseName(domain: string): string {
  const firstLabel = domain.split(".")[0] ?? "";
  return firstLabel.replace(/[^a-z0-9]/g, "");
}

/** Prefer a domain property over a url-prefix property when both verify a domain. */
function preferScSite(a: SearchConsoleSite, b: SearchConsoleSite): SearchConsoleSite {
  const aDomain = /^sc-domain:/i.test(a.siteUrl);
  const bDomain = /^sc-domain:/i.test(b.siteUrl);
  if (aDomain && !bDomain) return a;
  if (bDomain && !aDomain) return b;
  return a;
}

/**
 * Run discovery against both sources and the current client table. Pure read:
 * builds enrichment + new-client proposals, never writes.
 */
export async function discoverClients(): Promise<DiscoveryResult> {
  const warnings: string[] = [];

  let adsAccounts: AdsAccount[] = [];
  let adsAvailable = true;
  try {
    adsAccounts = (await listAdsAccounts()).filter(
      (a) => !a.isManager && a.level > 0,
    );
  } catch (err) {
    adsAvailable = false;
    warnings.push(
      `Google Ads-accounts konden niet worden opgehaald: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let scSites: SearchConsoleSite[] = [];
  let scAvailable = true;
  try {
    scSites = await listSearchConsoleSites();
  } catch (err) {
    scAvailable = false;
    warnings.push(
      `Search Console-domeinen konden niet worden opgehaald: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const clients = await db.select().from(clientsTable);

  // --- Existing-client lookups -------------------------------------------------
  const existingAdsIds = new Set<string>();
  const clientNameNorms = new Set<string>();
  const clientDomains = new Set<string>(); // website domain OR already-set SC domain
  for (const c of clients) {
    const adsId = (c.googleAdsCustomerId ?? "").replace(/\D/g, "");
    if (adsId) existingAdsIds.add(adsId);
    const nameNorm = normalizeName(c.name);
    if (nameNorm) clientNameNorms.add(nameNorm);
    const webDomain = domainFromWebsite(c.website);
    if (webDomain) clientDomains.add(webDomain);
    const scDomain = c.searchConsoleSiteUrl
      ? domainFromScSite(c.searchConsoleSiteUrl)
      : null;
    if (scDomain) clientDomains.add(scDomain);
  }

  // Index SC sites by normalized domain (prefer domain properties).
  const scByDomain = new Map<string, SearchConsoleSite>();
  for (const site of scSites) {
    const domain = domainFromScSite(site.siteUrl);
    if (!domain) continue;
    const prev = scByDomain.get(domain);
    scByDomain.set(domain, prev ? preferScSite(prev, site) : site);
  }

  const enrichments: DiscoveryEnrichment[] = [];
  // SC site urls consumed by an enrichment (so they're not re-proposed as new).
  const usedScDomains = new Set<string>(clientDomains);

  // --- Enrichments: fill a missing key on an existing client (clear match) -----
  for (const c of clients) {
    // (a) Missing Search Console property → match by website domain.
    if (!c.searchConsoleSiteUrl?.trim()) {
      const webDomain = domainFromWebsite(c.website);
      const match = webDomain ? scByDomain.get(webDomain) : undefined;
      if (webDomain && match) {
        enrichments.push({
          clientId: c.id,
          clientName: c.name,
          field: "searchConsoleSiteUrl",
          value: match.siteUrl,
          reason: `Domein ${webDomain} komt overeen met de website van deze klant.`,
        });
        usedScDomains.add(webDomain);
      }
    }
    // (b) Missing Google Ads id → match by exact normalized account name.
    if (!c.googleAdsCustomerId?.trim()) {
      const nameNorm = normalizeName(c.name);
      const matches = adsAccounts.filter(
        (a) =>
          !existingAdsIds.has(a.customerId) &&
          normalizeName(a.name) === nameNorm &&
          nameNorm.length > 0,
      );
      if (matches.length === 1) {
        enrichments.push({
          clientId: c.id,
          clientName: c.name,
          field: "googleAdsCustomerId",
          value: matches[0].customerId,
          reason: `Ads-account "${matches[0].name}" heeft exact dezelfde naam.`,
        });
        existingAdsIds.add(matches[0].customerId);
      }
    }
  }

  // --- New clients from Ads accounts (no id + no name match) -------------------
  const newClients: DiscoveryNewClient[] = [];
  const consumedScDomains = new Set<string>(usedScDomains);
  for (const a of adsAccounts) {
    if (existingAdsIds.has(a.customerId)) continue;
    if (clientNameNorms.has(normalizeName(a.name))) continue; // already a client
    const accountNorm = normalizeName(a.name);
    // Try to attach a verified SC domain whose base name EXACTLY matches the
    // account name. Only attach when exactly one domain qualifies — a unique,
    // exact match — to avoid mis-linking unrelated domains that merely share a
    // prefix (these candidates are pre-checked in the UI, so a wrong link here
    // would silently seed a bad key on create).
    let attached: SearchConsoleSite | null = null;
    let attachedDomain: string | null = null;
    if (accountNorm.length > 0) {
      const exact: Array<[string, SearchConsoleSite]> = [];
      for (const [domain, site] of scByDomain) {
        if (consumedScDomains.has(domain)) continue;
        if (siteBaseName(domain) === accountNorm) exact.push([domain, site]);
      }
      if (exact.length === 1) {
        attachedDomain = exact[0][0];
        attached = exact[0][1];
      }
    }
    if (attachedDomain) consumedScDomains.add(attachedDomain);
    newClients.push({
      key: `ads:${a.customerId}`,
      suggestedName: a.name || `Account ${a.customerId}`,
      source: "google-ads",
      googleAdsCustomerId: a.customerId,
      searchConsoleSiteUrl: attached?.siteUrl ?? null,
      website: attachedDomain ? `https://${attachedDomain}` : null,
      reason: attached
        ? `Google Ads-account, gekoppeld aan geverifieerd domein ${attachedDomain}.`
        : `Google Ads-account onder de MCC, nog geen klant in de tool.`,
    });
  }

  // --- New clients from leftover verified SC domains ---------------------------
  for (const [domain, site] of scByDomain) {
    if (consumedScDomains.has(domain)) continue;
    consumedScDomains.add(domain);
    newClients.push({
      key: `sc:${site.siteUrl}`,
      suggestedName: domain,
      source: "search-console",
      googleAdsCustomerId: null,
      searchConsoleSiteUrl: site.siteUrl,
      website: `https://${domain}`,
      reason: `Geverifieerd domein in Search Console, nog geen klant in de tool.`,
    });
  }

  newClients.sort((a, b) => {
    if (a.source !== b.source) return a.source === "google-ads" ? -1 : 1;
    return a.suggestedName.localeCompare(b.suggestedName, "nl");
  });

  return {
    adsAvailable,
    scAvailable,
    adsAccountCount: adsAccounts.length,
    scSiteCount: scSites.length,
    enrichments,
    newClients,
    warnings,
  };
}
