import { pool } from "@workspace/db";
import type { ClickupPushRecord } from "@workspace/db";
import { logger } from "../logger";

/**
 * Idempotency + audit ledger for every Replit -> ClickUp push. This is what
 * makes a retried run, a double-fired schedule, or a crash-resume create EXACTLY
 * ONE ClickUp object.
 *
 * Flow per push:
 *  1. `claimPush` inserts (or no-ops on) the row by its unique `idempotencyKey`
 *     and atomically flips it to "processing" (a compare-and-set only from
 *     pending/failed, or a stale-processing row). A concurrent caller that can't
 *     claim gets `in-progress` and skips — no duplicate.
 *  2. The instant the ClickUp task exists, `recordObjectId` persists its id — so
 *     a crash BEFORE the fields/attachments are added leaves a row that a later
 *     claim resumes (it re-enriches the existing task) instead of re-creating.
 *  3. `markSucceeded` / `markFailed` close the row.
 *
 * The table is declared in the Drizzle schema (`clickup_push_records`) for typed
 * access, but CREATED here via an idempotent `CREATE TABLE IF NOT EXISTS`
 * self-bootstrap — exactly like `alerts-store` / the pgvector + crawl stores —
 * because this project never runs drizzle-kit push (it would drop the unmanaged
 * tables it doesn't know about).
 */

export type PushKind = "report" | "search_terms" | "alert";

/** How long a "processing" row may sit before a retry may reclaim it (crash guard). */
const STALE_PROCESSING_MS = 15 * 60 * 1000;

let ready: Promise<boolean> | null = null;

async function ensureTable(): Promise<boolean> {
  if (!ready) {
    ready = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS clickup_push_records (
           id serial PRIMARY KEY,
           kind text NOT NULL,
           idempotency_key text NOT NULL,
           source_run_id text,
           clickup_object_id text,
           clickup_url text,
           status text NOT NULL DEFAULT 'pending',
           attempts integer NOT NULL DEFAULT 0,
           last_error_code text,
           created_at timestamptz NOT NULL DEFAULT now(),
           updated_at timestamptz NOT NULL DEFAULT now()
         )`,
      );
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS clickup_push_records_idem_uidx
           ON clickup_push_records (idempotency_key)`,
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS clickup_push_records_kind_status_idx
           ON clickup_push_records (kind, status, updated_at DESC)`,
      );
      return true;
    })().catch((err) => {
      ready = null;
      logger.error(
        { scope: "clickup:push", err: err instanceof Error ? err.message : String(err) },
        "clickup_push_records init failed (push audit unavailable)",
      );
      return false;
    });
  }
  return ready;
}

/** Public warm-up so the ledger is ready before the first push fires. */
export async function ensurePushRecordsTable(): Promise<boolean> {
  return ensureTable();
}

// ---- Stable idempotency key builders --------------------------------------

/** A month's report for one client: `report:{clientId}:{YYYY-MM}`. */
export function reportKey(clientId: number | string, period: string): string {
  return `report:${clientId}:${period}`;
}

/** A week's search-terms analysis for one Ads account: `st:{customerId}:{isoMonday}`. */
export function searchTermsKey(customerId: string, isoWeekMonday: string): string {
  return `st:${customerId}:${isoWeekMonday}`;
}

/** An alert within a time window: `alert:{fingerprint}:{windowStartMs}`. */
export function alertKey(fingerprint: string, windowStartMs: number): string {
  return `alert:${fingerprint}:${windowStartMs}`;
}

// ---- Lifecycle -------------------------------------------------------------

export type PushClaim =
  /** We hold the row; proceed. `record.clickupObjectId` set => resume enrichment. */
  | { state: "claimed"; record: ClickupPushRecord }
  /** An earlier run already completed this push; nothing to do. */
  | { state: "already-succeeded"; record: ClickupPushRecord }
  /** Another worker currently holds a fresh claim; skip to avoid a duplicate. */
  | { state: "in-progress"; record: ClickupPushRecord | null };

function mapRow(r: Record<string, unknown>): ClickupPushRecord {
  const toDate = (v: unknown): Date =>
    v instanceof Date ? v : new Date(String(v));
  return {
    id: Number(r.id),
    kind: String(r.kind),
    idempotencyKey: String(r.idempotency_key),
    sourceRunId: r.source_run_id == null ? null : String(r.source_run_id),
    clickupObjectId:
      r.clickup_object_id == null ? null : String(r.clickup_object_id),
    clickupUrl: r.clickup_url == null ? null : String(r.clickup_url),
    status: String(r.status),
    attempts: Number(r.attempts ?? 0),
    lastErrorCode: r.last_error_code == null ? null : String(r.last_error_code),
    createdAt: toDate(r.created_at),
    updatedAt: toDate(r.updated_at),
  };
}

/**
 * Claim a push slot for `idempotencyKey`. Insert-if-absent, then a CAS flip to
 * "processing" that only wins from a claimable state — so exactly one caller
 * proceeds while others get `in-progress` / `already-succeeded`.
 */
export async function claimPush(input: {
  kind: PushKind;
  idempotencyKey: string;
  sourceRunId?: string | null;
}): Promise<PushClaim> {
  await ensureTable();

  await pool.query(
    `INSERT INTO clickup_push_records (kind, idempotency_key, source_run_id)
       VALUES ($1, $2, $3)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [input.kind, input.idempotencyKey, input.sourceRunId ?? null],
  );

  // Already done? (An object id guards against re-creation even if status drifted.)
  const existing = await pool.query(
    `SELECT * FROM clickup_push_records WHERE idempotency_key = $1`,
    [input.idempotencyKey],
  );
  const current = existing.rows[0] ? mapRow(existing.rows[0]) : null;
  if (current && current.status === "succeeded" && current.clickupObjectId) {
    return { state: "already-succeeded", record: current };
  }

  const claimed = await pool.query(
    `UPDATE clickup_push_records
        SET status = 'processing',
            attempts = attempts + 1,
            updated_at = now()
      WHERE idempotency_key = $1
        AND (
          status IN ('pending', 'failed')
          OR (status = 'processing' AND updated_at < now() - ($2::int * interval '1 millisecond'))
        )
    RETURNING *`,
    [input.idempotencyKey, STALE_PROCESSING_MS],
  );
  if (claimed.rows[0]) {
    return { state: "claimed", record: mapRow(claimed.rows[0]) };
  }
  return { state: "in-progress", record: current };
}

