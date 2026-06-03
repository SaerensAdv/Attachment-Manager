import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Persisted client profiles. Structured fields mirror the sections in
 * `clients/_template.md` so a DB client renders into the same markdown shape the
 * rest of the AI "brain" (routing, intake, generation) already understands.
 * List-style fields (services, audience, locations, channels) store one item
 * per line and are rendered as bullet lists.
 */
export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  business: text("business"),
  world: text("world"),
  services: text("services"),
  audience: text("audience"),
  locations: text("locations"),
  languages: text("languages"),
  mainGoal: text("main_goal"),
  conversionAction: text("conversion_action"),
  kpis: text("kpis"),
  budget: text("budget"),
  toneOfVoice: text("tone_of_voice"),
  channels: text("channels"),
  restrictions: text("restrictions"),
  website: text("website"),
  landingPages: text("landing_pages"),
  currentState: text("current_state"),
  googleAdsData: text("google_ads_data"),
  searchConsoleData: text("search_console_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Client = typeof clientsTable.$inferSelect;
export type InsertClient = typeof clientsTable.$inferInsert;
