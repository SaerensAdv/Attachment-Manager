/**
 * Persistence for the Shopping search-term relevance tool.
 *
 * Like `alerts-store` / `crawl-history` / `semantic-store`, this store owns its
 * own tables through an idempotent self-bootstrap (`CREATE TABLE IF NOT EXISTS`)
 * instead of the drizzle-kit push flow — pushing would try to drop the tables it
 * doesn't manage, and the bootstrap runs identically in dev and after a redeploy.
 *
 * Four tables:
 *   - shopping_term_runs      one analysis run for a client (snapshot header)
 *   - shopping_term_scores    one scored search term per run (the review rows)
 *   - shopping_term_decisions the user's exclude/keep choice per scored term
 *   - negative_learned_rules  durable rules learned from past decisions
 *   - shopping_negatives_settings  per-client "may write to Google Ads" switch
 *
 * The apply transition copies the proposals-store compare-and-set pattern: a
 * decision is claimed (pending -> applied) BEFORE the live mutate, and reverted
 * on failure, so a negative can never be pushed to Google Ads twice.
 */

import { pool } from "@workspace/db";
import type { RelevanceResult, LearnedRule } from "./shopping-relevance";

export interface ShoppingRunAdGroup {
  adGroupId: string;
  adGroupName: string;
  campaignName: string;
  products: { title: string; brand: string; productType: string }[];
}

export interface ShoppingRun {
  id: number;
  clientId: number;
  customerId: string;
  currency: string;
  adGroupCount: number;
  termCount: number;
  adGroups: ShoppingRunAdGroup[];
  warnings: string[];
  createdAt: string;
}

export interface ShoppingScore {
  id: number;
  runId: number;
  adGroupId: string;
  adGroupName: string;
  campaignId: string;
  campaignName: string;
  term: string;
  score: number;
  verdict: string;
  advice: string;
  reason: string;
  matchedProducts: string[];
  alreadyExcluded: boolean;
  suggestedMatchType: string;
  cost: number;
  clicks: number;
  conversions: number;
}

export interface ShoppingDecision {
  id: number;
  scoreId: number;
  runId: number;
  clientId: number;
  customerId: string;
  adGroupId: string;
  term: string;
  decision: "exclude" | "keep";
  matchType: string;
  note: string | null;
  status: "pending" | "applied" | "failed";
  adsResourceName: string | null;
  error: string | null;
  appliedAt: string | null;
  createdAt: string;
}

let ready: Promise<boolean> | null = null;

