import { pool } from "@workspace/db";

/**
 * System alerts — a durable, in-app record of the failures that the app's
 * best-effort background paths otherwise only logged and swallowed (a scheduled
 * run that threw, an inbound e-mail that couldn't be processed, a deliverable or
 * report send that failed). A solo operator never reads server logs, so without
 * this a silent failure is invisible. The "Te doen"/alerts surfaces read this.
 *
 * Like the pgvector cache (`semantic-store.ts`) and crawl history
 * (`crawl-history.ts`), this is a derived store that owns its own table via an
 * idempotent self-bootstrap (`CREATE TABLE IF NOT EXISTS`) instead of the
 * drizzle-kit push flow — pushing would try to drop the unmanaged tables it
 * doesn't know about, and the bootstrap runs identically in dev and on the
 * Reserved VM after a redeploy.
 *
 * Every operation is best-effort and self-swallowing: recording an alert runs
 * inside a failure handler, so it must NEVER throw (that would mask the original
 * error) and must never store secrets/PII — keep `context` to IDs, short error
 * text and source names.
 */

export type AlertSeverity = "error" | "warn";

export interface SystemAlert {
  id: number;
  source: string;
  severity: AlertSeverity;
  message: string;
  context: Record<string, unknown> | null;
  fingerprint: string | null;
  occurrences: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolvedAt: Date | null;
}

export interface RecordAlertInput {
  /** Where it came from, e.g. "scheduler", "email-inbound". */
  source: string;
  severity: AlertSeverity;
  /** Short human-readable Dutch summary; also part of the dedup fingerprint. */
  message: string;
  /**
   * Small structured context (IDs, short error text). If it carries a stable
   * `key`, that key is folded into the fingerprint so distinct subjects (e.g.
   * two different clients failing) stay as separate alerts instead of merging.
   */
  context?: Record<string, unknown> | null;
}

let ready: Promise<boolean> | null = null;

/**
 * Ensure the alerts table + indexes exist. Memoized; retries on failure. A
 * PARTIAL unique index on `fingerprint WHERE resolved_at IS NULL` is what makes
 * dedup possible: at most one OPEN alert per fingerprint, while a resolved alert
 * with the same fingerprint can reopen later as a fresh row.
 */
async function ensureTable(): Promise<boolean> {
  if (!ready) {
    ready = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS system_alerts (
           id serial PRIMARY KEY,
           source text NOT NULL,
           severity text NOT NULL,
           message text NOT NULL,
           context jsonb,
           fingerprint text,
           occurrences integer NOT NULL DEFAULT 1,
           first_seen_at timestamptz NOT NULL DEFAULT now(),
           last_seen_at timestamptz NOT NULL DEFAULT now(),
           resolved_at timestamptz
         )`,
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS system_alerts_unresolved_idx
           ON system_alerts (resolved_at, last_seen_at DESC)`,
      );
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS system_alerts_open_fingerprint_uidx
           ON system_alerts (fingerprint)
           WHERE resolved_at IS NULL AND fingerprint IS NOT NULL`,
      );
      return true;
    })().catch((err) => {
      ready = null;
      console.error(
        "system_alerts init failed (alerts unavailable):",
        err instanceof Error ? err.message : String(err),
      );
      return false;
    });
  }
  return ready;
}

/** Public warm-up so the table is ready before the first failure fires. */
export async function ensureAlertsTable(): Promise<boolean> {
  return ensureTable();
}

/** Stable dedup key. Capped so a giant message can't bloat the index. */
function fingerprintFor(input: RecordAlertInput): string {
  const key =
    input.context && typeof input.context.key === "string"
      ? `:${input.context.key}`
      : "";
  return `${input.source}:${input.message}${key}`.slice(0, 500);
}

function mapRow(r: Record<string, unknown>): SystemAlert {
  const toDate = (v: unknown): Date =>
    v instanceof Date ? v : new Date(String(v));
  return {
    id: Number(r.id),
    source: String(r.source),
    severity: (String(r.severity) === "error" ? "error" : "warn"),
    message: String(r.message),
    context: (r.context as Record<string, unknown> | null) ?? null,
    fingerprint: r.fingerprint == null ? null : String(r.fingerprint),
    occurrences: Number(r.occurrences ?? 1),
    firstSeenAt: toDate(r.first_seen_at),
    lastSeenAt: toDate(r.last_seen_at),
    resolvedAt: r.resolved_at == null ? null : toDate(r.resolved_at),
  };
}

/**
 * Record (or coalesce) a failure alert. Best-effort and NEVER throws: a repeat
 * of an open alert bumps its `occurrences`/`last_seen_at` instead of inserting a
 * duplicate, so a flapping background job can't flood the list.
 */
export async function recordAlert(input: RecordAlertInput): Promise<void> {
  if (!(await ensureTable())) return;
  try {
    const fp = fingerprintFor(input);
    await pool.query(
      `INSERT INTO system_alerts (source, severity, message, context, fingerprint)
         VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (fingerprint) WHERE resolved_at IS NULL AND fingerprint IS NOT NULL
         DO UPDATE SET occurrences = system_alerts.occurrences + 1,
                       last_seen_at = now(),
                       severity = EXCLUDED.severity,
                       message = EXCLUDED.message,
                       context = EXCLUDED.context`,
      [
        input.source,
        input.severity,
        input.message,
        input.context ? JSON.stringify(input.context) : null,
        fp,
      ],
    );
  } catch (err) {
    console.error(
      "Kon systeemmelding niet bewaren:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/** Alerts for the UI: open first, then newest. Returns [] on any failure. */
export async function listAlerts(opts?: {
  unresolvedOnly?: boolean;
  limit?: number;
}): Promise<SystemAlert[]> {
  if (!(await ensureTable())) return [];
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
  const where = opts?.unresolvedOnly ? "WHERE resolved_at IS NULL" : "";
  try {
    const res = await pool.query(
      `SELECT id, source, severity, message, context, fingerprint, occurrences,
              first_seen_at, last_seen_at, resolved_at
         FROM system_alerts
         ${where}
        ORDER BY (resolved_at IS NULL) DESC, last_seen_at DESC, id DESC
        LIMIT ${limit}`,
    );
    return res.rows.map(mapRow);
  } catch (err) {
    console.error(
      "Kon systeemmeldingen niet laden:",
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}

/**
 * Mark an alert resolved and return the updated row. Returns null when the alert
 * doesn't exist, was already resolved, or the DB is unavailable — the route maps
 * that to a 404. Atomic: the `WHERE ... resolved_at IS NULL` predicate means two
 * concurrent resolves can't both "win".
 */
export async function resolveAlert(id: number): Promise<SystemAlert | null> {
  if (!(await ensureTable())) return null;
  try {
    const res = await pool.query(
      `UPDATE system_alerts SET resolved_at = now()
         WHERE id = $1 AND resolved_at IS NULL
       RETURNING id, source, severity, message, context, fingerprint,
                 occurrences, first_seen_at, last_seen_at, resolved_at`,
      [id],
    );
    const row = res.rows[0];
    return row ? mapRow(row) : null;
  } catch (err) {
    console.error(
      "Kon systeemmelding niet sluiten:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/** Count of open alerts, for the "Te doen" overview + nav badge. 0 on failure. */
export async function countUnresolvedAlerts(): Promise<number> {
  if (!(await ensureTable())) return 0;
  try {
    const res = await pool.query(
      "SELECT count(*)::int AS n FROM system_alerts WHERE resolved_at IS NULL",
    );
    return Number(res.rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}
