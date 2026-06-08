import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Overarching client "group" — a kapstok dossier that bundles several
 * website-fiches (each a row in `clients`) under one real-world client.
 * Purely a grouping/overview layer: it owns no live-data fields and does not
 * cascade values down to its member fiches. Each member fiche keeps its own
 * integrations, intake and reporting.
 */
export const clientGroupsTable = pgTable("client_groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ClientGroup = typeof clientGroupsTable.$inferSelect;
export type InsertClientGroup = typeof clientGroupsTable.$inferInsert;
