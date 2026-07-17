import { pool } from "@workspace/db";
import { logger } from "./logger";
import { listClickUpCompanies, type ClickUpCompany } from "./clickup";

export const CLICKUP_OWNED_CLIENT_FIELDS = ["name", "website", "currentState"] as const;
export const REPLIT_OWNED_CLIENT_FIELDS = [
  "googleAdsCustomerId", "searchConsoleSiteUrl", "bingSiteUrl", "ga4PropertyId",
  "placesQuery", "placesCompetitors", "pagespeedUrls", "businessProfileLocationId",
  "competitorAdvertisers", "landingPages", "reportEmail", "brandTerms",
  "billingName", "billingAddress", "billingCountry", "vatNumber", "btwMode",
] as const;

export interface CompanyMasterSyncStatus {
  status: "never" | "running" | "succeeded" | "partial" | "failed";
  startedAt: string | null;
  finishedAt: string | null;
  companyCount: number;
  cacheUpserts: number;
  linkedClientUpdates: number;
  missingLinkedCompanies: number;
  lastErrorCode: string | null;
}

let ready: Promise<boolean> | null = null;
let running = false;

async function ensureTables(): Promise<boolean> {
  if (!ready) {
    ready = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS clickup_companies (
        clickup_task_id text PRIMARY KEY, name text NOT NULL, website text,
        status text, last_seen_at timestamptz NOT NULL, synced_at timestamptz NOT NULL)`);
      await pool.query(`CREATE TABLE IF NOT EXISTS clickup_company_sync_state (
        id integer PRIMARY KEY CHECK (id = 1), status text NOT NULL DEFAULT 'never',
        started_at timestamptz, finished_at timestamptz, company_count integer NOT NULL DEFAULT 0,
        cache_upserts integer NOT NULL DEFAULT 0, linked_client_updates integer NOT NULL DEFAULT 0,
        missing_linked_companies integer NOT NULL DEFAULT 0, last_error_code text,
        updated_at timestamptz NOT NULL DEFAULT now())`);
      await pool.query(`INSERT INTO clickup_company_sync_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
      return true;
    })().catch((err) => {
      ready = null;
      logger.error({ scope: "clickup:companies", err: err instanceof Error ? err.message : String(err) }, "company mirror init failed");
      return false;
    });
  }
  return ready;
}

