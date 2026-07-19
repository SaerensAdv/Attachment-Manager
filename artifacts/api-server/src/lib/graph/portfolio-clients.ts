import { pool } from "@workspace/db";
import type { GraphClientInput } from "./build";

export async function listPortfolioGraphClients(): Promise<Array<GraphClientInput & { updatedAt: string | null }>> {
  const result = await pool.query(`
    SELECT c.id, c.name, c.updated_at, g.name AS company_name,
           g.clickup_company_id
      FROM clients c
      JOIN client_groups g ON g.id = c.group_id
     WHERE COALESCE(c.portfolio_visible, true) = true
     ORDER BY g.name, c.name
  `);
  return result.rows.map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    name: String(row.name),
    companyName: String(row.company_name),
    clickupCompanyId: row.clickup_company_id == null ? null : String(row.clickup_company_id),
    updatedAt: row.updated_at == null ? null : new Date(String(row.updated_at)).toISOString(),
  }));
}
