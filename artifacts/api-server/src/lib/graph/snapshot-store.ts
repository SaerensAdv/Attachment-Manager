import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "../logger";
import type { Graph } from "./types";

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

export async function ensureGraphSnapshotsTable(): Promise<boolean> {
  return ensureTable();
}

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

export function hashGraph(graph: Graph): string {
  const nodes = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...graph.edges].sort((a, b) => a.id.localeCompare(b.id));
  return createHash("sha256")
    .update(JSON.stringify(canonical({ nodes, edges })))
    .digest("hex");
}

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

export function isSyncing(): boolean {
  return syncing;
}

export function getActiveGraph(): { meta: SnapshotMeta; graph: Graph } | null {
  return activeIndex;
}

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
 * Persist and activate a completed graph. Promotion is fail-closed: callers only
 * receive success after the new row was returned as active and the in-memory
 * index was replaced. Any missing row or database error rejects the sync so the
 * route cannot report a false success while serving the previous snapshot.
 */
export async function completeSync(
  buildingId: number,
  graph: Graph,
  opts: { sourceUpdatedAt?: Date | null } = {},
): Promise<{ changed: boolean; meta: SnapshotMeta }> {
  try {
    const hash = hashGraph(graph);
    const active = await pool.query(
      `SELECT * FROM graph_snapshots WHERE status = 'active' LIMIT 1`,
    );
    const currentRow = active.rows[0] as Record<string, unknown> | undefined;
    const current = currentRow ? mapMeta(currentRow) : null;

    if (current && current.contentHash === hash) {
      await pool.query(
        `UPDATE graph_snapshots SET status = 'superseded', updated_at = now()
          WHERE id = $1 AND status = 'building'`,
        [buildingId],
      );
      const bumped = await pool.query(
        `UPDATE graph_snapshots
            SET last_synced_at = now(), source_updated_at = $2, updated_at = now()
          WHERE id = $1 AND status = 'active'
        RETURNING *`,
        [current.id, opts.sourceUpdatedAt ?? null],
      );
      const bumpedRow = bumped.rows[0] as Record<string, unknown> | undefined;
      if (!bumpedRow) throw new Error("active snapshot freshness update returned no row");
      const meta = mapMeta(bumpedRow);
      activeIndex = { meta, graph };
      return { changed: false, meta };
    }

    const staged = await pool.query(
      `UPDATE graph_snapshots
          SET payload = $2::jsonb, node_count = $3, edge_count = $4,
              content_hash = $5, source_updated_at = $6, error = NULL,
              updated_at = now()
        WHERE id = $1 AND status = 'building'
      RETURNING id`,
      [
        buildingId,
        JSON.stringify(graph),
        graph.nodes.length,
        graph.edges.length,
        hash,
        opts.sourceUpdatedAt ?? null,
      ],
    );
    if (!staged.rows[0]) throw new Error("building snapshot was missing before promotion");

    const client = await pool.connect();
    let promotedRow: Record<string, unknown> | undefined;
    try {
      await client.query("BEGIN");
      // Serialize graph promotions across app instances. The in-process lock only
      // protects one Node process; this transaction lock protects the database.
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('graph_snapshots_promotion'))`);
      await client.query(
        `UPDATE graph_snapshots SET status = 'superseded', updated_at = now()
          WHERE status = 'active' AND id <> $1`,
        [buildingId],
      );
      const promoted = await client.query(
        `UPDATE graph_snapshots
            SET status = 'active', last_synced_at = now(), updated_at = now()
          WHERE id = $1 AND status = 'building'
        RETURNING *`,
        [buildingId],
      );
      promotedRow = promoted.rows[0] as Record<string, unknown> | undefined;
      if (!promotedRow) throw new Error("snapshot promotion returned no active row");
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    const meta = mapMeta(promotedRow);
    if (meta.status !== "active" || meta.contentHash !== hash) {
      throw new Error("promoted snapshot failed post-commit verification");
    }
    activeIndex = { meta, graph };
    return { changed: true, meta };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { scope: "graph:snapshot", buildingId, err: message },
      "completeSync failed; prior active snapshot retained",
    );
    await pool
      .query(
        `UPDATE graph_snapshots SET status = 'failed', error = $2, updated_at = now()
          WHERE id = $1 AND status = 'building'`,
        [buildingId, message.slice(0, 300)],
      )
      .catch(() => {});
    throw new Error(`snapshot promotion failed: ${message}`);
  } finally {
    syncing = false;
  }
}

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