async function ensureTables(): Promise<boolean> {
  if (!ready) {
    ready = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS shopping_term_runs (
           id serial PRIMARY KEY,
           client_id integer NOT NULL,
           customer_id text NOT NULL,
           currency text NOT NULL DEFAULT 'EUR',
           ad_group_count integer NOT NULL DEFAULT 0,
           term_count integer NOT NULL DEFAULT 0,
           ad_groups jsonb NOT NULL DEFAULT '[]'::jsonb,
           warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
           created_at timestamptz NOT NULL DEFAULT now()
         )`,
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS shopping_term_runs_client_idx
           ON shopping_term_runs (client_id, created_at DESC)`,
      );
      await pool.query(
        `CREATE TABLE IF NOT EXISTS shopping_term_scores (
           id serial PRIMARY KEY,
           run_id integer NOT NULL REFERENCES shopping_term_runs(id) ON DELETE CASCADE,
           ad_group_id text NOT NULL,
           ad_group_name text NOT NULL DEFAULT '',
           campaign_id text NOT NULL DEFAULT '',
           campaign_name text NOT NULL DEFAULT '',
           term text NOT NULL,
           score integer NOT NULL DEFAULT 0,
           verdict text NOT NULL DEFAULT 'review',
           advice text NOT NULL DEFAULT '',
           reason text NOT NULL DEFAULT '',
           matched_products jsonb NOT NULL DEFAULT '[]'::jsonb,
           already_excluded boolean NOT NULL DEFAULT false,
           suggested_match_type text NOT NULL DEFAULT 'EXACT',
           cost numeric NOT NULL DEFAULT 0,
           clicks integer NOT NULL DEFAULT 0,
           conversions numeric NOT NULL DEFAULT 0
         )`,
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS shopping_term_scores_run_idx
           ON shopping_term_scores (run_id)`,
      );
      await pool.query(
        `CREATE TABLE IF NOT EXISTS shopping_term_decisions (
           id serial PRIMARY KEY,
           score_id integer NOT NULL REFERENCES shopping_term_scores(id) ON DELETE CASCADE,
           run_id integer NOT NULL REFERENCES shopping_term_runs(id) ON DELETE CASCADE,
           client_id integer NOT NULL,
           customer_id text NOT NULL,
           ad_group_id text NOT NULL,
           term text NOT NULL,
           decision text NOT NULL,
           match_type text NOT NULL DEFAULT 'EXACT',
           note text,
           status text NOT NULL DEFAULT 'pending',
           ads_resource_name text,
           error text,
           applied_at timestamptz,
           created_at timestamptz NOT NULL DEFAULT now(),
           updated_at timestamptz NOT NULL DEFAULT now()
         )`,
      );
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS shopping_term_decisions_score_uidx
           ON shopping_term_decisions (score_id)`,
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS shopping_term_decisions_run_idx
           ON shopping_term_decisions (run_id)`,
      );
      await pool.query(
        `CREATE TABLE IF NOT EXISTS negative_learned_rules (
           id serial PRIMARY KEY,
           client_id integer,
           scope text NOT NULL,
           pattern text NOT NULL,
           rule text NOT NULL,
           note text,
           source_decision_id integer,
           created_at timestamptz NOT NULL DEFAULT now()
         )`,
      );
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS negative_learned_rules_uidx
           ON negative_learned_rules (client_id, scope, pattern, rule)`,
      );
      await pool.query(
        `CREATE TABLE IF NOT EXISTS shopping_negatives_settings (
           client_id integer PRIMARY KEY,
           write_enabled boolean NOT NULL DEFAULT false,
           updated_at timestamptz NOT NULL DEFAULT now()
         )`,
      );
      return true;
    })().catch((err) => {
      ready = null;
      console.error(
        "shopping-negatives store init failed:",
        err instanceof Error ? err.message : String(err),
      );
      return false;
    });
  }
  return ready;
}

/** Public warm-up so the tables exist before the first request. */
export async function ensureShoppingNegativesTables(): Promise<boolean> {
  return ensureTables();
}

function n(v: unknown): number {
  const x = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(x) ? x : 0;
}

function toIso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

function mapRun(r: Record<string, unknown>): ShoppingRun {
  return {
    id: Number(r.id),
    clientId: Number(r.client_id),
    customerId: String(r.customer_id),
    currency: String(r.currency),
    adGroupCount: Number(r.ad_group_count),
    termCount: Number(r.term_count),
    adGroups: (r.ad_groups as ShoppingRunAdGroup[] | null) ?? [],
    warnings: (r.warnings as string[] | null) ?? [],
    createdAt: toIso(r.created_at),
  };
}

function mapScore(r: Record<string, unknown>): ShoppingScore {
  return {
    id: Number(r.id),
    runId: Number(r.run_id),
    adGroupId: String(r.ad_group_id),
    adGroupName: String(r.ad_group_name),
    campaignId: String(r.campaign_id),
    campaignName: String(r.campaign_name),
    term: String(r.term),
    score: Number(r.score),
    verdict: String(r.verdict),
    advice: String(r.advice),
    reason: String(r.reason),
    matchedProducts: (r.matched_products as string[] | null) ?? [],
    alreadyExcluded: r.already_excluded === true,
    suggestedMatchType: String(r.suggested_match_type),
    cost: n(r.cost),
    clicks: Number(r.clicks),
    conversions: n(r.conversions),
  };
}

