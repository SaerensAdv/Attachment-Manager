/**
 * Live Google Ads intake (Fase 3) — READ ONLY.
 *
 * The app ("brain") pulls live account data straight from the Google Ads REST
 * API (v24) and turns it into a compact, human-readable report that feeds the
 * agents. We never write to Google Ads: only reporting/search queries are sent.
 *
 * Auth uses an offline OAuth refresh token (scope `adwords`) plus a developer
 * token and an MCC login-customer-id, all supplied as secrets. No gRPC: we use
 * the REST `searchStream` endpoint with plain `fetch`, mirroring the
 * website-intake approach.
 */

import {
  computeAccountSignals,
  renderAccountSignals,
} from "./account-signals";

const GOOGLE_ADS_API_VERSION = "v24";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

/** Cap the stored report so it never blows up the agent prompt context. */
const MAX_REPORT_LEN = 40_000;
const MAX_CAMPAIGNS = 50;
const MAX_SEARCH_TERMS = 50;

/**
 * Which period the report covers. "LAST_30_DAYS" is the default ad-hoc refresh;
 * "LAST_MONTH" is the previous calendar month (e.g. on 5 June → 1–31 May) and is
 * what the monthly reporting cycle always uses. Both are GAQL predefined date
 * ranges, so we just swap the `DURING` constant.
 */
export type GoogleAdsDateRange = "LAST_30_DAYS" | "LAST_MONTH";

/**
 * Explicit calendar range (YYYY-MM-DD, inclusive) for comparisons the GAQL
 * predefined ranges can't express — chiefly "same month last year" (YoY).
 */
export interface GoogleAdsCustomRange {
  start: string;
  end: string;
  label: string;
  short?: string;
}

/** Structured per-campaign numbers (for charts/tables in the PDF report). */
export interface GoogleAdsCampaignMetric {
  name: string;
  status: string;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionsValue: number;
  ctr: number; // fraction 0..1
  avgCpc: number;
  cpa: number | null;
  roas: number | null;
}

/** Structured account-level numbers, returned alongside the text report. */
export interface GoogleAdsMetrics {
  accountName: string;
  customerId: string;
  currency: string;
  rangeLabel: string;
  totals: {
    cost: number;
    impressions: number;
    clicks: number;
    conversions: number;
    conversionsValue: number;
    ctr: number; // fraction 0..1
    avgCpc: number;
    cpa: number | null;
    roas: number | null;
  };
  campaigns: GoogleAdsCampaignMetric[];
}

const RANGE_LABEL: Record<GoogleAdsDateRange, string> = {
  LAST_30_DAYS: "laatste 30 dagen",
  LAST_MONTH: "vorige maand",
};

const RANGE_SHORT: Record<GoogleAdsDateRange, string> = {
  LAST_30_DAYS: "30d",
  LAST_MONTH: "vorige maand",
};

/** Thrown when required secrets are missing — surfaced to the user as a 400. */
export class GoogleAdsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAdsConfigError";
  }
}

/** Thrown when Google returns an error or the call fails — surfaced as a 502. */
export class GoogleAdsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAdsApiError";
  }
}

interface GoogleAdsConfig {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  loginCustomerId: string;
}

/** Strip everything but digits (customer ids may be entered with dashes). */
function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Guard custom range dates so they're safe to interpolate into GAQL. */
function assertIsoDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new GoogleAdsConfigError(`Ongeldige datum voor Google Ads-periode: ${value}`);
  }
}

function readConfig(): GoogleAdsConfig {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() ?? "";
  const clientId = process.env.GOOGLE_ADS_OAUTH_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET?.trim() ?? "";
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim() ?? "";
  const loginCustomerId = digitsOnly(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);

  const missing: string[] = [];
  if (!developerToken) missing.push("GOOGLE_ADS_DEVELOPER_TOKEN");
  if (!clientId) missing.push("GOOGLE_ADS_OAUTH_CLIENT_ID");
  if (!clientSecret) missing.push("GOOGLE_ADS_OAUTH_CLIENT_SECRET");
  if (!refreshToken) missing.push("GOOGLE_ADS_REFRESH_TOKEN");
  if (!loginCustomerId) missing.push("GOOGLE_ADS_LOGIN_CUSTOMER_ID");

  if (missing.length > 0) {
    throw new GoogleAdsConfigError(
      `Google Ads is nog niet geconfigureerd. Ontbrekende secrets: ${missing.join(", ")}.`,
    );
  }

  return {
    developerToken,
    clientId,
    clientSecret,
    refreshToken,
    loginCustomerId,
  };
}

/** Exchange the offline refresh token for a short-lived access token. */
async function getAccessToken(cfg: GoogleAdsConfig): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: cfg.refreshToken,
  });

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (err) {
    throw new GoogleAdsApiError(
      `Kon geen verbinding maken met Google OAuth: ${(err as Error).message}`,
    );
  }

  const json = (await res.json().catch(() => null)) as
    | { access_token?: string; error?: string; error_description?: string }
    | null;

  if (!res.ok || !json?.access_token) {
    const detail =
      json?.error_description || json?.error || `HTTP ${res.status}`;
    throw new GoogleAdsApiError(
      `Google OAuth gaf een fout bij het vernieuwen van het token: ${detail}`,
    );
  }

  return json.access_token;
}

