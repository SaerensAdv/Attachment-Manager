/**
 * The app's FIRST-EVER live write to Google Ads.
 *
 * Everything else in this codebase is strictly read-only; this module is the
 * single, narrow door through which a mutation can leave the app, and it does
 * exactly ONE thing: add negative keywords to a Shopping ad group. It cannot
 * pause, edit budgets, or touch anything else — the request body is built here,
 * not by the caller, and every operation asserts `negative: true`.
 *
 * Safety properties:
 *   - `validateOnly` performs Google's server-side dry-run (nothing persists),
 *     so the UI can preview exactly what a real apply would do.
 *   - One operation per request. A batch mutate hides which row failed; looping
 *     gives a reliable per-decision status the caller maps back to the store.
 *   - A DUPLICATE (the negative already exists) is treated as success — the end
 *     state the user wanted is already true.
 *   - The caller (route) still owns the claim-before-write / revert-on-fail
 *     compare-and-set, so a negative can never be pushed twice.
 */

import {
  readConfig,
  getAccessToken,
  digitsOnly,
  GoogleAdsConfigError,
  GoogleAdsApiError,
} from "./google-ads";
import { logger } from "./logger";

// Keep in sync with GOOGLE_ADS_API_VERSION in google-ads.ts.
const API_BASE = "https://googleads.googleapis.com/v24";

/** Google Ads caps a keyword at 80 characters / 10 words. */
const MAX_KEYWORD_LEN = 80;

/** How many operations one apply call may carry, as a guard-rail. */
export const MAX_NEGATIVE_OPS = 50;

export type NegativeMatchType = "EXACT" | "PHRASE" | "BROAD";

export interface NegativeKeywordOp {
  adGroupId: string;
  text: string;
  matchType: NegativeMatchType;
}

export interface NegativeKeywordResult {
  op: NegativeKeywordOp;
  /** `created` = pushed (or would push, in dry-run); `duplicate` = already
   *  present; `failed` = rejected (see `error`). */
  status: "created" | "duplicate" | "failed";
  resourceName: string | null;
  error: string | null;
}

export interface AddNegativesResult {
  validateOnly: boolean;
  results: NegativeKeywordResult[];
}

function normalizeMatchType(raw: string): NegativeMatchType | null {
  const t = raw.trim().toUpperCase();
  return t === "EXACT" || t === "PHRASE" || t === "BROAD" ? t : null;
}

/** True when Google's rejection means "this negative already exists". */
function isDuplicateError(detail: string): boolean {
  const d = detail.toLowerCase();
  return (
    d.includes("duplicate") ||
    d.includes("already exists") ||
    d.includes("resource_already_exists")
  );
}

/**
 * Add ONE negative keyword to a Shopping ad group. Builds the mutate body
 * (asserting `negative: true`), sends it, and maps the outcome to a typed
 * result. Never throws for a per-op rejection — those become `failed`/`duplicate`
 * results so the caller can record them per decision. Throws only for
 * configuration or connection-level failures that abort the whole batch.
 */
