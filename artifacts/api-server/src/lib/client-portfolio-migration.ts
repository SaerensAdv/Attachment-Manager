import { pool } from "@workspace/db";
import { logger } from "./logger";

const VERSION = "2026-07-19-company-profile-portfolio-v1";
const COMPANIES = [
  { name: "Icon BV", clickupCompanyId: "86carekxv", profiles: ["Beauty Icon"] },
  { name: "LCS BV", clickupCompanyId: "86carekxu", profiles: ["Waterlek", "Fuitedetect", "Noodpakket België", "Kit d'Urgence Belgique", "Sanidetect", "Slotenmakerij Louis", "Loodgieterij Louis"] },
  { name: "Schoonpannendak BV", clickupCompanyId: "86carekxx", profiles: ["Schoonpannendak", "Schoondak"] },
  { name: "MMA Distributie BV", clickupCompanyId: "86carekxw", profiles: ["Goedkoopdrank"] },
  { name: "Finson BV", clickupCompanyId: "86careky0", profiles: ["Elektrische Boilers"] },
] as const;

/**
 * One-time, fail-closed reconciliation of the old flat Replit client cache into
 * Company -> technical profile records. Existing technical fields stay on rows
 * that are renamed; omitted legacy rows are hidden, never deleted.
 */
export async function reconcileCanonicalClientPortfolio(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS client_portfolio_migrations (
    version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS portfolio_visible boolean NOT NULL DEFAULT true`);
  await pool.query(`ALTER TABLE client_groups ADD COLUMN IF NOT EXISTS clickup_company_id text`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS client_groups_clickup_company_id_uidx
    ON client_groups (clickup_company_id)
    WHERE clickup_company_id IS NOT NULL AND clickup_company_id <> ''`);

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query(`SELECT pg_advisory_xact_lock(hashtext('client_portfolio_migration'))`);
    const done = await db.query(`SELECT 1 FROM client_portfolio_migrations WHERE version = $1`, [VERSION]);
    if (done.rowCount) { await db.query("COMMIT"); return; }

    // Preserve the rich technical configuration already stored on these rows.
    await db.query(`UPDATE clients SET name='Beauty Icon', updated_at=now() WHERE id=7 AND lower(name)=lower('Icon BV')`);
    await db.query(`UPDATE clients SET name='Goedkoopdrank', updated_at=now() WHERE id=6 AND lower(name) IN (lower('MMA Distributie'), lower('MMA Distributie BV'))`);
    await db.query(`UPDATE clients SET name='Schoonpannendak', updated_at=now() WHERE id=5 AND lower(name)=lower('Schoonpannendak BV')`);

    // Exact reviewed portfolio only. Hidden rows remain recoverable in Postgres.
    await db.query(`UPDATE clients SET portfolio_visible=false, updated_at=now()`);

    for (const company of COMPANIES) {
      await db.query(
        `UPDATE client_groups SET clickup_company_id=$2, updated_at=now() WHERE lower(name)=lower($1)`,
        [company.name, company.clickupCompanyId],
      );
      await db.query(
        `INSERT INTO client_groups (name, notes, clickup_company_id, created_at, updated_at)
         SELECT $1, 'Canonical Company container for technical profiles.', $2, now(), now()
         WHERE NOT EXISTS (SELECT 1 FROM client_groups WHERE lower(name)=lower($1))`,
        [company.name, company.clickupCompanyId],
      );
      const group = await db.query(`SELECT id FROM client_groups WHERE lower(name)=lower($1) ORDER BY id LIMIT 1`, [company.name]);
      const groupId = Number(group.rows[0]?.id);
      if (!Number.isInteger(groupId)) throw new Error(`Missing client group after upsert: ${company.name}`);

      for (const profile of company.profiles) {
        await db.query(
          `INSERT INTO clients (name, group_id, portfolio_visible, created_at, updated_at)
           SELECT $1, $2, true, now(), now()
           WHERE NOT EXISTS (SELECT 1 FROM clients WHERE lower(name)=lower($1))`,
          [profile, groupId],
        );
        await db.query(
          `UPDATE clients SET group_id=$2, clickup_company_id=NULL, portfolio_visible=true, updated_at=now()
           WHERE lower(name)=lower($1)`,
          [profile, groupId],
        );
      }
    }

    await db.query(`INSERT INTO client_portfolio_migrations (version) VALUES ($1)`, [VERSION]);
    await db.query("COMMIT");
    logger.info({ scope: "clients:portfolio", version: VERSION, companies: COMPANIES.length, profiles: COMPANIES.reduce((sum, company) => sum + company.profiles.length, 0) }, "canonical client portfolio reconciled");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}
