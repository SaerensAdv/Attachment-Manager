import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { clientGroupsTable } from "./client-groups";

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
  groupId: integer("group_id").references(() => clientGroupsTable.id, {
    onDelete: "set null",
  }),
  // Maandelijkse fee (retainer) in hele euro's die deze klant oplevert.
  // Voedt het omzet-overzicht op het dashboard (totaal vs. maanddoel).
  monthlyFee: integer("monthly_fee"),
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
  searchConsoleSiteUrl: text("search_console_site_url"),
  searchConsoleLive: text("search_console_live"),
  searchConsoleLiveAt: timestamp("search_console_live_at"),
  ga4PropertyId: text("ga4_property_id"),
  ga4Live: text("ga4_live"),
  ga4LiveAt: timestamp("ga4_live_at"),
  placesQuery: text("places_query"),
  placesCompetitors: text("places_competitors"),
  placesLive: text("places_live"),
  placesLiveAt: timestamp("places_live_at"),
  pagespeedUrls: text("pagespeed_urls"),
  pagespeedLive: text("pagespeed_live"),
  pagespeedLiveAt: timestamp("pagespeed_live_at"),
  businessProfileLocationId: text("business_profile_location_id"),
  businessProfileLive: text("business_profile_live"),
  businessProfileLiveAt: timestamp("business_profile_live_at"),
  websiteIntake: text("website_intake"),
  websiteIntakeAt: timestamp("website_intake_at"),
  crawlLive: text("crawl_live"),
  crawlLiveAt: timestamp("crawl_live_at"),
  reportEmail: text("report_email"),
  googleAdsCustomerId: text("google_ads_customer_id"),
  googleAdsLive: text("google_ads_live"),
  googleAdsLiveAt: timestamp("google_ads_live_at"),
  competitorAdvertisers: text("competitor_advertisers"),
  competitorAdsLive: text("competitor_ads_live"),
  competitorAdsLiveAt: timestamp("competitor_ads_live_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Client = typeof clientsTable.$inferSelect;
export type InsertClient = typeof clientsTable.$inferInsert;