function mapDecision(r: Record<string, unknown>): ShoppingDecision {
  return {
    id: Number(r.id),
    scoreId: Number(r.score_id),
    runId: Number(r.run_id),
    clientId: Number(r.client_id),
    customerId: String(r.customer_id),
    adGroupId: String(r.ad_group_id),
    term: String(r.term),
    decision: String(r.decision) === "keep" ? "keep" : "exclude",
    matchType: String(r.match_type),
    note: r.note == null ? null : String(r.note),
    status:
      String(r.status) === "applied"
        ? "applied"
        : String(r.status) === "failed"
          ? "failed"
          : "pending",
    adsResourceName: r.ads_resource_name == null ? null : String(r.ads_resource_name),
    error: r.error == null ? null : String(r.error),
    appliedAt: r.applied_at == null ? null : toIso(r.applied_at),
    createdAt: toIso(r.created_at),
  };
}

/**
 * Persist a scored run: the header + one score row per term, in a transaction so
 * a run is never half-written. Returns the new run id.
 */
export async function createShoppingTermRun(
  clientId: number,
  result: RelevanceResult,
): Promise<number> {
  await ensureTables();
  const adGroupsMeta: ShoppingRunAdGroup[] = result.adGroups.map((g) => ({
    adGroupId: g.adGroupId,
    adGroupName: g.adGroupName,
    campaignName: g.campaignName,
    products: g.products,
  }));
  const termCount = result.adGroups.reduce((s, g) => s + g.terms.length, 0);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const runRes = await client.query(
      `INSERT INTO shopping_term_runs
         (client_id, customer_id, currency, ad_group_count, term_count, ad_groups, warnings)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
       RETURNING id`,
      [
        clientId,
        result.customerId,
        result.currency,
        result.adGroups.length,
        termCount,
        JSON.stringify(adGroupsMeta),
        JSON.stringify(result.warnings),
      ],
    );
    const runId = Number(runRes.rows[0].id);

    // Insert term rows one-by-one. This is an occasional, user-triggered action
    // bounded by MAX_TERMS_PER_GROUP * groups, so clarity beats a bulk insert.
    for (const g of result.adGroups) {
      for (const t of g.terms) {
        await client.query(
          `INSERT INTO shopping_term_scores
             (run_id, ad_group_id, ad_group_name, campaign_id, campaign_name, term,
              score, verdict, advice, reason, matched_products, already_excluded,
              suggested_match_type, cost, clicks, conversions)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16)`,
          [
            runId,
            g.adGroupId,
            g.adGroupName,
            g.campaignId,
            g.campaignName,
            t.term,
            t.score,
            t.verdict,
            t.advice,
            t.reason,
            JSON.stringify(t.matchedProducts),
            t.alreadyExcluded,
            t.suggestedMatchType,
            t.cost,
            t.clicks,
            t.conversions,
          ],
        );
      }
    }
    await client.query("COMMIT");
    return runId;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function getShoppingTermRun(runId: number): Promise<{
  run: ShoppingRun;
  scores: ShoppingScore[];
  decisions: ShoppingDecision[];
} | null> {
  await ensureTables();
  const runRes = await pool.query(
    `SELECT * FROM shopping_term_runs WHERE id = $1`,
    [runId],
  );
  if (runRes.rows.length === 0) return null;
  const scoreRes = await pool.query(
    `SELECT * FROM shopping_term_scores WHERE run_id = $1
       ORDER BY ad_group_name ASC,
                CASE verdict WHEN 'exclude' THEN 0 WHEN 'review' THEN 1 ELSE 2 END,
                cost DESC`,
    [runId],
  );
  const decRes = await pool.query(
    `SELECT * FROM shopping_term_decisions WHERE run_id = $1`,
    [runId],
  );
  return {
    run: mapRun(runRes.rows[0]),
    scores: scoreRes.rows.map(mapScore),
    decisions: decRes.rows.map(mapDecision),
  };
}

export async function listShoppingTermRuns(
  clientId: number,
  limit = 20,
): Promise<ShoppingRun[]> {
  await ensureTables();
  const res = await pool.query(
    `SELECT * FROM shopping_term_runs WHERE client_id = $1
       ORDER BY created_at DESC LIMIT $2`,
    [clientId, Math.min(Math.max(limit, 1), 100)],
  );
  return res.rows.map(mapRun);
}

export interface DecisionInput {
  scoreId: number;
  decision: "exclude" | "keep";
  matchType?: "EXACT" | "PHRASE" | "BROAD";
  note?: string | null;
}

/**
 * Upsert a batch of decisions for one run (one per scored term). An already
 * applied decision keeps its `applied` status; otherwise an exclude becomes
 * `pending` (ready to push) and a keep becomes `pending` too (it just won't be
 * pushed). Learns a durable rule from each choice. Returns the saved decisions.
 */
export async function saveShoppingDecisions(
  runId: number,
  items: DecisionInput[],
): Promise<ShoppingDecision[]> {
  await ensureTables();
  if (items.length === 0) return [];

  const runRes = await pool.query(
    `SELECT client_id, customer_id FROM shopping_term_runs WHERE id = $1`,
    [runId],
  );
  if (runRes.rows.length === 0) throw new Error("Run niet gevonden.");
  const clientId = Number(runRes.rows[0].client_id);
  const customerId = String(runRes.rows[0].customer_id);

  const ids = items.map((i) => i.scoreId);
  const scoreRes = await pool.query(
    `SELECT id, ad_group_id, ad_group_name, term FROM shopping_term_scores
       WHERE run_id = $1 AND id = ANY($2::int[])`,
    [runId, ids],
  );
  const scoreById = new Map<
    number,
    { adGroupId: string; adGroupName: string; term: string }
  >();
  for (const r of scoreRes.rows) {
    scoreById.set(Number(r.id), {
      adGroupId: String(r.ad_group_id),
      adGroupName: String(r.ad_group_name),
      term: String(r.term),
    });
  }

  const saved: ShoppingDecision[] = [];
  for (const item of items) {
    const meta = scoreById.get(item.scoreId);
    if (!meta) continue; // score not in this run — skip silently
    const matchType = item.matchType ?? "EXACT";
    const note = item.note?.trim() ? item.note.trim() : null;
    const res = await pool.query(
      `INSERT INTO shopping_term_decisions
         (score_id, run_id, client_id, customer_id, ad_group_id, term, decision, match_type, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (score_id) DO UPDATE SET
         decision = EXCLUDED.decision,
         match_type = EXCLUDED.match_type,
         note = EXCLUDED.note,
         status = CASE
           WHEN shopping_term_decisions.status = 'applied' THEN 'applied'
           ELSE 'pending'
         END,
         error = CASE
           WHEN shopping_term_decisions.status = 'applied' THEN shopping_term_decisions.error
           ELSE NULL
         END,
         updated_at = now()
       RETURNING *`,
      [
        item.scoreId,
        runId,
        clientId,
        customerId,
        meta.adGroupId,
        meta.term,
        item.decision,
        matchType,
        note,
      ],
    );
    const decision = mapDecision(res.rows[0]);
    saved.push(decision);

    // Learn from this decision (Phase 3): the exact term is pinned for future
    // runs, and a note is carried along as the human-readable reason. Idempotent.
    await learnFromDecision(clientId, decision);
  }
  return saved;
}

/** Record (or refresh) a term-scope learned rule from a saved decision. */
async function learnFromDecision(
  clientId: number,
  decision: ShoppingDecision,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO negative_learned_rules
         (client_id, scope, pattern, rule, note, source_decision_id)
       VALUES ($1, 'term', $2, $3, $4, $5)
       ON CONFLICT (client_id, scope, pattern, rule) DO UPDATE SET
         note = EXCLUDED.note,
         source_decision_id = EXCLUDED.source_decision_id`,
      [clientId, decision.term, decision.decision, decision.note, decision.id],
    );
  } catch (err) {
    console.error(
      "Kon geleerde regel niet opslaan:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/** All learned rules that apply to a client (its own + globals). */
export async function getLearnedRules(clientId: number): Promise<LearnedRule[]> {
  await ensureTables();
  const res = await pool.query(
    `SELECT scope, pattern, rule, note FROM negative_learned_rules
       WHERE client_id = $1 OR client_id IS NULL`,
    [clientId],
  );
  return res.rows.map((r) => ({
    scope:
      String(r.scope) === "brand"
        ? "brand"
        : String(r.scope) === "adgroup"
          ? "adgroup"
          : "term",
    pattern: String(r.pattern),
    rule: String(r.rule) === "keep" ? "keep" : "exclude",
    note: r.note == null ? null : String(r.note),
  }));
}

export async function getWriteEnabled(clientId: number): Promise<boolean> {
  await ensureTables();
  const res = await pool.query(
    `SELECT write_enabled FROM shopping_negatives_settings WHERE client_id = $1`,
    [clientId],
  );
  return res.rows[0]?.write_enabled === true;
}

export async function setWriteEnabled(
  clientId: number,
  enabled: boolean,
): Promise<void> {
  await ensureTables();
  await pool.query(
    `INSERT INTO shopping_negatives_settings (client_id, write_enabled, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (client_id) DO UPDATE SET write_enabled = EXCLUDED.write_enabled, updated_at = now()`,
    [clientId, enabled],
  );
}

/** Load specific decisions that belong to a client (for the apply route). */
export async function getDecisionsForClient(
  clientId: number,
  decisionIds: number[],
): Promise<ShoppingDecision[]> {
  await ensureTables();
  if (decisionIds.length === 0) return [];
  const res = await pool.query(
    `SELECT * FROM shopping_term_decisions
       WHERE client_id = $1 AND id = ANY($2::int[])`,
    [clientId, decisionIds],
  );
  return res.rows.map(mapDecision);
}

/**
 * Atomically claim a pending exclude decision for the live push (pending ->
 * applied). Guarded on status = 'pending' AND decision = 'exclude' so a keep, a
 * failed one, or an already-applied one can't be claimed. Returns the row, or
 * null when the claim lost the race / wasn't eligible.
 */
export async function claimDecisionForApply(
  id: number,
): Promise<ShoppingDecision | null> {
  await ensureTables();
  const res = await pool.query(
    `UPDATE shopping_term_decisions
       SET status = 'applied', updated_at = now()
     WHERE id = $1 AND status = 'pending' AND decision = 'exclude'
     RETURNING *`,
    [id],
  );
  return res.rows[0] ? mapDecision(res.rows[0]) : null;
}

/** Stamp the Google Ads resource name after a successful push. */
export async function markDecisionApplied(
  id: number,
  resourceName: string | null,
): Promise<void> {
  await ensureTables();
  await pool.query(
    `UPDATE shopping_term_decisions
       SET ads_resource_name = $2, applied_at = now(), error = NULL, updated_at = now()
     WHERE id = $1`,
    [id, resourceName],
  );
}

/** Roll a claimed decision back to pending after a failed push, keeping error. */
export async function revertDecisionToPending(
  id: number,
  error: string | null,
): Promise<void> {
  await ensureTables();
  await pool.query(
    `UPDATE shopping_term_decisions
       SET status = 'pending', error = $2, applied_at = NULL, updated_at = now()
     WHERE id = $1 AND status = 'applied'`,
    [id, error],
  );
}
