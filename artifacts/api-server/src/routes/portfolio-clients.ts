import { Router, type IRouter } from "express";
import { db, clientsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { serialize } from "./clients-shared";

const router: IRouter = Router();

// Mounted before the legacy clients router so the primary Clients screen reads
// the reviewed portfolio only. Hidden rows remain available in Postgres for
// rollback and are deliberately not deleted by the migration.
router.get("/clients", async (_req, res) => {
  const rows = await db
    .select()
    .from(clientsTable)
    .where(sql`COALESCE(portfolio_visible, true) = true`)
    .orderBy(clientsTable.name);
  res.json({ clients: rows.map(serialize) });
});

export default router;
