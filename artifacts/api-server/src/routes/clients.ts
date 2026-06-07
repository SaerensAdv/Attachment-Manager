import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, clientsTable, type Client } from "@workspace/db";
import {
  collectClientUrls,
  fetchWebsiteIntake,
} from "../lib/website-intake";
import { fetchGoogleAdsReport, GoogleAdsConfigError } from "../lib/google-ads";
import { fetchCompetitorAds, SerpApiConfigError } from "../lib/serpapi";
import {
  fetchSearchConsoleReport,
  SearchConsoleConfigError,
} from "../lib/search-console";
import { fetchGa4Report, Ga4ConfigError } from "../lib/ga4";
import { fetchPlacesReport, PlacesConfigError } from "../lib/places";
import { fetchPageSpeedReport, PageSpeedConfigError } from "../lib/pagespeed";
import {
  fetchBusinessProfileReport,
  BusinessProfileConfigError,
} from "../lib/business-profile";
import { GoogleOAuthConfigError } from "../lib/google-oauth";

const router: IRouter = Router();

/** Editable text fields, in the order they appear on the form. */
const FIELDS = [
  "business",
  "world",
  "services",
  "audience",
  "locations",
  "languages",
  "mainGoal",
  "conversionAction",
  "kpis",
  "budget",
  "toneOfVoice",
  "channels",
  "restrictions",
  "website",
  "landingPages",
  "currentState",
  "googleAdsData",
  "searchConsoleData",
  "reportEmail",
  "googleAdsCustomerId",
  "competitorAdvertisers",
  "searchConsoleSiteUrl",
  "ga4PropertyId",
  "placesQuery",
  "placesCompetitors",
  "pagespeedUrls",
  "businessProfileLocationId",
] as const;

type FieldKey = (typeof FIELDS)[number];

/** Free-form paste fields that can hold large exports — bounded to keep the
 * generated client markdown (and thus agent prompt context) within sane limits. */
const LARGE_FIELDS: readonly FieldKey[] = [
  "currentState",
  "googleAdsData",
  "searchConsoleData",
];
const MAX_LARGE_FIELD_LEN = 50_000;
/** Max length for the short fields (everything except the large paste fields).
 * Keeps any single field from bloating the generated client markdown. */
const MAX_FIELD_LEN = 5_000;
const MAX_NAME_LEN = 200;

interface ClientInput {
  name: string;
  values: Partial<Record<FieldKey, string | null>>;
}

function asTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Validate + normalize a request body into a client payload, or return error. */
function parseBody(body: unknown): ClientInput | { error: string } {
  const obj = (body ?? {}) as Record<string, unknown>;
  const name = asTrimmed(obj.name);
  if (!name) return { error: "Naam is verplicht." };
  if (name.length > MAX_NAME_LEN) {
    return { error: `Naam is te lang (max ${MAX_NAME_LEN} tekens).` };
  }

  const values: Partial<Record<FieldKey, string | null>> = {};
  for (const key of FIELDS) {
    values[key] = asTrimmed(obj[key]);
  }

  // Length caps: large paste fields get a generous limit, every other field a
  // tighter one, so no single field can bloat the generated client markdown
  // (and thus the agent prompt context).
  for (const key of FIELDS) {
    const value = values[key];
    if (!value) continue;
    const max = LARGE_FIELDS.includes(key) ? MAX_LARGE_FIELD_LEN : MAX_FIELD_LEN;
    if (value.length > max) {
      return {
        error: `Veld "${key}" is te groot (max ${max.toLocaleString("nl-BE")} tekens). Plak een samenvatting of de kerncijfers.`,
      };
    }
  }

  // Google Ads customer id must be a plain account number (digits, optionally
  // dash- or space-grouped like 123-456-7890). Reject anything else early so a
  // typo never reaches the Google Ads API.
  const rawCustomerId = values.googleAdsCustomerId;
  if (rawCustomerId) {
    if (!/^[\d\s-]+$/.test(rawCustomerId)) {
      return {
        error:
          "Google Ads customer ID mag enkel cijfers en streepjes bevatten.",
      };
    }
    const digits = rawCustomerId.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 12) {
      return {
        error:
          "Google Ads customer ID moet 8 tot 12 cijfers bevatten (bv. 123-456-7890).",
      };
    }
  }

  // Search Console property must be a domain property (sc-domain:...) or a
  // URL-prefix property (https://...). Reject anything else early.
  const siteUrl = values.searchConsoleSiteUrl;
  if (siteUrl) {
    const ok = /^sc-domain:[a-z0-9.-]+$/i.test(siteUrl) || /^https?:\/\/[^\s]+$/i.test(siteUrl);
    if (!ok) {
      return {
        error:
          'Search Console-property moet "sc-domain:voorbeeld.be" of "https://voorbeeld.be/" zijn.',
      };
    }
  }

  // GA4 property id is numeric (optionally with a "properties/" prefix). Reject
  // anything else early so a typo never reaches the GA4 Data API.
  const ga4Raw = values.ga4PropertyId;
  if (ga4Raw) {
    const bare = ga4Raw.replace(/^properties\//i, "");
    if (!/^\d{6,}$/.test(bare)) {
      return {
        error:
          "GA4 property-id moet numeriek zijn (bv. 123456789).",
      };
    }
  }

  return { name, values };
}

