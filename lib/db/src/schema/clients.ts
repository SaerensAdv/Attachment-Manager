import { sql } from "drizzle-orm";
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
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
  // Facturatiegegevens — de klant is de ontvanger van de factuur. Alles
  // optioneel zodat bestaande rijen geldig blijven. `billingName` valt terug op
  // `name` wanneer leeg. `btwMode` is "btw_21" of "verlegd" (zie saerens-billing.ts).
  billingName: text("billing_name"),
  billingAddress: text("billing_address"),
  billingCountry: text("billing_country"),
  vatNumber: text("vat_number"),
  btwMode: text("btw_mode"),
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
  bingSiteUrl: text("bing_site_url"),
  bingLive: text("bing_live"),
  bingLiveAt: timestamp("bing_live_at"),
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
  // Merktermen (één per regel): merknaam + veelvoorkomende varianten/typfouten,
  // gebruikt om organische zoektermen in branded vs non-branded te splitsen.
  brandTerms: text("brand_terms"),
  // Optionele extra Search Console-properties (één per regel of komma-gescheiden)
  // om in het SEO-rapport náást het hoofddomein te leggen — bv. een .be vs .com
  // vergelijking of NL+FR zustersites in één gecombineerd rapport. Enkel data
  // (huidige + vorige periode); het hoofddomein blijft de bron voor de PDF-cover.
  comparisonScUrls: text("comparison_sc_urls"),
  googleAdsCustomerId: text("google_ads_customer_id"),
  googleAdsLive: text("google_ads_live"),
  googleAdsLiveAt: timestamp("google_ads_live_at"),
  competitorAdvertisers: text("competitor_advertisers"),
  competitorAdsLive: text("competitor_ads_live"),
  competitorAdsLiveAt: timestamp("competitor_ads_live_at"),
  // Read-only koppeling naar het CRM-bedrijf in ClickUp (CRM → Companies).
  // Enkel een verwijzing (task-id) zodat de app een klant kan terugvinden in
  // ClickUp; de app maakt of overschrijft nooit iets in ClickUp. Wordt ingevuld
  // via de link-only sync (nooit geklobberd zodra gezet).
  clickupCompanyId: text("clickup_company_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  // One ClickUp company → at most one app client. Enforced in the DB (not just
  // app code) so a concurrent/double-clicked apply can never link the same
  // company to two clients. Partial: NULL/empty ids are free to repeat.
  clickupCompanyIdUnique: uniqueIndex("clients_clickup_company_id_unique")
    .on(t.clickupCompanyId)
    .where(
      sql`${t.clickupCompanyId} is not null and ${t.clickupCompanyId} <> ''`,
    ),
}));

export type Client = typeof clientsTable.$inferSelect;
export type InsertClient = typeof clientsTable.$inferInsert;
