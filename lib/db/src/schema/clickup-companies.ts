import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Read-only local mirror of ClickUp CRM → Companies. ClickUp remains master. */
export const clickupCompaniesTable = pgTable("clickup_companies", {
  clickupTaskId: text("clickup_task_id").primaryKey(),
  name: text("name").notNull(),
  website: text("website"),
  status: text("status"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
});

export type ClickupCompanyCache = typeof clickupCompaniesTable.$inferSelect;
export type InsertClickupCompanyCache = typeof clickupCompaniesTable.$inferInsert;
