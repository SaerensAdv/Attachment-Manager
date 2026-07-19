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

  // New command-bar runs opt into the graph only when a real client was selected.
  // The selected title is persisted as client_name, so the trigger resolves it
  // against the reviewed visible portfolio at insert time.
  await pool.query(`
    CREATE OR REPLACE FUNCTION link_new_generation_to_graph_client()
    RETURNS trigger AS $$
    DECLARE matched_client_id integer;
    BEGIN
      IF NEW.client_path IS NULL OR btrim(NEW.client_path) = '' THEN
        NEW.graph_client_id := NULL;
        NEW.graph_visible := false;
        RETURN NEW;
      END IF;
      SELECT c.id INTO matched_client_id
        FROM clients c
       WHERE COALESCE(c.portfolio_visible, true)=true
         AND lower(btrim(c.name))=lower(btrim(NEW.client_name))
       ORDER BY c.id
       LIMIT 1;
      NEW.graph_client_id := matched_client_id;
      NEW.graph_visible := matched_client_id IS NOT NULL;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    DROP TRIGGER IF EXISTS generations_graph_client_link ON generations;
    CREATE TRIGGER generations_graph_client_link
      BEFORE INSERT ON generations
      FOR EACH ROW EXECUTE FUNCTION link_new_generation_to_graph_client();
  `);
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
