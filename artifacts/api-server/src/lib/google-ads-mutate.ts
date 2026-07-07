/**
 * Live Google Ads WRITE path — the ONLY module in the app that mutates a
 * customer account. It is deliberately tiny and single-purpose: it can *add*
 * negative keywords to a Shopping ad group and nothing else. It can never
 * update or remove a criterion, never touch a positive keyword, budget, bid or
 * anything outside `adGroupCriteria:mutate` create-with-negative operations.
 *
 * Two hard guardrails back the "only add negatives" promise:
 *   1. The request body is constructed here from validated inputs — only a
 *      `create` operation with `negative: true` is ever built.
 *   2. A mandatory `validateOnly` (dry-run) mode is a first-class parameter, so
 *      the caller can — and by policy does — test every batch against Google's
 *      own validation before anything is written.
 *
 * Operations are sent one at a time (not batched with partialFailure) so each
 * decision gets an unambiguous ok/error result, and an existing-duplicate
 * negative is treated as success (idempotent) rather than a failure.
 */

import {
  readConfig,
  getAccessToken,
  digitsOnly,
  GoogleAdsConfigError,
} from "./google-ads";

const API_VERSION = "v24";
const API_BASE = `https://googleads.googleapis.com/${API_VERSION}`;

/** Match types we allow for a negative keyword. */
export type NegativeMatchType = "EXACT" | "PHRASE" | "BROAD";
const ALLOWED_MATCH_TYPES: ReadonlySet<string> = new Set([
  "EXACT",
  "PHRASE",
  "BROAD",
]);

/** Google's max keyword text length. */
const MAX_KEYWORD_LEN = 80;
/** Never push more than this in one call — a sanity cap, not a Google limit. */
const MAX_BATCH = 50;

export interface NegativeKeywordOp {
  /** Stable id the caller uses to correlate the result back to a decision. */
  ref: number;
  adGroupId: string;
  text: string;
  matchType: NegativeMatchType;
}

export interface NegativeKeywordOpResult {
  ref: number;
  adGroupId: string;
  text: string;
  matchType: NegativeMatchType;
  ok: boolean;
  /** Present on success (the created criterion, or a would-be name in dry-run). */
  resourceName: string | null;
  /** True when Google reported the negative already exists (idempotent no-op). */
  alreadyExists: boolean;
  error: string | null;
}

function validateOp(op: NegativeKeywordOp): void {
  if (!digitsOnly(op.adGroupId)) {
    throw new GoogleAdsConfigError(`Ongeldige advertentiegroep-id: ${op.adGroupId}`);
  }
  const text = op.text?.trim() ?? "";
  if (!text) {
    throw new GoogleAdsConfigError("Leeg negatief zoekwoord is niet toegestaan.");
  }
  if (text.length > MAX_KEYWORD_LEN) {
    throw new GoogleAdsConfigError(
      `Negatief zoekwoord is te lang (max ${MAX_KEYWORD_LEN} tekens): "${text}"`,
    );
  }
  if (!ALLOWED_MATCH_TYPES.has(op.matchType)) {
    throw new GoogleAdsConfigError(`Ongeldig match type: ${op.matchType}`);
  }
}

function looksLikeDuplicate(detail: string): boolean {
  const d = detail.toLowerCase();
  return (
    d.includes("duplicate") ||
    d.includes("already exists") ||
    d.includes("bestaat al")
  );
}

/**
 * Add negative keywords to Shopping ad groups. When `validateOnly` is true this
 * only asks Google to validate the operations — nothing is written. Each op is
 * sent on its own so results map 1:1 to the input `ref`s.
 */
export async function addAdGroupNegativeKeywords(
  rawCustomerId: string,
  ops: NegativeKeywordOp[],
  opts: { validateOnly: boolean },
): Promise<{ validateOnly: boolean; results: NegativeKeywordOpResult[] }> {
  const cfg = readConfig();
  const customerId = digitsOnly(rawCustomerId);
  if (!customerId) {
    throw new GoogleAdsConfigError("Ongeldig Google Ads customer ID.");
  }
  if (ops.length === 0) return { validateOnly: opts.validateOnly, results: [] };
  if (ops.length > MAX_BATCH) {
    throw new GoogleAdsConfigError(
      `Te veel bewerkingen in één keer (max ${MAX_BATCH}).`,
    );
  }
  ops.forEach(validateOp);

  const accessToken = await getAccessToken(cfg);
  const url = `${API_BASE}/customers/${customerId}/adGroupCriteria:mutate`;
  const results: NegativeKeywordOpResult[] = [];

  for (const op of ops) {
    const adGroupId = digitsOnly(op.adGroupId);
    const body = {
      // Only ever a create-with-negative. No update/remove is constructed here.
      operations: [
        {
          create: {
            adGroup: `customers/${customerId}/adGroups/${adGroupId}`,
            negative: true,
            keyword: {
              text: op.text.trim(),
              matchType: op.matchType,
            },
          },
        },
      ],
      validateOnly: opts.validateOnly,
      partialFailure: false,
    };

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
      results.push({
        ref: op.ref,
        adGroupId: op.adGroupId,
        text: op.text,
        matchType: op.matchType,
        ok: false,
        resourceName: null,
        alreadyExists: false,
        error: `Netwerkfout: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
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
          JSON.stringify(apiError).slice(0, 400);
      } catch {
        detail = raw.slice(0, 400) || detail;
      }
      const dup = looksLikeDuplicate(detail);
      results.push({
        ref: op.ref,
        adGroupId: op.adGroupId,
        text: op.text,
        matchType: op.matchType,
        // A duplicate means the negative is already in place — the desired end
        // state — so treat it as a successful (idempotent) no-op.
        ok: dup,
        resourceName: null,
        alreadyExists: dup,
        error: dup ? null : `Google Ads-fout: ${detail}`,
      });
      continue;
    }

    let resourceName: string | null = null;
    try {
      const parsed = JSON.parse(raw) as {
        results?: { resourceName?: string }[];
      };
      resourceName = parsed.results?.[0]?.resourceName ?? null;
    } catch {
      // A 2xx with an unparseable body still means the op was accepted.
    }
    results.push({
      ref: op.ref,
      adGroupId: op.adGroupId,
      text: op.text,
      matchType: op.matchType,
      ok: true,
      resourceName,
      alreadyExists: false,
      error: null,
    });
  }

  return { validateOnly: opts.validateOnly, results };
}
