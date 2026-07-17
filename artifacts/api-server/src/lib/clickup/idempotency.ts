import { pool } from "@workspace/db";
import type { ClickupPushRecord } from "@workspace/db";
import { logger } from "../logger";

export type PushKind = "report" | "search_terms" | "alert";
const STALE_PROCESSING_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
let ready: Promise<boolean> | null = null;

async function ensureTable(): Promise<boolean> {
  if (!ready) {
    ready = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS clickup_push_records (
        id serial PRIMARY KEY, kind text NOT NULL, idempotency_key text NOT NULL,
        source_run_id text, clickup_object_id text, clickup_url text,
        status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
        last_error_code text, created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now())`);
      await pool.query(`ALTER TABLE clickup_push_records ADD COLUMN IF NOT EXISTS correlation_id text`);
      await pool.query(`ALTER TABLE clickup_push_records ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz`);
      await pool.query(`ALTER TABLE clickup_push_records ADD COLUMN IF NOT EXISTS terminal_at timestamptz`);
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS clickup_push_records_idem_uidx ON clickup_push_records (idempotency_key)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS clickup_push_records_kind_status_idx ON clickup_push_records (kind, status, updated_at DESC)`);
      return true;
    })().catch((err) => {
      ready = null;
      logger.error({ scope: "clickup:push", err: err instanceof Error ? err.message : String(err) }, "clickup_push_records init failed");
      return false;
    });
  }
  return ready;
}

export async function ensurePushRecordsTable() { return ensureTable(); }
export const reportKey = (clientId: number | string, period: string) => `report:${clientId}:${period}`;
export const searchTermsKey = (customerId: string, week: string) => `st:${customerId}:${week}`;
export const alertKey = (fingerprint: string, start: number) => `alert:${fingerprint}:${start}`;

export type ObservablePushRecord = ClickupPushRecord & {
  correlationId: string | null;
  nextAttemptAt: Date | null;
  terminalAt: Date | null;
};

function mapRow(r: Record<string, unknown>): ObservablePushRecord {
  const date = (value: unknown): Date | null =>
    value == null ? null : value instanceof Date ? value : new Date(String(value));
  return {
    id: Number(r.id), kind: String(r.kind), idempotencyKey: String(r.idempotency_key),
    sourceRunId: r.source_run_id == null ? null : String(r.source_run_id),
    clickupObjectId: r.clickup_object_id == null ? null : String(r.clickup_object_id),
    clickupUrl: r.clickup_url == null ? null : String(r.clickup_url),
    status: String(r.status), attempts: Number(r.attempts ?? 0),
    lastErrorCode: r.last_error_code == null ? null : String(r.last_error_code),
    createdAt: date(r.created_at) ?? new Date(0), updatedAt: date(r.updated_at) ?? new Date(0),
    correlationId: r.correlation_id == null ? null : String(r.correlation_id),
    nextAttemptAt: date(r.next_attempt_at), terminalAt: date(r.terminal_at),
  };
}

export type PushClaim =
  | { state: "claimed"; record: ObservablePushRecord }
  | { state: "already-succeeded"; record: ObservablePushRecord }
  | { state: "in-progress"; record: ObservablePushRecord | null }
  | { state: "dead-letter"; record: ObservablePushRecord };

export async function claimPush(input: {
  kind: PushKind; idempotencyKey: string; sourceRunId?: string | null; correlationId?: string | null;
}): Promise<PushClaim> {
  await ensureTable();
  await pool.query(
    `INSERT INTO clickup_push_records (kind, idempotency_key, source_run_id, correlation_id)
       VALUES ($1, $2, $3, $4)
     ON CONFLICT (idempotency_key) DO UPDATE
       SET correlation_id = COALESCE(clickup_push_records.correlation_id, EXCLUDED.correlation_id)`,
    [input.kind, input.idempotencyKey, input.sourceRunId ?? null, input.correlationId ?? null],
  );
  const existing = await pool.query(`SELECT * FROM clickup_push_records WHERE idempotency_key = $1`, [input.idempotencyKey]);
  const current = existing.rows[0] ? mapRow(existing.rows[0]) : null;
  if (current?.status === "succeeded" && current.clickupObjectId) return { state: "already-succeeded", record: current };
  if (current?.status === "dead_letter") return { state: "dead-letter", record: current };
  const claimed = await pool.query(
    `UPDATE clickup_push_records
        SET status = 'processing', attempts = attempts + 1,
            next_attempt_at = NULL, updated_at = now()
      WHERE idempotency_key = $1
        AND (status = 'pending'
          OR (status = 'retrying' AND (next_attempt_at IS NULL OR next_attempt_at <= now()))
          OR (status = 'processing' AND updated_at < now() - ($2::int * interval '1 millisecond')))
    RETURNING *`,
    [input.idempotencyKey, STALE_PROCESSING_MS],
  );
  return claimed.rows[0]
    ? { state: "claimed", record: mapRow(claimed.rows[0]) }
    : { state: "in-progress", record: current };
}