/** Shape a DB row for the API response (timestamps as ISO strings). */
function serialize(client: Client) {
  return {
    ...client,
    websiteIntakeAt: client.websiteIntakeAt
      ? client.websiteIntakeAt.toISOString()
      : null,
    googleAdsLiveAt: client.googleAdsLiveAt
      ? client.googleAdsLiveAt.toISOString()
      : null,
    competitorAdsLiveAt: client.competitorAdsLiveAt
      ? client.competitorAdsLiveAt.toISOString()
      : null,
    searchConsoleLiveAt: client.searchConsoleLiveAt
      ? client.searchConsoleLiveAt.toISOString()
      : null,
    ga4LiveAt: client.ga4LiveAt ? client.ga4LiveAt.toISOString() : null,
    placesLiveAt: client.placesLiveAt
      ? client.placesLiveAt.toISOString()
      : null,
    pagespeedLiveAt: client.pagespeedLiveAt
      ? client.pagespeedLiveAt.toISOString()
      : null,
    businessProfileLiveAt: client.businessProfileLiveAt
      ? client.businessProfileLiveAt.toISOString()
      : null,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
  };
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get("/clients", async (_req, res) => {
  const rows = await db
    .select()
    .from(clientsTable)
    .orderBy(clientsTable.name);
  res.json({ clients: rows.map(serialize) });
});

router.get("/clients/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const [row] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Klant niet gevonden." });
    return;
  }
  res.json(serialize(row));
});

router.post("/clients", async (req, res) => {
  const parsed = parseBody(req.body);
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const [row] = await db
    .insert(clientsTable)
    .values({ name: parsed.name, ...parsed.values })
    .returning();
  res.status(201).json(serialize(row));
});

router.put("/clients/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const parsed = parseBody(req.body);
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  // Optimistic concurrency: the client echoes back the `updatedAt` it loaded.
  // The version check is folded into the UPDATE predicate so the compare-and-set
  // is atomic — a separate SELECT-then-UPDATE could let two concurrent writers
  // both pass the check and clobber each other. When `updatedAt` is provided we
  // only update the row that still matches that version; if zero rows change we
  // disambiguate 404 (gone) from 409 (changed elsewhere) with a follow-up read.
  const expectedRaw = asTrimmed((req.body as Record<string, unknown>)?.updatedAt);
  const expectedDate = expectedRaw ? new Date(expectedRaw) : null;
  const versionValid = expectedDate && !Number.isNaN(expectedDate.getTime());

  const where = versionValid
    ? and(eq(clientsTable.id, id), eq(clientsTable.updatedAt, expectedDate))
    : eq(clientsTable.id, id);

  const [row] = await db
    .update(clientsTable)
    .set({ name: parsed.name, ...parsed.values, updatedAt: new Date() })
    .where(where)
    .returning();

  if (row) {
    res.json(serialize(row));
    return;
  }

  // Nothing updated: either the row is gone (404) or its version moved on (409).
  const [current] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, id));
  if (!current) {
    res.status(404).json({ error: "Klant niet gevonden." });
    return;
  }
  res.status(409).json({
    error:
      "Deze fiche is intussen elders aangepast. Herlaad de klant en voer je wijziging opnieuw door.",
    current: serialize(current),
  });
});