async function addOneNegative(
  cfg: ReturnType<typeof readConfig>,
  accessToken: string,
  customerId: string,
  op: NegativeKeywordOp,
  validateOnly: boolean,
): Promise<NegativeKeywordResult> {
  const adGroupId = digitsOnly(op.adGroupId);
  const text = op.text.trim();
  const matchType = normalizeMatchType(op.matchType);

  if (!adGroupId) {
    return { op, status: "failed", resourceName: null, error: "Ongeldige advertentiegroep-id." };
  }
  if (!text) {
    return { op, status: "failed", resourceName: null, error: "Lege zoekterm." };
  }
  if (text.length > MAX_KEYWORD_LEN) {
    return {
      op,
      status: "failed",
      resourceName: null,
      error: `Zoekterm te lang (max ${MAX_KEYWORD_LEN} tekens).`,
    };
  }
  if (!matchType) {
    return { op, status: "failed", resourceName: null, error: "Ongeldig matchtype." };
  }

  const body = {
    operations: [
      {
        create: {
          adGroup: `customers/${customerId}/adGroups/${adGroupId}`,
          negative: true,
          keyword: { text, matchType },
        },
      },
    ],
    // Never let one row silently swallow another — we send exactly one op, so a
    // failure is unambiguous and surfaces as a non-2xx we classify below.
    partialFailure: false,
    validateOnly,
  };

  const url = `${API_BASE}/customers/${customerId}/adGroupCriteria:mutate`;
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
      body: JSON.stringify(body),
    });
  } catch (err) {
    // A connection failure is not this op's fault — abort the whole batch so the
    // caller reverts the claim rather than marking the decision failed.
    throw new GoogleAdsApiError(
      `Kon geen verbinding maken met de Google Ads API: ${(err as Error).message}`,
      "NETWORK_ERROR",
    );
  }

  const raw = await res.text();
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(raw);
      const apiError = Array.isArray(parsed) ? parsed[0] : parsed;
      detail =
        apiError?.error?.message ||
        apiError?.error?.status ||
        JSON.stringify(apiError).slice(0, 500);
    } catch {
      detail = raw.slice(0, 500) || detail;
    }
    // Auth/quota problems are batch-fatal (every op will hit them) — throw so
    // the caller aborts instead of marking every decision failed.
    if (res.status === 401 || res.status === 403) {
      throw new GoogleAdsApiError(`Google Ads weigerde de schrijfactie: ${detail}`, "AUTH_ERROR");
    }
    if (res.status === 429) {
      throw new GoogleAdsApiError(`Google Ads rate limit bereikt: ${detail}`, "RATE_LIMIT");
    }
    if (res.status >= 500) {
      throw new GoogleAdsApiError(`Google Ads API-fout: ${detail}`, "API_ERROR");
    }
    // A 4xx for this specific keyword: duplicate is the desired end state.
    if (isDuplicateError(detail)) {
      return { op, status: "duplicate", resourceName: null, error: null };
    }
    return { op, status: "failed", resourceName: null, error: detail };
  }

  let resourceName: string | null = null;
  try {
    const parsed = JSON.parse(raw) as {
      results?: { resourceName?: string }[];
    };
    resourceName = parsed.results?.[0]?.resourceName ?? null;
  } catch {
    // A 2xx with an unparseable body still means the mutate landed; we just
    // don't have the resource name to store.
    resourceName = null;
  }

  return { op, status: "created", resourceName, error: null };
}

/**
 * Add a batch of negative keywords, one live call per op for reliable status.
 * `validateOnly` runs Google's dry-run for every op (nothing persists). Config
 * errors and batch-fatal API errors (auth/quota/5xx/network) propagate; per-op
 * rejections come back as `failed`/`duplicate` results.
 */
export async function addAdGroupNegativeKeywords(
  rawCustomerId: string,
  ops: NegativeKeywordOp[],
  options: { validateOnly: boolean },
): Promise<AddNegativesResult> {
  const cfg = readConfig();
  const customerId = digitsOnly(rawCustomerId);
  if (!customerId) {
    throw new GoogleAdsConfigError("Ongeldig Google Ads customer ID.");
  }
  if (ops.length === 0) {
    return { validateOnly: options.validateOnly, results: [] };
  }
  if (ops.length > MAX_NEGATIVE_OPS) {
    throw new GoogleAdsConfigError(
      `Te veel uitsluitingen in één keer (max ${MAX_NEGATIVE_OPS}).`,
    );
  }

  const accessToken = await getAccessToken(cfg);

  const results: NegativeKeywordResult[] = [];
  for (const op of ops) {
    const result = await addOneNegative(
      cfg,
      accessToken,
      customerId,
      op,
      options.validateOnly,
    );
    results.push(result);
  }

  logger.info(
    {
      customerId,
      validateOnly: options.validateOnly,
      created: results.filter((r) => r.status === "created").length,
      duplicate: results.filter((r) => r.status === "duplicate").length,
      failed: results.filter((r) => r.status === "failed").length,
    },
    "Google Ads negative-keyword mutate",
  );

  return { validateOnly: options.validateOnly, results };
}