interface SearchStreamResult {
  results?: Record<string, unknown>[];
}

/** Run a GAQL query against a customer via the REST searchStream endpoint. */
async function runGaql(
  cfg: GoogleAdsConfig,
  accessToken: string,
  customerId: string,
  query: string,
): Promise<Record<string, unknown>[]> {
  const url = `${API_BASE}/customers/${customerId}/googleAds:searchStream`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "developer-token": cfg.developerToken,
        "login-customer-id": cfg.loginCustomerId,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query }),
    });
  } catch (err) {
    throw new GoogleAdsApiError(
      `Kon geen verbinding maken met de Google Ads API: ${(err as Error).message}`,
    );
  }

  const text = await res.text();
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      const apiError = Array.isArray(parsed) ? parsed[0] : parsed;
      detail =
        apiError?.error?.message ||
        apiError?.error?.status ||
        JSON.stringify(apiError).slice(0, 500);
    } catch {
      detail = text.slice(0, 500) || detail;
    }
    throw new GoogleAdsApiError(`Google Ads API-fout: ${detail}`);
  }

  let chunks: SearchStreamResult[];
  try {
    chunks = JSON.parse(text) as SearchStreamResult[];
  } catch {
    throw new GoogleAdsApiError(
      "Onverwacht antwoord van de Google Ads API (geen geldige JSON).",
    );
  }

  return chunks.flatMap((chunk) => chunk.results ?? []);
}

function num(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
}

function pick(row: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object"
          ? (acc as Record<string, unknown>)[key]
          : undefined,
      row,
    );
}

function fmtMoney(micros: unknown, currency: string): string {
  return `${(num(micros) / 1_000_000).toFixed(2)} ${currency}`.trim();
}

function fmtNum(value: unknown, decimals = 0): string {
  return num(value).toFixed(decimals);
}

/** Format a 0..1 fraction (e.g. impression share) as a percentage string. */
function fmtPct(value: unknown, decimals = 1): string {
  return `${(num(value) * 100).toFixed(decimals)}%`;
}

