import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

/**
 * Monitor list for the weekly account-optimization workflow. A "monitored"
 * term is one the team judged relevant to the client's intent but not (yet)
 * converting: per Saerens' rule it is never excluded outright — the landing
 * page or bid is addressed first, and only if that also fails does it become a
 * candidate for exclusion. Persisting these across weeks lets the next run
 * resurface them with their age (`weeksMonitored`) so stale ones get escalated
 * instead of silently lingering.
 *
 * The list is captured from the team's output each run (a machine-readable
 * block the optimization specialist emits) and upserted by client + term +
 * campaign. `status` is "monitoring" while tracked, and "resolved" or
 * "excluded" once the team closes it out; only monitoring rows are injected
 * back into the next run.
 */
export const monitoredTermsTable = pgTable("monitored_terms", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id")
    .notNull()
    .references(() => clientsTable.id, { onDelete: "cascade" }),
  term: text("term").notNull(),
  campaign: text("campaign"),
  reason: text("reason"),
  suggestedAction: text("suggested_action"),
  status: text("status").notNull().default("monitoring"),
  note: text("note"),
  weeksMonitored: integer("weeks_monitored").notNull().default(1),
  firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
});

export type MonitoredTerm = typeof monitoredTermsTable.$inferSelect;
export type InsertMonitoredTerm = typeof monitoredTermsTable.$inferInsert;
