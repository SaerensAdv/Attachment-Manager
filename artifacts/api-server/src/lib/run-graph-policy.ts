import { pool } from "@workspace/db";
import { logger } from "./logger";

const POLICY_VERSION = "2026-07-19-client-linked-run-nodes-v1";

export async function ensureRunGraphPolicy(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS run_graph_policy_migrations (
    version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`ALTER TABLE generations ADD COLUMN IF NOT EXISTS graph_client_id integer`);
  await pool.query(`ALTER TABLE generations ADD COLUMN IF NOT EXISTS graph_visible boolean NOT NULL DEFAULT false`);
  await pool.query(`CREATE INDEX IF NOT EXISTS generations_graph_visible_idx
    ON generations (created_at DESC) WHERE graph_visible = true AND graph_client_id IS NOT NULL`);

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query(`SELECT pg_advisory_xact_lock(hashtext('run_graph_policy_migration'))`);
    const done = await db.query(`SELECT 1 FROM run_graph_policy_migrations WHERE version=$1`, [POLICY_VERSION]);
    if (!done.rowCount) {
      // Everything before this policy is audit archive only. Nothing is deleted.
      await db.query(`UPDATE generations SET graph_visible=false, graph_client_id=NULL`);
      await db.query(`INSERT INTO run_graph_policy_migrations (version) VALUES ($1)`, [POLICY_VERSION]);
      logger.info({ scope: "runs:graph-policy", version: POLICY_VERSION }, "historical RUN nodes archived from graph");
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}

function normalized(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Automatically expose a newly saved run only when the command bar selected a client. */
export async function autoLinkRunToClient(runId: number, clientPath: string, clientName: string): Promise<number | null> {
  if (!clientPath.trim()) return null;
  await ensureRunGraphPolicy();
  const result = await pool.query(`
    SELECT c.id, c.name
      FROM clients c
     WHERE COALESCE(c.portfolio_visible, true)=true
     ORDER BY c.id
  `);
  const wanted = normalized(clientName);
  const exact = result.rows.filter((row) => normalized(String(row.name)) === wanted);
  if (exact.length !== 1) {
    logger.warn({ scope: "runs:graph-policy", runId, clientPath, clientName, matches: exact.length }, "selected client could not be mapped uniquely; RUN remains archive-only");
    return null;
  }
  const clientId = Number(exact[0].id);
  await pool.query(`UPDATE generations SET graph_client_id=$2, graph_visible=true WHERE id=$1`, [runId, clientId]);
  return clientId;
}

export async function setRunGraphClient(runId: number, clientId: number | null): Promise<boolean> {
  await ensureRunGraphPolicy();
  if (clientId === null) {
    const result = await pool.query(`UPDATE generations SET graph_client_id=NULL, graph_visible=false WHERE id=$1 RETURNING id`, [runId]);
    return Boolean(result.rowCount);
  }
  const result = await pool.query(`
    UPDATE generations g
       SET graph_client_id=c.id, graph_visible=true
      FROM clients c
     WHERE g.id=$1 AND c.id=$2 AND COALESCE(c.portfolio_visible, true)=true
    RETURNING g.id
  `, [runId, clientId]);
  return Boolean(result.rowCount);
}
