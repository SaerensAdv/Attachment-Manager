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

/**
 * Pull a live, read-only Google Ads report for a single customer id.
 * Returns formatted text plus the timestamp it was fetched.
 */
export async function fetchGoogleAdsReport(
  rawCustomerId: string,
  opts: { range?: GoogleAdsDateRange } = {},
): Promise<{ text: string; fetchedAt: Date }> {
  const cfg = readConfig();
  const range: GoogleAdsDateRange = opts.range ?? "LAST_30_DAYS";
  const rangeLabel = RANGE_LABEL[range];
  const rangeShort = RANGE_SHORT[range];
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
     WHERE segments.date DURING ${range}`,
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
       WHERE segments.date DURING ${range}
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
       WHERE segments.date DURING ${range}
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
      const cConv = num(pick(row, "metrics.conversions"));
      const cConvValue = num(pick(row, "metrics.conversionsValue"));
      const ctr = num(pick(row, "metrics.ctr")) * 100;
      const avgCpc = num(pick(row, "metrics.averageCpc")) / 1_000_000;
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

  if (warnings.length > 0) {
    lines.push("");
    lines.push("== Waarschuwingen ==");
    for (const w of warnings) lines.push(`- ${w}`);
  }

  let text = lines.join("\n").trim();
  if (text.length > MAX_REPORT_LEN) {
    text = `${text.slice(0, MAX_REPORT_LEN)}\n…(ingekort)`;
  }

  return { text, fetchedAt: new Date() };
}
