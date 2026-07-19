import { pool } from "@workspace/db";
import type { GraphRunInput } from "./build";

export async function listClientLinkedGraphRuns(): Promise<GraphRunInput[]> {
  const result = await pool.query(`
    SELECT g.id, g.workflow_title, g.status, g.created_at, g.graph_client_id
      FROM generations g
      JOIN clients c ON c.id=g.graph_client_id
     WHERE g.graph_visible=true
       AND g.graph_client_id IS NOT NULL
       AND COALESCE(c.portfolio_visible, true)=true
     ORDER BY g.created_at DESC
     LIMIT 100
  `);
  return result.rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    label: String(row.workflow_title || `Generation ${row.id}`),
    status: String(row.status),
    updatedAt: new Date(String(row.created_at)).toISOString(),
    clientId: Number(row.graph_client_id),
  }));
}
