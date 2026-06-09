import { pool } from "@workspace/db";
import type { CrawlStats } from "./screaming-frog-signals";

/**
 * Crawl history — keeps one snapshot per client per crawl day so the agency can
 * compare a client's technical SEO month over month. The client record keeps
 * only the *latest* crawl (read by the agents); this table keeps the trail.
 *
 * Like the pgvector cache in `semantic-store.ts`, this is a derived store that
 * owns its own table via an idempotent self-bootstrap (`CREATE TABLE IF NOT
 * EXISTS`) instead of the drizzle-kit push flow — pushing would try to drop the
 * unmanaged tables it doesn't know about. Every operation is best-effort: a DB
 * failure must never break a crawl upload (the latest crawl is still stored on
 * the client), so failures degrade to an empty history rather than throwing.
 */

export interface CrawlSnapshot {
  id: number;
  clientId: number;
  crawledAt: Date;
  stats: CrawlStats;
}

let ready: Promise<boolean> | null = null;

/** The crawl's calendar day (UTC) — the dedup key for one snapshot per day. */
function dayOf(crawledAt: Date): string {
  return crawledAt.toISOString().slice(0, 10);
}

/**
 * Ensure the snapshot table exists with the daily-uniqueness constraint.
 * Memoized; retries on failure. Additive ALTERs bring an older table (created
 * before `crawled_day` existed) up to the current shape without a destructive
 * push.
 */
async function ensureTable(): Promise<boolean> {
  if (!ready) {
    ready = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS crawl_snapshots (
           id serial PRIMARY KEY,
           client_id integer NOT NULL,
           crawled_at timestamptz NOT NULL,
           crawled_day date NOT NULL,
           stats jsonb NOT NULL,
           created_at timestamptz NOT NULL DEFAULT now()
         )`,
      );
      // Older tables predate crawled_day: add + backfill before the constraint.
      await pool.query(
        "ALTER TABLE crawl_snapshots ADD COLUMN IF NOT EXISTS crawled_day date",
      );
      await pool.query(
        "UPDATE crawl_snapshots SET crawled_day = (crawled_at)::date WHERE crawled_day IS NULL",
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS crawl_snapshots_client_idx
           ON crawl_snapshots (client_id, crawled_at DESC)`,
      );
      // One snapshot per client per day, enforced by the DB so concurrent
      // uploads can't duplicate a day (the upsert below relies on this).
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS crawl_snapshots_client_day_uidx
           ON crawl_snapshots (client_id, crawled_day)`,
      );
      return true;
    })().catch((err) => {
      ready = null;
      console.error(
        "crawl_snapshots init failed (crawl history unavailable):",
        err instanceof Error ? err.message : String(err),
      );
      return false;
    });
  }
  return ready;
}

/**
 * Record a crawl snapshot for a client. Re-uploading a crawl for the same
 * calendar day replaces that day's snapshot via an atomic upsert (a corrected
 * re-upload shouldn't create a duplicate, and the DB unique constraint means
 * concurrent uploads can't race a duplicate in either). Best-effort; never
 * throws.
 */
export async function recordSnapshot(
  clientId: number,
  crawledAt: Date,
  stats: CrawlStats,
): Promise<void> {
  if (!(await ensureTable())) return;
  try {
    await pool.query(
      `INSERT INTO crawl_snapshots (client_id, crawled_at, crawled_day, stats)
         VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (client_id, crawled_day)
         DO UPDATE SET crawled_at = EXCLUDED.crawled_at, stats = EXCLUDED.stats`,
      [clientId, crawledAt, dayOf(crawledAt), JSON.stringify(stats)],
    );
  } catch (err) {
    console.error(
      "Kon crawl-snapshot niet bewaren:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/** List a client's crawl snapshots, newest first. Returns [] on any failure. */
export async function listSnapshots(
  clientId: number,
): Promise<CrawlSnapshot[]> {
  if (!(await ensureTable())) return [];
  try {
    const res = await pool.query(
      "SELECT id, client_id, crawled_at, stats FROM crawl_snapshots WHERE client_id = $1 ORDER BY crawled_at DESC, id DESC",
      [clientId],
    );
    return res.rows.map((r: Record<string, unknown>) => ({
      id: Number(r.id),
      clientId: Number(r.client_id),
      crawledAt: r.crawled_at instanceof Date ? r.crawled_at : new Date(String(r.crawled_at)),
      stats: r.stats as CrawlStats,
    }));
  } catch (err) {
    console.error(
      "Kon crawl-snapshots niet laden:",
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}
