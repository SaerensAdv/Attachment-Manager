import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "../logger";
import type { Graph } from "./types";

/**
 * Persistence + atomic activation for the normalized Workspace Graph (Fase 3.5 G3).
 *
 * Exactly one snapshot is `active` at a time. A sync:
 *   1. `beginSync()`  — takes the in-process lock and inserts a `building` row.
 *   2. (caller crawls the sources + `buildGraph`, which may be slow / fail)
 *   3a. `completeSync()` — hashes the payload; if it equals the current active
 *       snapshot the building row is discarded and the active row's freshness is
 *       bumped (a no-op flip); otherwise the building row is filled and, in ONE
 *       ordered transaction, flipped to `active` while the old active becomes
 *       `superseded`.
 *   3b. `failSync()`   — marks the building row `failed`; the current active is
 *       left completely untouched, so a partial/broken crawl never reaches the UI.
 *
 * The table is declared in the Drizzle schema (`graph_snapshots`) for typed
 * access but CREATED here via `CREATE TABLE IF NOT EXISTS` — this project never
 * runs drizzle-kit push. The active snapshot is cached in memory so the read
 * routes never hit the DB on the hot path.
 */

export interface SnapshotMeta {
  id: number;
  status: string;
  nodeCount: number;
  edgeCount: number;
  contentHash: string | null;
  error: string | null;
  sourceUpdatedAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

let ready: Promise<boolean> | null = null;

async function ensureTable(): Promise<boolean> {
  if (!ready) {
    ready = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS graph_snapshots (
           id serial PRIMARY KEY,
           status text NOT NULL DEFAULT 'building',
           payload jsonb,
           node_count integer NOT NULL DEFAULT 0,
           edge_count integer NOT NULL DEFAULT 0,
           content_hash text,
           error text,
           source_updated_at timestamptz,
           last_synced_at timestamptz,
           created_at timestamptz NOT NULL DEFAULT now(),
           updated_at timestamptz NOT NULL DEFAULT now()
         )`,
      );
      // At most one active snapshot, enforced in the DB (not just app code).
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS graph_snapshots_active_uidx
           ON graph_snapshots ((status)) WHERE status = 'active'`,
      );
      return true;
    })().catch((err) => {
      ready = null;
      logger.error(
        { scope: "graph:snapshot", err: err instanceof Error ? err.message : String(err) },
        "graph_snapshots init failed (workspace graph unavailable)",
      );
      return false;
    });
  }
  return ready;
}

/** Public warm-up. */
export async function ensureGraphSnapshotsTable(): Promise<boolean> {
  return ensureTable();
}

// ---- Stable content hash ---------------------------------------------------

/** Deterministic JSON with recursively sorted object keys (order-independent). */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = canonical((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

/**
 * A stable hash of the graph, independent of node/edge array ordering (both are
 * sorted by id first). Two structurally-identical graphs hash equal, so a sync
 * that changes nothing is a cheap no-op flip.
 */
export function hashGraph(graph: Graph): string {
  const nodes = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...graph.edges].sort((a, b) => a.id.localeCompare(b.id));
  const json = JSON.stringify(canonical({ nodes, edges }));
  return createHash("sha256").update(json).digest("hex");
}

// ---- In-memory active index ------------------------------------------------

let activeIndex: { meta: SnapshotMeta; graph: Graph } | null = null;
let syncing = false;

function iso(v: unknown): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}

function mapMeta(r: Record<string, unknown>): SnapshotMeta {
  return {
    id: Number(r.id),
    status: String(r.status),
    nodeCount: Number(r.node_count ?? 0),
    edgeCount: Number(r.edge_count ?? 0),
    contentHash: r.content_hash == null ? null : String(r.content_hash),
    error: r.error == null ? null : String(r.error),
    sourceUpdatedAt: iso(r.source_updated_at),
    lastSyncedAt: iso(r.last_synced_at),
    createdAt: iso(r.created_at) ?? new Date(0).toISOString(),
    updatedAt: iso(r.updated_at) ?? new Date(0).toISOString(),
  };
}

/** True while a sync holds the lock (drives the live sync-status UI). */
export function isSyncing(): boolean {
  return syncing;
}

/** The cached active graph + meta, or null when none has been loaded/built. */
export function getActiveGraph(): { meta: SnapshotMeta; graph: Graph } | null {
  return activeIndex;
}

/** Load the current active snapshot from the DB into memory (boot / cache miss). */
export async function loadActiveIntoMemory(): Promise<
  { meta: SnapshotMeta; graph: Graph } | null
> {
  if (!(await ensureTable())) return null;
  try {
    const res = await pool.query(
      `SELECT * FROM graph_snapshots WHERE status = 'active' LIMIT 1`,
    );
    const row = res.rows[0];
    if (!row) {
      activeIndex = null;
      return null;
    }
    const graph = (row.payload as Graph | null) ?? { nodes: [], edges: [] };
    activeIndex = { meta: mapMeta(row), graph };
    return activeIndex;
  } catch (err) {
    logger.error(
      { scope: "graph:snapshot", err: err instanceof Error ? err.message : String(err) },
      "loadActiveIntoMemory failed",
    );
    return null;
  }
}

