import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Audit + idempotency ledger for every Replit -> ClickUp PUSH (Fase 3). One row
 * per logical push (a monthly report for a client+period, a weekly search-terms
 * analysis for an account+ISO-week, an operational alert for a fingerprint+
 * window). It is what makes a retried or re-fired run create EXACTLY ONE ClickUp
 * object instead of duplicating: the caller first claims a row by its unique
 * `idempotencyKey`, records the created object's id the instant the task exists
 * (before enriching it with fields/attachments), and a later retry that finds an
 * object id resumes enrichment instead of creating a second task.
 *
 * Defined in the Drizzle schema (per the brief: "geen nieuwe tabellen buiten
 * Drizzle") so the types are first-class, but the table is CREATED by an
 * idempotent `CREATE TABLE IF NOT EXISTS` self-bootstrap in the push store — the
 * project never runs drizzle-kit push (it would try to drop the unmanaged
 * pgvector/crawl/alerts tables it doesn't know about).
 */
export const clickupPushRecordsTable = pgTable("clickup_push_records", {
  id: serial("id").primaryKey(),
  /**
   * What was pushed: "report" | "search_terms" | "alert". Kept as text (not a
   * pg enum) so adding a push kind later needs no migration/enum alter.
   */
  kind: text("kind").notNull(),
  /**
   * Stable dedup key, unique across all pushes. Format is per-kind and computed
   * by the push store (e.g. `report:{clientId}:{YYYY-MM}`).
   */
  idempotencyKey: text("idempotency_key").notNull().unique(),
  /**
   * The Replit-side source this push links back to, for the audit trail: a
   * generation id for a report, an alert id, or a synthetic id for a scheduled
   * search-terms run. Free-form text so every kind fits.
   */
  sourceRunId: text("source_run_id"),
  /** The created ClickUp object id (task id), set the moment the task exists. */
  clickupObjectId: text("clickup_object_id"),
  /** Deep link to the created object, for the audit trail / UI. */
  clickupUrl: text("clickup_url"),
  /** pending -> processing -> succeeded | failed. */
  status: text("status").notNull().default("pending"),
  /** How many times a push was attempted (bumped on each claim). */
  attempts: integer("attempts").notNull().default(0),
  /** Short, non-sensitive last error code/text for the audit trail. */
  lastErrorCode: text("last_error_code"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type ClickupPushRecord = typeof clickupPushRecordsTable.$inferSelect;
export type InsertClickupPushRecord =
  typeof clickupPushRecordsTable.$inferInsert;
