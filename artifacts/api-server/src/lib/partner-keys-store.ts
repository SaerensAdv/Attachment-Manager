import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, pool, partnerKeysTable, type PartnerKey } from "@workspace/db";

/**
 * Store for the long-lived partner API keys that authenticate spun-off Replit
 * projects on the versioned partner API. The `partner_keys` table lives in the
 * drizzle schema (for types + queries) but, like the other derived stores, is
 * self-bootstrapped here via an idempotent `CREATE TABLE IF NOT EXISTS` so it
 * exists at runtime without a drizzle-kit push (which would try to drop the
 * unmanaged tables it doesn't know about).
 *
 * Only the SHA-256 hash of a key is ever stored; the plaintext is returned once
 * at issue time and cannot be recovered afterwards. Verification hashes the
 * presented key and looks up an active row by that hash.
 */

/** The scopes a partner key can hold. */
export const PARTNER_SCOPES = ["read", "write", "trigger"] as const;
export type PartnerScope = (typeof PARTNER_SCOPES)[number];

/** Prefix that makes an issued key recognisable as a Saerens partner key. */
const KEY_PREFIX = "sap_";
/** Number of leading characters kept (non-secret) to recognise a key later. */
const RECOGNISE_LEN = 12;

let ready: Promise<boolean> | null = null;

/**
 * Ensure the partner_keys table exists. Memoized; retries on failure. Additive
 * only — never drops or rewrites, so it is safe to run on every store call.
 */
async function ensureTable(): Promise<boolean> {
  if (!ready) {
    ready = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS partner_keys (
           id serial PRIMARY KEY,
           name text NOT NULL,
           key_hash text NOT NULL UNIQUE,
           key_prefix text NOT NULL,
           scopes text NOT NULL DEFAULT 'read,write,trigger',
           active boolean NOT NULL DEFAULT true,
           created_at timestamptz NOT NULL DEFAULT now(),
           last_used_at timestamptz,
           revoked_at timestamptz
         )`,
      );
      return true;
    })().catch((err) => {
      ready = null;
      console.error(
        "partner_keys init failed (partner API unavailable):",
        err instanceof Error ? err.message : String(err),
      );
      return false;
    });
  }
  return ready;
}

/** SHA-256 hex digest of a plaintext key. */
function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

/** Normalize + validate a requested scope list, defaulting to the full set. */
export function normalizeScopes(raw: unknown): PartnerScope[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(",")
      : [];
  const cleaned = list
    .map((s) => String(s).trim().toLowerCase())
    .filter((s): s is PartnerScope =>
      (PARTNER_SCOPES as readonly string[]).includes(s),
    );
  const unique = Array.from(new Set(cleaned));
  return unique.length > 0 ? unique : [...PARTNER_SCOPES];
}

/** Parse a stored comma-separated scopes string into a validated scope list. */
export function parseScopes(stored: string): PartnerScope[] {
  return normalizeScopes(stored);
}

export interface IssuedPartnerKey {
  id: number;
  name: string;
  prefix: string;
  scopes: PartnerScope[];
  /** The plaintext key — shown once, never stored. */
  key: string;
}

/**
 * Issue a new partner key. Generates a random secret, stores only its hash, and
 * returns the plaintext exactly once. Throws if the table can't be bootstrapped.
 */
export async function issuePartnerKey(
  name: string,
  scopes?: unknown,
): Promise<IssuedPartnerKey> {
  if (!(await ensureTable())) {
    throw new Error("partner_keys tabel is niet beschikbaar.");
  }
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Een naam voor de partner-sleutel is verplicht.");

  const secret = KEY_PREFIX + randomBytes(32).toString("hex");
  const scopeList = normalizeScopes(scopes);
  const [row] = await db
    .insert(partnerKeysTable)
    .values({
      name: trimmed,
      keyHash: hashKey(secret),
      keyPrefix: secret.slice(0, RECOGNISE_LEN),
      scopes: scopeList.join(","),
    })
    .returning();

  return {
    id: row.id,
    name: row.name,
    prefix: row.keyPrefix,
    scopes: scopeList,
    key: secret,
  };
}

/** Revoke a key by id (idempotent). Returns true if a row was deactivated. */
export async function revokePartnerKey(id: number): Promise<boolean> {
  if (!(await ensureTable())) return false;
  const [row] = await db
    .update(partnerKeysTable)
    .set({ active: false, revokedAt: new Date() })
    .where(and(eq(partnerKeysTable.id, id), eq(partnerKeysTable.active, true)))
    .returning();
  return !!row;
}

export interface PartnerKeyListItem {
  id: number;
  name: string;
  prefix: string;
  scopes: PartnerScope[];
  active: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

/** List all keys (metadata only — never the secret or its hash). */
export async function listPartnerKeys(): Promise<PartnerKeyListItem[]> {
  if (!(await ensureTable())) return [];
  const rows = await db
    .select()
    .from(partnerKeysTable)
    .orderBy(desc(partnerKeysTable.createdAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.keyPrefix,
    scopes: parseScopes(r.scopes),
    active: r.active,
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt,
    revokedAt: r.revokedAt,
  }));
}

export interface VerifiedPartner {
  id: number;
  name: string;
  scopes: PartnerScope[];
}

/**
 * Verify a presented plaintext key. Returns the partner identity when the key
 * maps to an active row, or null otherwise. Best-effort updates `lastUsedAt`.
 * Never throws — an infra failure degrades to "not authenticated".
 */
export async function verifyPartnerKey(
  plaintext: string,
): Promise<VerifiedPartner | null> {
  const trimmed = (plaintext ?? "").trim();
  if (!trimmed) return null;
  if (!(await ensureTable())) return null;
  try {
    const hash = hashKey(trimmed);
    const [row]: PartnerKey[] = await db
      .select()
      .from(partnerKeysTable)
      .where(
        and(
          eq(partnerKeysTable.keyHash, hash),
          eq(partnerKeysTable.active, true),
        ),
      )
      .limit(1);
    if (!row) return null;
    // Best-effort last-used stamp; a failure here must not deny a valid key.
    void db
      .update(partnerKeysTable)
      .set({ lastUsedAt: new Date() })
      .where(eq(partnerKeysTable.id, row.id))
      .catch(() => {});
    return { id: row.id, name: row.name, scopes: parseScopes(row.scopes) };
  } catch (err) {
    console.error(
      "verifyPartnerKey failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