// ---- Sync lifecycle --------------------------------------------------------

/**
 * Take the in-process sync lock and open a `building` row. Returns its id, or
 * `null` when a sync is already running (caller must NOT proceed — no duplicate).
 */
export async function beginSync(): Promise<number | null> {
  if (!(await ensureTable())) return null;
  if (syncing) return null;
  syncing = true;
  try {
    const res = await pool.query(
      `INSERT INTO graph_snapshots (status) VALUES ('building') RETURNING id`,
    );
    return Number(res.rows[0].id);
  } catch (err) {
    syncing = false;
    logger.error(
      { scope: "graph:snapshot", err: err instanceof Error ? err.message : String(err) },
      "beginSync failed",
    );
    return null;
  }
}

/**
 * Complete a sync: either a no-op flip (payload identical to the active
 * snapshot) or an atomic promotion of the building row to `active`. Always
 * releases the lock. Returns whether the active graph actually changed.
 */
export async function completeSync(
  buildingId: number,
  graph: Graph,
  opts: { sourceUpdatedAt?: Date | null } = {},
): Promise<{ changed: boolean; meta: SnapshotMeta | null }> {
  try {
    const hash = hashGraph(graph);
    const active = await pool.query(
      `SELECT * FROM graph_snapshots WHERE status = 'active' LIMIT 1`,
    );
    const current = active.rows[0] ? mapMeta(active.rows[0]) : null;

    if (current && current.contentHash === hash) {
      // Nothing changed — discard the building row, refresh active freshness.
      await pool.query(
        `UPDATE graph_snapshots SET status = 'superseded', updated_at = now() WHERE id = $1`,
        [buildingId],
      );
      const bumped = await pool.query(
        `UPDATE graph_snapshots
            SET last_synced_at = now(), source_updated_at = $2, updated_at = now()
          WHERE id = $1
        RETURNING *`,
        [current.id, opts.sourceUpdatedAt ?? null],
      );
      if (bumped.rows[0] && activeIndex) {
        activeIndex.meta = mapMeta(bumped.rows[0]);
      }
      return { changed: false, meta: bumped.rows[0] ? mapMeta(bumped.rows[0]) : current };
    }

    // Fill the building row, then atomically flip it to active (old -> superseded)
    // in ONE data-modifying-CTE statement so the read side never sees a gap.
    await pool.query(
      `UPDATE graph_snapshots
          SET payload = $2::jsonb, node_count = $3, edge_count = $4,
              content_hash = $5, source_updated_at = $6, error = NULL,
              updated_at = now()
        WHERE id = $1`,
      [
        buildingId,
        JSON.stringify(graph),
        graph.nodes.length,
        graph.edges.length,
        hash,
        opts.sourceUpdatedAt ?? null,
      ],
    );
    // Flip building -> active while the old active becomes superseded. This MUST
    // be two ordered statements in ONE transaction, not a single data-modifying
    // CTE: Postgres runs CTE sub-statements against one table snapshot with
    // unpredictable ordering, so the partial unique index (WHERE status =
    // 'active') can transiently see two active rows and throw a duplicate-key
    // error. Superseding the old row FIRST removes it from that index before the
    // new row claims 'active'; the transaction keeps the swap atomic so a
    // concurrent read never sees a gap.
    const client = await pool.connect();
    let swapped;
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE graph_snapshots SET status = 'superseded', updated_at = now()
          WHERE status = 'active' AND id <> $1`,
        [buildingId],
      );
      swapped = await client.query(
        `UPDATE graph_snapshots
            SET status = 'active', last_synced_at = now(), updated_at = now()
          WHERE id = $1
        RETURNING *`,
        [buildingId],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    const meta = swapped.rows[0] ? mapMeta(swapped.rows[0]) : null;
    if (meta) activeIndex = { meta, graph };
    return { changed: true, meta };
  } catch (err) {
    logger.error(
      { scope: "graph:snapshot", err: err instanceof Error ? err.message : String(err) },
      "completeSync failed — leaving prior active snapshot in place",
    );
    // Best-effort: demote the building row so it can't linger as a false active.
    await pool
      .query(
        `UPDATE graph_snapshots SET status = 'failed', updated_at = now() WHERE id = $1 AND status = 'building'`,
        [buildingId],
      )
      .catch(() => {});
    return { changed: false, meta: null };
  } finally {
    syncing = false;
  }
}

/**
 * Abandon a sync: mark the building row `failed` (short, non-sensitive reason)
 * and release the lock. The current active snapshot is NOT touched.
 */
export async function failSync(buildingId: number, error: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE graph_snapshots SET status = 'failed', error = $2, updated_at = now()
        WHERE id = $1 AND status = 'building'`,
      [buildingId, error.slice(0, 300)],
    );
  } catch (err) {
    logger.error(
      { scope: "graph:snapshot", err: err instanceof Error ? err.message : String(err) },
      "failSync failed",
    );
  } finally {
    syncing = false;
  }
}