router.post("/clients/:id/website-intake", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const [row] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Klant niet gevonden." });
    return;
  }

  const urls = collectClientUrls(row.website, row.landingPages);
  if (urls.length === 0) {
    res.status(400).json({
      error:
        "Deze klant heeft nog geen geldige website-URL. Vul eerst het veld Website in.",
    });
    return;
  }

  const result = await fetchWebsiteIntake(urls);
  if (!result.text) {
    res.status(502).json({
      error: "Kon de website niet uitlezen.",
      detail: result.errors.join(" | "),
    });
    return;
  }

  const [updated] = await db
    .update(clientsTable)
    .set({
      websiteIntake: result.text,
      websiteIntakeAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(clientsTable.id, id))
    .returning();
  res.json(serialize(updated));
});

router.post("/clients/:id/google-ads-refresh", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const [row] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Klant niet gevonden." });
    return;
  }

  const customerId = (row.googleAdsCustomerId ?? "").replace(/\D/g, "");
  if (!customerId) {
    res.status(400).json({
      error:
        "Deze klant heeft nog geen Google Ads customer ID. Vul het in en bewaar eerst.",
    });
    return;
  }

  try {
    const report = await fetchGoogleAdsReport(row.googleAdsCustomerId ?? "");
    const [updated] = await db
      .update(clientsTable)
      .set({
        googleAdsLive: report.text,
        googleAdsLiveAt: report.fetchedAt,
        updatedAt: new Date(),
      })
      .where(eq(clientsTable.id, id))
      .returning();
    res.json(serialize(updated));
  } catch (err) {
    if (err instanceof GoogleAdsConfigError) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(502).json({
      error: "Kon Google Ads niet uitlezen.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

router.post("/clients/:id/competitor-ads-refresh", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const [row] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Klant niet gevonden." });
    return;
  }

  const targets = (row.competitorAdvertisers ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (targets.length === 0) {
    res.status(400).json({
      error:
        "Deze klant heeft nog geen concurrenten ingesteld. Vul advertiser-ID's of domeinen in (één per regel) en bewaar eerst.",
    });
    return;
  }

  try {
    const result = await fetchCompetitorAds(targets);
    const [updated] = await db
      .update(clientsTable)
      .set({
        competitorAdsLive: result.text,
        competitorAdsLiveAt: result.fetchedAt,
        updatedAt: new Date(),
      })
      .where(eq(clientsTable.id, id))
      .returning();
    res.json(serialize(updated));
  } catch (err) {
    if (err instanceof SerpApiConfigError) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(502).json({
      error: "Kon concurrent-advertenties niet ophalen.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

router.post("/clients/:id/search-console-refresh", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const [row] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Klant niet gevonden." });
    return;
  }

  const siteUrl = (row.searchConsoleSiteUrl ?? "").trim();
  if (!siteUrl) {
    res.status(400).json({
      error:
        "Deze klant heeft nog geen Search Console-property. Vul de property in (bv. sc-domain:voorbeeld.be) en bewaar eerst.",
    });
    return;
  }

  try {
    const report = await fetchSearchConsoleReport(siteUrl);
    const [updated] = await db
      .update(clientsTable)
      .set({
        searchConsoleLive: report.text,
        searchConsoleLiveAt: report.fetchedAt,
        updatedAt: new Date(),
      })
      .where(eq(clientsTable.id, id))
      .returning();
    res.json(serialize(updated));
  } catch (err) {
    if (
      err instanceof SearchConsoleConfigError ||
      err instanceof GoogleOAuthConfigError
    ) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(502).json({
      error: "Kon Search Console niet uitlezen.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

router.post("/clients/:id/ga4-refresh", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const [row] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Klant niet gevonden." });
    return;
  }

  const propertyId = (row.ga4PropertyId ?? "").trim();
  if (!propertyId) {
    res.status(400).json({
      error:
        "Deze klant heeft nog geen GA4 property-id. Vul het in (bv. 123456789) en bewaar eerst.",
    });
    return;
  }

  try {
    const report = await fetchGa4Report(propertyId);
    const [updated] = await db
      .update(clientsTable)
      .set({
        ga4Live: report.text,
        ga4LiveAt: report.fetchedAt,
        updatedAt: new Date(),
      })
      .where(eq(clientsTable.id, id))
      .returning();
    res.json(serialize(updated));
  } catch (err) {
    if (err instanceof Ga4ConfigError || err instanceof GoogleOAuthConfigError) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(502).json({
      error: "Kon GA4 niet uitlezen.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

router.post("/clients/:id/places-refresh", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const [row] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Klant niet gevonden." });
    return;
  }

  const clientQuery = (row.placesQuery ?? "").trim();
  if (!clientQuery) {
    res.status(400).json({
      error:
        'Deze klant heeft nog geen Maps-zoekopdracht. Vul de naam + plaats in (bv. "Klant BV Gent") en bewaar eerst.',
    });
    return;
  }
  const competitors = (row.placesCompetitors ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    const report = await fetchPlacesReport(clientQuery, competitors);
    const [updated] = await db
      .update(clientsTable)
      .set({
        placesLive: report.text,
        placesLiveAt: report.fetchedAt,
        updatedAt: new Date(),
      })
      .where(eq(clientsTable.id, id))
      .returning();
    res.json(serialize(updated));
  } catch (err) {
    if (err instanceof PlacesConfigError) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(502).json({
      error: "Kon Google Maps niet uitlezen.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

router.post("/clients/:id/pagespeed-refresh", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const [row] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Klant niet gevonden." });
    return;
  }

  const urls = (row.pagespeedUrls ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (urls.length === 0) {
    res.status(400).json({
      error:
        "Deze klant heeft nog geen landingspagina's. Vul één of meer URL's in (één per regel) en bewaar eerst.",
    });
    return;
  }

  try {
    const report = await fetchPageSpeedReport(urls);
    const [updated] = await db
      .update(clientsTable)
      .set({
        pagespeedLive: report.text,
        pagespeedLiveAt: report.fetchedAt,
        updatedAt: new Date(),
      })
      .where(eq(clientsTable.id, id))
      .returning();
    res.json(serialize(updated));
  } catch (err) {
    if (err instanceof PageSpeedConfigError) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(502).json({
      error: "Kon PageSpeed Insights niet uitlezen.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

router.post("/clients/:id/business-profile-refresh", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const [row] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Klant niet gevonden." });
    return;
  }

  const locationId = (row.businessProfileLocationId ?? "").trim();
  if (!locationId) {
    res.status(400).json({
      error:
        "Deze klant heeft nog geen Business Profile-locatie. Vul het locatie-id in en bewaar eerst.",
    });
    return;
  }

  try {
    const report = await fetchBusinessProfileReport(locationId);
    const [updated] = await db
      .update(clientsTable)
      .set({
        businessProfileLive: report.text,
        businessProfileLiveAt: report.fetchedAt,
        updatedAt: new Date(),
      })
      .where(eq(clientsTable.id, id))
      .returning();
    res.json(serialize(updated));
  } catch (err) {
    if (
      err instanceof BusinessProfileConfigError ||
      err instanceof GoogleOAuthConfigError
    ) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(502).json({
      error: "Kon Google Business Profile niet uitlezen.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

router.delete("/clients/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const [row] = await db
    .delete(clientsTable)
    .where(eq(clientsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Klant niet gevonden." });
    return;
  }
  res.status(204).end();
});

export default router;