/** Title-case a GAQL enum like "DESKTOP" / "MONDAY" → "Desktop" / "Monday". */
function titleEnum(value: unknown): string {
  const s = String(value ?? "").replace(/_/g, " ").trim();
  if (!s) return "(unknown)";
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Aggregate cost/clicks/conversions rows by a segment key, for compact splits. */
interface SegAgg {
  cost: number;
  clicks: number;
  conversions: number;
}
function aggregateBy(
  rows: Record<string, unknown>[],
  keyPath: string,
): Map<string, SegAgg> {
  const map = new Map<string, SegAgg>();
  for (const row of rows) {
    const k = String(pick(row, keyPath) ?? "");
    if (!k) continue;
    const cur = map.get(k) ?? { cost: 0, clicks: 0, conversions: 0 };
    cur.cost += num(pick(row, "metrics.costMicros")) / 1_000_000;
    cur.clicks += num(pick(row, "metrics.clicks"));
    cur.conversions += num(pick(row, "metrics.conversions"));
    map.set(k, cur);
  }
  return map;
}

/** One-line summary for a segment bucket: cost, conversions, CPA. */
function segLine(label: string, a: SegAgg, currency: string): string {
  const cpa = a.conversions > 0 ? (a.cost / a.conversions).toFixed(2) : "n.v.t.";
  return (
    `- ${label} — cost ${a.cost.toFixed(2)} ${currency}`.trim() +
    `, clicks ${a.clicks.toFixed(0)}, conversions ${a.conversions.toFixed(2)}, CPA ${cpa} ${currency}`.trim()
  );
}

/**
 * Pull a live, read-only Google Ads report for a single customer id.
 * Returns formatted text plus the timestamp it was fetched.
 */
export async function fetchGoogleAdsReport(
  rawCustomerId: string,
  opts: { range?: GoogleAdsDateRange; custom?: GoogleAdsCustomRange } = {},
): Promise<{ text: string; fetchedAt: Date; metrics: GoogleAdsMetrics }> {
  const cfg = readConfig();
  const range: GoogleAdsDateRange = opts.range ?? "LAST_30_DAYS";
  const useCustom = !!opts.custom;
  if (useCustom) {
    assertIsoDate(opts.custom!.start);
    assertIsoDate(opts.custom!.end);
    if (opts.custom!.start > opts.custom!.end) {
      throw new GoogleAdsConfigError(
        "Ongeldige Google Ads-periode: startdatum ligt na einddatum.",
      );
    }
  }
  const rangeLabel = useCustom ? opts.custom!.label : RANGE_LABEL[range];
  const rangeShort = useCustom
    ? (opts.custom!.short ?? opts.custom!.label)
    : RANGE_SHORT[range];
  // GAQL predefined ranges (DURING) don't cover "same month last year", so for
  // the monthly report we pass explicit start/end and use a BETWEEN clause.
  const dateClause = useCustom
    ? `segments.date BETWEEN '${opts.custom!.start}' AND '${opts.custom!.end}'`
    : `segments.date DURING ${range}`;
  const customerId = digitsOnly(rawCustomerId);
  if (!customerId) {
    throw new GoogleAdsConfigError("Ongeldig Google Ads customer ID.");
  }

  const accessToken = await getAccessToken(cfg);

  // 1. Account totals — also gives us name + currency.
  const accountRows = await runGaql(
    cfg,
    accessToken,
    customerId,
    `SELECT customer.descriptive_name, customer.currency_code,
            metrics.cost_micros, metrics.impressions, metrics.clicks,
            metrics.conversions, metrics.conversions_value
     FROM customer
     WHERE ${dateClause}`,
  );
  const account = accountRows[0] ?? {};
  const currency = String(pick(account, "customer.currencyCode") ?? "");
  const accountName = String(
    pick(account, "customer.descriptiveName") ?? customerId,
  );

  // Campaign + search-term pulls are best-effort: a single failing section (e.g.
  // a brand-new account without `search_term_view` data) must not sink the whole
  // report. We collect any failures as warnings and still return the rest.
  const warnings: string[] = [];

  // 2. Per-campaign performance (last 30 days), highest spend first.
  let campaignRows: Record<string, unknown>[] = [];
  let campaignFailed = false;
  try {
    campaignRows = await runGaql(
      cfg,
      accessToken,
      customerId,
      `SELECT campaign.name, campaign.status,
              metrics.cost_micros, metrics.impressions, metrics.clicks,
              metrics.conversions, metrics.conversions_value,
              metrics.ctr, metrics.average_cpc
       FROM campaign
       WHERE ${dateClause}
         AND campaign.status != 'REMOVED'
       ORDER BY metrics.cost_micros DESC
       LIMIT ${MAX_CAMPAIGNS}`,
    );
  } catch (err) {
    campaignFailed = true;
    warnings.push(
      `Campagnedata kon niet worden opgehaald: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 3. Top search terms by spend (last 30 days).
  let searchTermRows: Record<string, unknown>[] = [];
  let searchFailed = false;
  try {
    searchTermRows = await runGaql(
      cfg,
      accessToken,
      customerId,
      `SELECT search_term_view.search_term,
              metrics.cost_micros, metrics.clicks,
              metrics.conversions, metrics.conversions_value
       FROM search_term_view
       WHERE ${dateClause}
       ORDER BY metrics.cost_micros DESC
       LIMIT ${MAX_SEARCH_TERMS}`,
    );
  } catch (err) {
    searchFailed = true;
    warnings.push(
      `Zoektermdata kon niet worden opgehaald: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const lines: string[] = [];
  lines.push(`Account: ${accountName} (${customerId})`);
  lines.push(`Periode: ${rangeLabel}`);
  lines.push("");

  const cost = pick(account, "metrics.costMicros");
  const conversions = num(pick(account, "metrics.conversions"));
  const convValue = num(pick(account, "metrics.conversionsValue"));
  const accountCostNum = num(cost) / 1_000_000;
  const accountImpressions = num(pick(account, "metrics.impressions"));
  const accountClicks = num(pick(account, "metrics.clicks"));
  lines.push(`== Accounttotalen (${rangeShort}) ==`);
  lines.push(`Kosten: ${fmtMoney(cost, currency)}`);
  lines.push(`Vertoningen: ${fmtNum(pick(account, "metrics.impressions"))}`);
  lines.push(`Klikken: ${fmtNum(pick(account, "metrics.clicks"))}`);
  lines.push(`Conversies: ${conversions.toFixed(2)}`);
  lines.push(`Conversiewaarde: ${convValue.toFixed(2)} ${currency}`.trim());
  lines.push(
    `CPA: ${conversions > 0 ? (accountCostNum / conversions).toFixed(2) : "n.v.t."} ${currency}`.trim(),
  );
  lines.push(
    `ROAS: ${accountCostNum > 0 ? (convValue / accountCostNum).toFixed(2) : "n.v.t."}`,
  );
  lines.push("");

  const campaignMetrics: GoogleAdsCampaignMetric[] = [];
  lines.push(`== Campagnes (${rangeShort}, top ${MAX_CAMPAIGNS} op kosten) ==`);
  if (campaignFailed) {
    lines.push("Kon niet worden opgehaald (zie waarschuwingen onderaan).");
  } else if (campaignRows.length === 0) {
    lines.push("Geen campagnedata in deze periode.");
  } else {
    for (const row of campaignRows) {
      const name = String(pick(row, "campaign.name") ?? "(naamloos)");
      const status = String(pick(row, "campaign.status") ?? "");
      const cCost = num(pick(row, "metrics.costMicros")) / 1_000_000;
      const cClicks = num(pick(row, "metrics.clicks"));
      const cImpr = num(pick(row, "metrics.impressions"));
      const cConv = num(pick(row, "metrics.conversions"));
      const cConvValue = num(pick(row, "metrics.conversionsValue"));
      const ctr = num(pick(row, "metrics.ctr")) * 100;
      const avgCpc = num(pick(row, "metrics.averageCpc")) / 1_000_000;
      campaignMetrics.push({
        name,
        status,
        cost: cCost,
        impressions: cImpr,
        clicks: cClicks,
        conversions: cConv,
        conversionsValue: cConvValue,
        ctr: num(pick(row, "metrics.ctr")),
        avgCpc,
        cpa: cConv > 0 ? cCost / cConv : null,
        roas: cCost > 0 ? cConvValue / cCost : null,
      });
      lines.push(
        `- ${name} [${status}] — kosten ${cCost.toFixed(2)} ${currency}, ` +
          `klikken ${fmtNum(pick(row, "metrics.clicks"))}, ` +
          `vertoningen ${fmtNum(pick(row, "metrics.impressions"))}, ` +
          `CTR ${ctr.toFixed(2)}%, gem. CPC ${avgCpc.toFixed(2)} ${currency}, ` +
          `conversies ${cConv.toFixed(2)}, ` +
          `CPA ${cConv > 0 ? (cCost / cConv).toFixed(2) : "n.v.t."} ${currency}, ` +
          `ROAS ${cCost > 0 ? (cConvValue / cCost).toFixed(2) : "n.v.t."}`,
      );
    }
  }
  lines.push("");

  lines.push(
    `== Top zoektermen (${rangeShort}, top ${MAX_SEARCH_TERMS} op kosten) ==`,
  );
  if (searchFailed) {
    lines.push("Kon niet worden opgehaald (zie waarschuwingen onderaan).");
  } else if (searchTermRows.length === 0) {
    lines.push("Geen zoektermdata in deze periode.");
  } else {
    for (const row of searchTermRows) {
      const term = String(pick(row, "searchTermView.searchTerm") ?? "");
      const tCost = num(pick(row, "metrics.costMicros")) / 1_000_000;
      const tConv = num(pick(row, "metrics.conversions"));
      lines.push(
        `- "${term}" — kosten ${tCost.toFixed(2)} ${currency}, ` +
          `klikken ${fmtNum(pick(row, "metrics.clicks"))}, ` +
          `conversies ${tConv.toFixed(2)}`,
      );
    }
  }

  const metrics: GoogleAdsMetrics = {
    accountName,
    customerId,
    currency,
    rangeLabel,
    totals: {
      cost: accountCostNum,
      impressions: accountImpressions,
      clicks: accountClicks,
      conversions,
      conversionsValue: convValue,
      ctr: accountImpressions > 0 ? accountClicks / accountImpressions : 0,
      avgCpc: accountClicks > 0 ? accountCostNum / accountClicks : 0,
      cpa: conversions > 0 ? accountCostNum / conversions : null,
      roas: accountCostNum > 0 ? convValue / accountCostNum : null,
    },
    campaigns: campaignMetrics,
  };

  // Read-only diagnostic signals derived purely from the numbers above (no extra
  // API call). Only added when the campaign pull succeeded, so we never flag a
  // "spend without conversions" that is really just a failed data fetch.
  if (!campaignFailed) {
    const signalLines = renderAccountSignals(computeAccountSignals(metrics));
    if (signalLines.length > 0) {
      lines.push("");
      lines.push(...signalLines);
    }
  }

  if (warnings.length > 0) {
    lines.push("");
    lines.push("== Waarschuwingen ==");
    for (const w of warnings) lines.push(`- ${w}`);
  }

  let text = lines.join("\n").trim();
  if (text.length > MAX_REPORT_LEN) {
    text = `${text.slice(0, MAX_REPORT_LEN)}\n…(ingekort)`;
  }

  return { text, fetchedAt: new Date(), metrics };
}

/**
 * Pull a live, read-only snapshot of a customer's SEARCH ad-group structure for
 * ad-copy generation: campaigns, ad groups, their landing page (Final URL) and
 * display paths from existing RSAs, the keyword themes per ad group, and any
 * existing RSA copy (as refresh context). Returns formatted text the engine
 * injects so generated copy maps to REAL ad groups and the CSV is import-ready.
 * Each section is best-effort: a failure becomes a warning, not a thrown run.
 */
export async function fetchGoogleAdsAdCopyContext(
  rawCustomerId: string,
): Promise<{ text: string; fetchedAt: Date }> {
  const cfg = readConfig();
  const customerId = digitsOnly(rawCustomerId);
  if (!customerId) {
    throw new GoogleAdsConfigError("Ongeldig Google Ads customer ID.");
  }
  const MAX_GROUPS = 60;
  const MAX_KW = 8;
  const accessToken = await getAccessToken(cfg);

  interface Group {
    campaign: string;
    adGroup: string;
    finalUrls: Set<string>;
    path1: string;
    path2: string;
    keywords: string[];
    headlines: string[];
    descriptions: string[];
  }
  const groups = new Map<string, Group>();
  const key = (c: string, a: string) => `${c}\u0000${a}`;
  const ensure = (c: string, a: string): Group => {
    const k = key(c, a);
    let g = groups.get(k);
    if (!g) {
      g = {
        campaign: c,
        adGroup: a,
        finalUrls: new Set(),
        path1: "",
        path2: "",
        keywords: [],
        headlines: [],
        descriptions: [],
      };
      groups.set(k, g);
    }
    return g;
  };
  const rsaAssetTexts = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .map((a) =>
            a && typeof a === "object"
              ? String((a as Record<string, unknown>).text ?? "")
              : "",
          )
          .filter(Boolean)
      : [];

  const warnings: string[] = [];

  // 1. Enabled SEARCH ad groups (the spine of the structure).
  try {
    const rows = await runGaql(
      cfg,
      accessToken,
      customerId,
      `SELECT campaign.name, ad_group.name
       FROM ad_group
       WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED'
         AND campaign.advertising_channel_type = 'SEARCH'
       ORDER BY campaign.name, ad_group.name
       LIMIT ${MAX_GROUPS}`,
    );
    for (const row of rows) {
      const c = String(pick(row, "campaign.name") ?? "");
      const a = String(pick(row, "adGroup.name") ?? "");
      if (c && a) ensure(c, a);
    }
  } catch (err) {
    warnings.push(
      `Ad groups could not be fetched: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 2. Existing RSAs -> Final URL, display paths, existing copy (refresh context).
  try {
    const rows = await runGaql(
      cfg,
      accessToken,
      customerId,
      `SELECT campaign.name, ad_group.name,
              ad_group_ad.ad.final_urls,
              ad_group_ad.ad.responsive_search_ad.headlines,
              ad_group_ad.ad.responsive_search_ad.descriptions,
              ad_group_ad.ad.responsive_search_ad.path1,
              ad_group_ad.ad.responsive_search_ad.path2
       FROM ad_group_ad
       WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED'
         AND ad_group_ad.status != 'REMOVED'
         AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'
         AND campaign.advertising_channel_type = 'SEARCH'
       LIMIT 200`,
    );
    for (const row of rows) {
      const c = String(pick(row, "campaign.name") ?? "");
      const a = String(pick(row, "adGroup.name") ?? "");
      if (!c || !a) continue;
      let g = groups.get(key(c, a));
      if (!g) {
        if (groups.size >= MAX_GROUPS) continue;
        g = ensure(c, a);
      }
      const urls = pick(row, "adGroupAd.ad.finalUrls");
      if (Array.isArray(urls))
        for (const u of urls) if (u) g.finalUrls.add(String(u));
      const p1 = pick(row, "adGroupAd.ad.responsiveSearchAd.path1");
      const p2 = pick(row, "adGroupAd.ad.responsiveSearchAd.path2");
      if (p1 && !g.path1) g.path1 = String(p1);
      if (p2 && !g.path2) g.path2 = String(p2);
      for (const h of rsaAssetTexts(
        pick(row, "adGroupAd.ad.responsiveSearchAd.headlines"),
      ))
        if (!g.headlines.includes(h)) g.headlines.push(h);
      for (const d of rsaAssetTexts(
        pick(row, "adGroupAd.ad.responsiveSearchAd.descriptions"),
      ))
        if (!g.descriptions.includes(d)) g.descriptions.push(d);
    }
  } catch (err) {
    warnings.push(
      `Existing RSAs could not be fetched: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 3. Enabled keyword themes per ad group.
  try {
    const rows = await runGaql(
      cfg,
      accessToken,
      customerId,
      `SELECT campaign.name, ad_group.name, ad_group_criterion.keyword.text
       FROM ad_group_criterion
       WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED'
         AND ad_group_criterion.type = 'KEYWORD'
         AND ad_group_criterion.status = 'ENABLED'
         AND ad_group_criterion.negative = FALSE
         AND campaign.advertising_channel_type = 'SEARCH'
       LIMIT 1000`,
    );
    for (const row of rows) {
      const c = String(pick(row, "campaign.name") ?? "");
      const a = String(pick(row, "adGroup.name") ?? "");
      const kw = String(pick(row, "adGroupCriterion.keyword.text") ?? "");
      if (!c || !a || !kw) continue;
      let g = groups.get(key(c, a));
      if (!g) {
        if (groups.size >= MAX_GROUPS) continue;
        g = ensure(c, a);
      }
      if (g.keywords.length < MAX_KW && !g.keywords.includes(kw))
        g.keywords.push(kw);
    }
  } catch (err) {
    warnings.push(
      `Keywords could not be fetched: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const lines: string[] = [];
  lines.push(`Account: ${customerId}`);
  lines.push("Live SEARCH ad-group structure (read-only, for ad copy).");
  lines.push("");
  const all = Array.from(groups.values()).slice(0, MAX_GROUPS);
  if (all.length === 0) {
    lines.push("No active search ad groups found for this account.");
  } else {
    for (const g of all) {
      lines.push(`== Campaign: ${g.campaign} | Ad group: ${g.adGroup} ==`);
      lines.push(
        `Final URL: ${g.finalUrls.size ? Array.from(g.finalUrls).join(" , ") : "(unknown - needs fill-in)"}`,
      );
      lines.push(
        `Display paths: ${[g.path1, g.path2].filter(Boolean).join(" / ") || "(none)"}`,
      );
      lines.push(
        `Keyword themes: ${g.keywords.length ? g.keywords.slice(0, MAX_KW).join(", ") : "(none found)"}`,
      );
      if (g.headlines.length)
        lines.push(
          `Existing RSA headlines: ${g.headlines.slice(0, 15).join(" | ")}`,
        );
      if (g.descriptions.length)
        lines.push(
          `Existing RSA descriptions: ${g.descriptions.slice(0, 4).join(" | ")}`,
        );
      lines.push("");
    }
  }
  if (warnings.length) {
    lines.push("== Warnings ==");
    for (const w of warnings) lines.push(`- ${w}`);
  }
  let text = lines.join("\n").trim();
  if (text.length > MAX_REPORT_LEN)
    text = `${text.slice(0, MAX_REPORT_LEN)}\n…(truncated)`;
  return { text, fetchedAt: new Date() };
}

/**
 * Pull a live, read-only snapshot for the WEEKLY ACCOUNT OPTIMIZATION pass
 * (negative-keyword mining plus the deeper analytical read). Returns formatted
 * text the engine injects so the team and the deliverable editor work from real
 * data:
 *   - the active SEARCH campaigns (so negatives map to real campaign names);
 *   - per-campaign impression share + where it is lost (budget vs. rank), so the
 *     impression-share read in the workflow runs on live numbers;
 *   - the search terms report with metrics and the campaign each term ran in (so
 *     terms are excluded at the right campaign);
 *   - performance segmentation (device, day-of-week, hour-of-day, geo) for the
 *     deeper analyst pass;
 *   - the EXISTING campaign-level negatives (so we never recommend a duplicate).
 * Each section is best-effort: a failure becomes a warning, not a thrown run. We
 * only read — applying any change stays a human action.
 */
export async function fetchGoogleAdsNegativesContext(
  rawCustomerId: string,
): Promise<{ text: string; fetchedAt: Date }> {
  const cfg = readConfig();
  const customerId = digitsOnly(rawCustomerId);
  if (!customerId) {
    throw new GoogleAdsConfigError("Ongeldig Google Ads customer ID.");
  }
  const MAX_TERMS = 200;
  const MAX_CAMPS = 50;
  const MAX_EXISTING = 500;
  const accessToken = await getAccessToken(cfg);
  const warnings: string[] = [];

  // 0. Currency (and a sanity check the account is reachable).
  let currency = "";
  try {
    const rows = await runGaql(
      cfg,
      accessToken,
      customerId,
      "SELECT customer.currency_code FROM customer LIMIT 1",
    );
    currency = String(pick(rows[0] ?? {}, "customer.currencyCode") ?? "");
  } catch (err) {
    warnings.push(
      `Account currency could not be fetched: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 1. Active SEARCH campaigns — the real names negatives must map onto.
  const campaignNames: string[] = [];
  try {
    const rows = await runGaql(
      cfg,
      accessToken,
      customerId,
      `SELECT campaign.name
       FROM campaign
       WHERE campaign.status = 'ENABLED'
         AND campaign.advertising_channel_type = 'SEARCH'
       ORDER BY campaign.name
       LIMIT ${MAX_CAMPS}`,
    );
    for (const row of rows) {
      const name = String(pick(row, "campaign.name") ?? "");
      if (name && !campaignNames.includes(name)) campaignNames.push(name);
    }
  } catch (err) {
    warnings.push(
      `Search campaigns could not be fetched: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 2. Search terms (last 30 days) with the campaign each ran in, highest spend
  //    first — the raw candidates the team screens for relevance.
  interface Term {
    term: string;
    campaign: string;
    cost: number;
    clicks: number;
    conversions: number;
  }
  const terms: Term[] = [];
  try {
    const rows = await runGaql(
      cfg,
      accessToken,
      customerId,
      `SELECT campaign.name, search_term_view.search_term,
              metrics.cost_micros, metrics.clicks, metrics.conversions
       FROM search_term_view
       WHERE segments.date DURING LAST_30_DAYS
       ORDER BY metrics.cost_micros DESC
       LIMIT ${MAX_TERMS}`,
    );
    for (const row of rows) {
      const term = String(pick(row, "searchTermView.searchTerm") ?? "");
      if (!term) continue;
      terms.push({
        term,
        campaign: String(pick(row, "campaign.name") ?? ""),
        cost: num(pick(row, "metrics.costMicros")) / 1_000_000,
        clicks: num(pick(row, "metrics.clicks")),
        conversions: num(pick(row, "metrics.conversions")),
      });
    }
  } catch (err) {
    warnings.push(
      `Search terms could not be fetched: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 3. Existing campaign-level negatives — so we never recommend a duplicate.
  interface ExistingNeg {
    campaign: string;
    text: string;
    matchType: string;
  }
  const existing: ExistingNeg[] = [];
  try {
    const rows = await runGaql(
      cfg,
      accessToken,
      customerId,
      `SELECT campaign.name,
              campaign_criterion.keyword.text,
              campaign_criterion.keyword.match_type
       FROM campaign_criterion
       WHERE campaign_criterion.type = 'KEYWORD'
         AND campaign_criterion.negative = TRUE
         AND campaign.status != 'REMOVED'
       LIMIT ${MAX_EXISTING}`,
    );
    for (const row of rows) {
      const t = String(pick(row, "campaignCriterion.keyword.text") ?? "");
      if (!t) continue;
      existing.push({
        campaign: String(pick(row, "campaign.name") ?? ""),
        text: t,
        matchType: String(
          pick(row, "campaignCriterion.keyword.matchType") ?? "",
        ),
      });
    }
  } catch (err) {
    warnings.push(
      `Existing negative keywords could not be fetched: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 4. Per-campaign impression share + where it is lost (budget vs. rank).
  interface ImpShare {
    campaign: string;
    is: number;
    budgetLost: number;
    rankLost: number;
    topIs: number;
  }
  const impShare: ImpShare[] = [];
  try {
    const rows = await runGaql(
      cfg,
      accessToken,
      customerId,
      `SELECT campaign.name, metrics.cost_micros,
              metrics.search_impression_share,
              metrics.search_budget_lost_impression_share,
              metrics.search_rank_lost_impression_share,
              metrics.search_top_impression_share
       FROM campaign
       WHERE segments.date DURING LAST_30_DAYS
         AND campaign.status = 'ENABLED'
         AND campaign.advertising_channel_type = 'SEARCH'
       ORDER BY metrics.cost_micros DESC
       LIMIT ${MAX_CAMPS}`,
    );
    for (const row of rows) {
      const name = String(pick(row, "campaign.name") ?? "");
      if (!name) continue;
      impShare.push({
        campaign: name,
        is: num(pick(row, "metrics.searchImpressionShare")),
        budgetLost: num(pick(row, "metrics.searchBudgetLostImpressionShare")),
        rankLost: num(pick(row, "metrics.searchRankLostImpressionShare")),
        topIs: num(pick(row, "metrics.searchTopImpressionShare")),
      });
    }
  } catch (err) {
    warnings.push(
      `Impression share could not be fetched: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 5. Device / day-of-week / hour-of-day splits (deeper analyst pass). Each is
  //    queried from the SEARCH campaigns and aggregated across them.
  let deviceAgg = new Map<string, SegAgg>();
  let dayAgg = new Map<string, SegAgg>();
  let hourAgg = new Map<string, SegAgg>();
  const segSelect =
    "metrics.cost_micros, metrics.clicks, metrics.conversions";
  const segWhere =
    "segments.date DURING LAST_30_DAYS AND campaign.status = 'ENABLED' AND campaign.advertising_channel_type = 'SEARCH'";
  try {
    deviceAgg = aggregateBy(
      await runGaql(
        cfg,
        accessToken,
        customerId,
        `SELECT segments.device, ${segSelect} FROM campaign WHERE ${segWhere}`,
      ),
      "segments.device",
    );
  } catch (err) {
    warnings.push(
      `Device split could not be fetched: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    dayAgg = aggregateBy(
      await runGaql(
        cfg,
        accessToken,
        customerId,
        `SELECT segments.day_of_week, ${segSelect} FROM campaign WHERE ${segWhere}`,
      ),
      "segments.dayOfWeek",
    );
  } catch (err) {
    warnings.push(
      `Day-of-week split could not be fetched: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    hourAgg = aggregateBy(
      await runGaql(
        cfg,
        accessToken,
        customerId,
        `SELECT segments.hour, ${segSelect} FROM campaign WHERE ${segWhere}`,
      ),
      "segments.hour",
    );
  } catch (err) {
    warnings.push(
      `Hour-of-day split could not be fetched: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 6. Geo split (region), best-effort, with canonical-name resolution.
  let geoAgg = new Map<string, SegAgg>();
  const geoNames = new Map<string, string>();
  try {
    geoAgg = aggregateBy(
      await runGaql(
        cfg,
        accessToken,
        customerId,
        `SELECT segments.geo_target_region, metrics.cost_micros, metrics.clicks, metrics.conversions
         FROM geographic_view
         WHERE segments.date DURING LAST_30_DAYS
         ORDER BY metrics.cost_micros DESC
         LIMIT 200`,
      ),
      "segments.geoTargetRegion",
    );
  } catch (err) {
    warnings.push(
      `Geo split could not be fetched: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (geoAgg.size > 0) {
    const ids = Array.from(geoAgg.keys())
      .map((rn) => rn.split("/").pop() ?? "")
      .filter((id) => /^\d+$/.test(id))
      .slice(0, 100);
    if (ids.length > 0) {
      try {
        const rows = await runGaql(
          cfg,
          accessToken,
          customerId,
          `SELECT geo_target_constant.id, geo_target_constant.canonical_name
           FROM geo_target_constant
           WHERE geo_target_constant.id IN (${ids.join(",")})`,
        );
        for (const row of rows) {
          const id = String(pick(row, "geoTargetConstant.id") ?? "");
          const nm = String(pick(row, "geoTargetConstant.canonicalName") ?? "");
          if (id && nm) geoNames.set(id, nm);
        }
      } catch (err) {
        warnings.push(
          `Geo region names could not be resolved: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // 7. Ad-group structure (enabled search), best-effort. Grounds the
  // cross-campaign positive side: when a term is mis-routed, the team can name
  // the real ad group in the correct campaign it should be added to.
  const adGroupsByCampaign = new Map<string, string[]>();
  try {
    const rows = await runGaql(
      cfg,
      accessToken,
      customerId,
      `SELECT campaign.name, ad_group.name
       FROM ad_group
       WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED'
         AND campaign.advertising_channel_type = 'SEARCH'
       ORDER BY campaign.name, ad_group.name
       LIMIT 300`,
    );
    for (const row of rows) {
      const camp = String(pick(row, "campaign.name") ?? "");
      const ag = String(pick(row, "ad_group.name") ?? "");
      if (!camp || !ag) continue;
      const arr = adGroupsByCampaign.get(camp) ?? [];
      if (!arr.includes(ag)) arr.push(ag);
      adGroupsByCampaign.set(camp, arr);
    }
  } catch (err) {
    warnings.push(
      `Ad-group structure could not be fetched: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const lines: string[] = [];
  lines.push(`Account: ${customerId}`);
  lines.push("Live data for the weekly account optimization pass (read-only).");
  lines.push("");

  lines.push(`== Active search campaigns (top ${MAX_CAMPS}) ==`);
  if (campaignNames.length === 0) {
    lines.push("(none found)");
  } else {
    for (const name of campaignNames) lines.push(`- ${name}`);
  }
  lines.push("");

  lines.push("== Ad-group structure per campaign (enabled search) ==");
  if (adGroupsByCampaign.size === 0) {
    lines.push("(none found)");
  } else {
    for (const [camp, ags] of adGroupsByCampaign) {
      lines.push(`- ${camp}: ${ags.join(" | ")}`);
    }
  }
  lines.push("");

  lines.push("== Impression share (last 30 days, by campaign) ==");
  if (impShare.length === 0) {
    lines.push("(no impression share data in this period)");
  } else {
    for (const c of impShare) {
      lines.push(
        `- ${c.campaign} — search IS ${fmtPct(c.is)}, ` +
          `lost to budget ${fmtPct(c.budgetLost)}, lost to rank ${fmtPct(c.rankLost)}, ` +
          `top IS ${fmtPct(c.topIs)}`,
      );
    }
  }
  lines.push("");

  lines.push(`== Search terms (last 30 days, top ${MAX_TERMS} by cost) ==`);
  if (terms.length === 0) {
    lines.push("(no search term data in this period)");
  } else {
    for (const t of terms) {
      lines.push(
        `- "${t.term}" | campaign: ${t.campaign || "(unknown)"} | ` +
          `cost ${t.cost.toFixed(2)} ${currency}`.trim() +
          `, clicks ${t.clicks.toFixed(0)}, conversions ${t.conversions.toFixed(2)}`,
      );
    }
  }
  lines.push("");

  lines.push("== Performance by device (last 30 days) ==");
  if (deviceAgg.size === 0) {
    lines.push("(no device data)");
  } else {
    for (const [k, v] of [...deviceAgg.entries()].sort(
      (a, b) => b[1].cost - a[1].cost,
    )) {
      lines.push(segLine(titleEnum(k), v, currency));
    }
  }
  lines.push("");

  lines.push("== Performance by day of week (last 30 days) ==");
  if (dayAgg.size === 0) {
    lines.push("(no day-of-week data)");
  } else {
    const order = [
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
      "SUNDAY",
    ];
    for (const d of order) {
      const v = dayAgg.get(d);
      if (v) lines.push(segLine(titleEnum(d), v, currency));
    }
  }
  lines.push("");

  lines.push("== Performance by hour of day (last 30 days) ==");
  if (hourAgg.size === 0) {
    lines.push("(no hour-of-day data)");
  } else {
    const hours = [...hourAgg.keys()]
      .map(Number)
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b);
    for (const h of hours) {
      const v = hourAgg.get(String(h));
      if (v) lines.push(segLine(`${String(h).padStart(2, "0")}:00`, v, currency));
    }
  }
  lines.push("");

  lines.push("== Performance by region (last 30 days, top 15 by cost) ==");
  if (geoAgg.size === 0) {
    lines.push("(no geo data)");
  } else {
    const sorted = [...geoAgg.entries()]
      .sort((a, b) => b[1].cost - a[1].cost)
      .slice(0, 15);
    for (const [rn, v] of sorted) {
      const id = rn.split("/").pop() ?? "";
      lines.push(segLine(geoNames.get(id) ?? rn, v, currency));
    }
  }
  lines.push("");

  lines.push("== Existing campaign negative keywords (do NOT duplicate) ==");
  if (existing.length === 0) {
    lines.push("(none found)");
  } else {
    for (const e of existing) {
      lines.push(
        `- ${e.campaign || "(unknown)"}: "${e.text}" [${e.matchType || "?"}]`,
      );
    }
  }

  if (warnings.length) {
    lines.push("");
    lines.push("== Warnings ==");
    for (const w of warnings) lines.push(`- ${w}`);
  }

  let text = lines.join("\n").trim();
  if (text.length > MAX_REPORT_LEN)
    text = `${text.slice(0, MAX_REPORT_LEN)}\n…(truncated)`;
  return { text, fetchedAt: new Date() };
}