function iso(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapStatus(row: Record<string, unknown> | undefined): CompanyMasterSyncStatus {
  if (!row) return { status: "never", startedAt: null, finishedAt: null, companyCount: 0, cacheUpserts: 0, linkedClientUpdates: 0, missingLinkedCompanies: 0, lastErrorCode: null };
  return {
    status: String(row.status) as CompanyMasterSyncStatus["status"],
    startedAt: iso(row.started_at), finishedAt: iso(row.finished_at),
    companyCount: Number(row.company_count ?? 0), cacheUpserts: Number(row.cache_upserts ?? 0),
    linkedClientUpdates: Number(row.linked_client_updates ?? 0),
    missingLinkedCompanies: Number(row.missing_linked_companies ?? 0),
    lastErrorCode: row.last_error_code == null ? null : String(row.last_error_code),
  };
}

export async function getCompanyMasterSyncStatus(): Promise<CompanyMasterSyncStatus> {
  if (!(await ensureTables())) return mapStatus(undefined);
  const result = await pool.query(`SELECT * FROM clickup_company_sync_state WHERE id = 1`);
  const status = mapStatus(result.rows[0]);
  return running ? { ...status, status: "running" } : status;
}

export async function listCompanyMirror() {
  if (!(await ensureTables())) return [];
  const result = await pool.query(`SELECT * FROM clickup_companies ORDER BY name ASC`);
  return result.rows.map((row) => ({
    clickupTaskId: String(row.clickup_task_id), name: String(row.name),
    website: row.website == null ? null : String(row.website),
    status: row.status == null ? null : String(row.status),
    lastSeenAt: iso(row.last_seen_at), syncedAt: iso(row.synced_at),
  }));
}

async function upsertCompany(client: { query: typeof pool.query }, company: ClickUpCompany, at: Date): Promise<void> {
  await client.query(
    `INSERT INTO clickup_companies (clickup_task_id, name, website, status, last_seen_at, synced_at)
     VALUES ($1,$2,$3,$4,$5,$5)
     ON CONFLICT (clickup_task_id) DO UPDATE SET
       name=EXCLUDED.name, website=EXCLUDED.website, status=EXCLUDED.status,
       last_seen_at=EXCLUDED.last_seen_at, synced_at=EXCLUDED.synced_at`,
    [company.id, company.name, company.website, company.status, at],
  );
}

export async function syncCompanyMaster(): Promise<CompanyMasterSyncStatus> {
  if (!(await ensureTables())) throw new Error("COMPANY_SYNC_STORE_UNAVAILABLE");
  if (running) throw Object.assign(new Error("COMPANY_SYNC_ALREADY_RUNNING"), { code: "ALREADY_RUNNING" });
  running = true;
  const startedAt = new Date();
  await pool.query(`UPDATE clickup_company_sync_state SET status='running', started_at=$1, finished_at=NULL, last_error_code=NULL, updated_at=now() WHERE id=1`, [startedAt]);
  try {
    const companies = await listClickUpCompanies();
    const byId = new Map(companies.map((company) => [company.id, company]));
    const db = await pool.connect();
    let linkedClientUpdates = 0;
    let missingLinkedCompanies = 0;
    try {
      await db.query("BEGIN");
      for (const company of companies) await upsertCompany(db, company, startedAt);
      const linked = await db.query(`SELECT id, clickup_company_id FROM clients WHERE clickup_company_id IS NOT NULL AND clickup_company_id <> ''`);
      for (const row of linked.rows) {
        const company = byId.get(String(row.clickup_company_id));
        if (!company) { missingLinkedCompanies += 1; continue; }
        const updated = await db.query(
          `UPDATE clients SET name=$2, website=$3, current_state=$4, updated_at=now()
           WHERE id=$1 AND (name IS DISTINCT FROM $2 OR website IS DISTINCT FROM $3 OR current_state IS DISTINCT FROM $4)`,
          [row.id, company.name, company.website, company.status],
        );
        linkedClientUpdates += updated.rowCount ?? 0;
      }
      await db.query("COMMIT");
    } catch (err) {
      await db.query("ROLLBACK").catch(() => {});
      throw err;
    } finally { db.release(); }
    const finalStatus = missingLinkedCompanies > 0 ? "partial" : "succeeded";
    const finishedAt = new Date();
    const result = await pool.query(
      `UPDATE clickup_company_sync_state SET status=$1, finished_at=$2, company_count=$3,
       cache_upserts=$3, linked_client_updates=$4, missing_linked_companies=$5,
       last_error_code=NULL, updated_at=now() WHERE id=1 RETURNING *`,
      [finalStatus, finishedAt, companies.length, linkedClientUpdates, missingLinkedCompanies],
    );
    return mapStatus(result.rows[0]);
  } catch (err) {
    const code = err instanceof Error ? err.name || "COMPANY_SYNC_FAILED" : "COMPANY_SYNC_FAILED";
    await pool.query(`UPDATE clickup_company_sync_state SET status='failed', finished_at=now(), last_error_code=$1, updated_at=now() WHERE id=1`, [code.slice(0, 120)]).catch(() => {});
    throw err;
  } finally { running = false; }
}

export function clientFieldOwnership(linked: boolean) {
  return {
    clickupOwned: linked ? [...CLICKUP_OWNED_CLIENT_FIELDS] : [],
    replitOwned: [...REPLIT_OWNED_CLIENT_FIELDS],
    derived: ["websiteIntake", "googleAdsLive", "searchConsoleLive", "bingLive", "ga4Live", "placesLive", "pagespeedLive", "businessProfileLive", "crawlLive", "competitorAdsLive"],
  };
}