/** Persist the created object id the instant it exists (before enrichment). */
export async function recordObjectId(
  idempotencyKey: string,
  objectId: string,
  url: string | null,
): Promise<void> {
  await ensureTable();
  await pool.query(
    `UPDATE clickup_push_records
        SET clickup_object_id = $2, clickup_url = $3, updated_at = now()
      WHERE idempotency_key = $1`,
    [idempotencyKey, objectId, url],
  );
}

/** Close the row as succeeded (optionally backfilling object id/url). */
export async function markSucceeded(
  idempotencyKey: string,
  extra?: { objectId?: string; url?: string | null },
): Promise<void> {
  await ensureTable();
  await pool.query(
    `UPDATE clickup_push_records
        SET status = 'succeeded',
            last_error_code = NULL,
            clickup_object_id = COALESCE($2, clickup_object_id),
            clickup_url = COALESCE($3, clickup_url),
            updated_at = now()
      WHERE idempotency_key = $1`,
    [idempotencyKey, extra?.objectId ?? null, extra?.url ?? null],
  );
}

/** Mark the row failed with a short, non-sensitive code (retryable next run). */
export async function markFailed(
  idempotencyKey: string,
  code: string,
): Promise<void> {
  await ensureTable();
  await pool.query(
    `UPDATE clickup_push_records
        SET status = 'failed', last_error_code = $2, updated_at = now()
      WHERE idempotency_key = $1`,
    [idempotencyKey, code.slice(0, 200)],
  );
}

/** Read a push record by key (audit/UI); null when absent or DB unavailable. */
export async function getPushByKey(
  idempotencyKey: string,
): Promise<ClickupPushRecord | null> {
  if (!(await ensureTable())) return null;
  try {
    const res = await pool.query(
      `SELECT * FROM clickup_push_records WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  } catch {
    return null;
  }
}