export async function recordObjectId(key: string, id: string, url: string | null) {
  await ensureTable();
  await pool.query(
    `UPDATE clickup_push_records
        SET clickup_object_id = $2, clickup_url = $3, updated_at = now()
      WHERE idempotency_key = $1`,
    [key, id, url],
  );
}

export async function markSucceeded(key: string, extra?: { objectId?: string; url?: string | null }) {
  await ensureTable();
  await pool.query(
    `UPDATE clickup_push_records
        SET status = 'succeeded', last_error_code = NULL,
            next_attempt_at = NULL, terminal_at = NULL,
            clickup_object_id = COALESCE($2, clickup_object_id),
            clickup_url = COALESCE($3, clickup_url), updated_at = now()
      WHERE idempotency_key = $1`,
    [key, extra?.objectId ?? null, extra?.url ?? null],
  );
}

export async function markFailed(key: string, code: string) {
  await ensureTable();
  const safeCode = code.slice(0, 200);
  // Preserve the established close-out contract first. A second atomic update
  // classifies the failed row for durable retry/dead-letter observability.
  await pool.query(
    `UPDATE clickup_push_records
        SET status = 'failed', last_error_code = $2, updated_at = now()
      WHERE idempotency_key = $1`,
    [key, safeCode],
  );
  await pool.query(
    `UPDATE clickup_push_records
        SET status = CASE WHEN attempts >= $2 THEN 'dead_letter' ELSE 'retrying' END,
            next_attempt_at = CASE WHEN attempts >= $2 THEN NULL
              ELSE now() + (LEAST(60, POWER(2, GREATEST(attempts - 1, 0)))::int * interval '1 minute') END,
            terminal_at = CASE WHEN attempts >= $2 THEN now() ELSE NULL END,
            updated_at = now()
      WHERE idempotency_key = $1 AND status = 'failed'`,
    [key, MAX_ATTEMPTS],
  );
}

export async function getPushByKey(key: string) {
  if (!(await ensureTable())) return null;
  const result = await pool.query(`SELECT * FROM clickup_push_records WHERE idempotency_key = $1`, [key]);
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function listPushRecords(opts: { status?: string; kind?: string; sourceRunId?: string; limit?: number } = {}) {
  if (!(await ensureTable())) return [];
  const values: unknown[] = [];
  const where: string[] = [];
  if (opts.status) { values.push(opts.status); where.push(`status = $${values.length}`); }
  if (opts.kind) { values.push(opts.kind); where.push(`kind = $${values.length}`); }
  if (opts.sourceRunId) { values.push(opts.sourceRunId); where.push(`source_run_id = $${values.length}`); }
  values.push(Math.min(Math.max(opts.limit ?? 100, 1), 500));
  const result = await pool.query(
    `SELECT * FROM clickup_push_records ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY updated_at DESC LIMIT $${values.length}`,
    values,
  );
  return result.rows.map(mapRow);
}

export async function pushQueueSummary() {
  if (!(await ensureTable())) return { available: false, pending: 0, processing: 0, retrying: 0, succeeded: 0, deadLetters: 0, failed: 0 };
  const result = await pool.query(`SELECT status, count(*)::int count FROM clickup_push_records GROUP BY status`);
  const counts = new Map(result.rows.map((row) => [String(row.status), Number(row.count)]));
  return { available: true, pending: counts.get("pending") ?? 0, processing: counts.get("processing") ?? 0, retrying: counts.get("retrying") ?? 0, succeeded: counts.get("succeeded") ?? 0, deadLetters: counts.get("dead_letter") ?? 0, failed: counts.get("failed") ?? 0 };
}

export async function requeuePushRecord(id: number) {
  if (!(await ensureTable())) return null;
  const result = await pool.query(
    `UPDATE clickup_push_records
        SET status = 'pending', attempts = 0, last_error_code = NULL,
            next_attempt_at = NULL, terminal_at = NULL, updated_at = now()
      WHERE id = $1 AND status IN ('retrying', 'dead_letter', 'failed')
    RETURNING *`,
    [id],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}
