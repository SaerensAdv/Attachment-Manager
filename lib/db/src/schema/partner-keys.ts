import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Long-lived partner API keys. Each row authorizes one spun-off Replit project
 * (a "partner") to talk to this app's brain over the versioned partner API
 * (`/api/v1/partner/...`). Keys are single-tenant and per-project: one key per
 * child project, issued and revoked server-side (no self-service UI, no OAuth).
 *
 * Only the SHA-256 hash of the key is stored; the plaintext is shown once at
 * issue time and never persisted. `keyPrefix` is a short, non-secret fragment
 * kept purely so a human can recognise which key a row refers to when listing
 * or revoking. `scopes` is a comma-separated set drawn from read/write/trigger.
 *
 * The table is also self-bootstrapped at runtime by `partner-keys-store.ts`
 * (CREATE TABLE IF NOT EXISTS), consistent with the other derived stores, so it
 * exists without a drizzle-kit push.
 */
export const partnerKeysTable = pgTable("partner_keys", {
  id: serial("id").primaryKey(),
  // Human label for the child project this key belongs to (e.g. "lead-site").
  name: text("name").notNull(),
  // SHA-256 hex digest of the plaintext key. The plaintext is never stored.
  keyHash: text("key_hash").notNull().unique(),
  // Short non-secret prefix of the key, for recognising it in listings.
  keyPrefix: text("key_prefix").notNull(),
  // Comma-separated scopes granted to this key: any of read, write, trigger.
  scopes: text("scopes").notNull().default("read,write,trigger"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
});

export type PartnerKey = typeof partnerKeysTable.$inferSelect;
export type InsertPartnerKey = typeof partnerKeysTable.$inferInsert;
