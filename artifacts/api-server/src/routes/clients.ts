import { Router, type IRouter } from "express";
import { and, eq, isNull, or } from "drizzle-orm";
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
import { discoverClients } from "../lib/client-discovery";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  buildBriefingContext,
  buildBriefingPrompt,
  parseBriefingJson,
} from "../lib/briefing-suggest";
import { summarizeCrawl } from "../lib/screaming-frog";

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
  groupId: number | null;
  values: Partial<Record<FieldKey, string | null>>;
}

/**
 * Parse the optional `groupId` from a request body. Returns the numeric id, or
 * `null` when absent / explicitly cleared, or an error string when malformed.
 * (Referential integrity is enforced by the FK; an unknown id surfaces as a DB
 * error rather than silently sticking.)
 */
function parseGroupId(raw: unknown): number | null | { error: string } {
  if (raw === undefined || raw === null || raw === "") return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return { error: "Ongeldige klantgroep." };
  }
  return id;
}

/**
 * Detect a Postgres foreign-key violation (SQLSTATE 23503). The only FK on the
 * clients table is `group_id -> client_groups.id`, so this maps cleanly to an
 * unknown-klantgroep domain error instead of leaking a generic 500. Drizzle
 * wraps the driver error, so the SQLSTATE can sit on the error itself or on its
 * `cause`.
 */
function isForeignKeyViolation(err: unknown): boolean {
  const hasCode = (e: unknown): boolean =>
    !!e && typeof e === "object" && (e as { code?: unknown }).code === "23503";
  return (
    hasCode(err) || hasCode((err as { cause?: unknown } | null)?.cause)
  );
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

  const groupId = parseGroupId(obj.groupId);
  if (groupId !== null && typeof groupId === "object") {
    return { error: groupId.error };
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

  return { name, groupId, values };
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
    crawlLiveAt: client.crawlLiveAt ? client.crawlLiveAt.toISOString() : null,
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

/**
 * Cheap coverage / gap overview: for every client, which integrations have a
 * config key set and when each was last refreshed. Pure read of the rows we
 * already hold — no external API calls — so the UI can render an at-a-glance
 * matrix and decide what still needs filling or refreshing.
 */
router.get("/clients/coverage", async (_req, res) => {
  const rows = await db
    .select()
    .from(clientsTable)
    .orderBy(clientsTable.name);

  const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
  const has = (v: string | null): boolean => !!v && v.trim().length > 0;

  const clients = rows.map((c) => ({
    id: c.id,
    name: c.name,
    integrations: {
      googleAds: { configured: has(c.googleAdsCustomerId), liveAt: iso(c.googleAdsLiveAt) },
      competitorAds: {
        configured: has(c.competitorAdvertisers),
        liveAt: iso(c.competitorAdsLiveAt),
      },
      searchConsole: {
        configured: has(c.searchConsoleSiteUrl),
        liveAt: iso(c.searchConsoleLiveAt),
      },
      ga4: { configured: has(c.ga4PropertyId), liveAt: iso(c.ga4LiveAt) },
      places: { configured: has(c.placesQuery), liveAt: iso(c.placesLiveAt) },
      pagespeed: {
        configured: resolvePagespeedUrls(c).length > 0,
        liveAt: iso(c.pagespeedLiveAt),
      },
      businessProfile: {
        configured: has(c.businessProfileLocationId),
        liveAt: iso(c.businessProfileLiveAt),
      },
      websiteIntake: {
        configured: has(c.website) || has(c.landingPages),
        liveAt: iso(c.websiteIntakeAt),
      },
      crawl: {
        configured: has(c.website),
        liveAt: iso(c.crawlLiveAt),
      },
    },
  }));

  res.json({ clients });
});

/**
 * Discovery (read-only): find accounts the agency manages that aren't yet a
 * client, plus missing integration keys we can confidently fill on existing
 * clients. Returns a review payload — nothing is created or changed here; the
 * user confirms via POST /clients/discovery/apply.
 */
router.get("/clients/discovery", async (_req, res) => {
  try {
    const result = await discoverClients();
    res.json(result);
  } catch (err) {
    res.status(502).json({
      error: "Kon klantontdekking niet uitvoeren.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
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
  try {
    const [row] = await db
      .insert(clientsTable)
      .values({ name: parsed.name, groupId: parsed.groupId, ...parsed.values })
      .returning();
    res.status(201).json(serialize(row));
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      res.status(400).json({ error: "Onbekende klantgroep." });
      return;
    }
    throw err;
  }
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

  let row: Client | undefined;
  try {
    [row] = await db
      .update(clientsTable)
      .set({
        name: parsed.name,
        groupId: parsed.groupId,
        ...parsed.values,
        updatedAt: new Date(),
      })
      .where(where)
      .returning();
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      res.status(400).json({ error: "Onbekende klantgroep." });
      return;
    }
    throw err;
  }

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

/**
 * Resolve which URLs PageSpeed should measure. Explicit `pagespeedUrls` win; if
 * none are set we fall back to the client's own Website (+ landing pages) so a
 * client never has to type the URL twice and PageSpeed runs automatically in the
 * bulk "Alles verversen" loop.
 */
function resolvePagespeedUrls(row: Client): string[] {
  const explicit = (row.pagespeedUrls ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (explicit.length > 0) return explicit;
  return collectClientUrls(row.website, row.landingPages);
}

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

  const urls = resolvePagespeedUrls(row);
  if (urls.length === 0) {
    res.status(400).json({
      error:
        "Deze klant heeft nog geen landingspagina's of website. Vul het veld Website in (of één of meer URL's, één per regel) en bewaar eerst.",
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

// In-app upload of a Screaming Frog crawl export. Unlike the secret-gated
// /crawl-intake (built for automated pushes from the user's own machine), this
// endpoint serves the in-app upload page: it is an interactive, same-origin
// mutation like the other client refreshes, so it is not behind a trigger
// secret. The CSV travels inside a JSON body (orval always sends JSON), which is
// why /api/clients parses with a larger body limit in app.ts.
router.post("/clients/:id/crawl-upload", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }

  const body = (req.body ?? {}) as { csv?: unknown; crawledAt?: unknown };
  const csv = typeof body.csv === "string" ? body.csv : "";
  if (!csv.trim()) {
    res.status(400).json({
      error:
        "Lege export: voeg de Screaming Frog CSV ('Internal: All') toe.",
    });
    return;
  }

  let crawledAt: Date | undefined;
  if (typeof body.crawledAt === "string" && body.crawledAt.trim()) {
    const parsed = new Date(body.crawledAt);
    if (!Number.isNaN(parsed.getTime())) crawledAt = parsed;
  }

  const [row] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Klant niet gevonden." });
    return;
  }

  const summary = summarizeCrawl(csv, { crawledAt });

  // A malformed or non-Screaming-Frog upload yields zero usable records. Reject
  // it instead of overwriting the last good crawl with a "no data" placeholder,
  // so one bad upload can never erase the technical context the agents rely on.
  if (summary.records.length === 0) {
    res.status(400).json({ error: summary.text });
    return;
  }

  const [updated] = await db
    .update(clientsTable)
    .set({
      crawlLive: summary.text,
      crawlLiveAt: summary.fetchedAt,
      updatedAt: new Date(),
    })
    .where(eq(clientsTable.id, id))
    .returning();

  res.json(serialize(updated));
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

/** Per-integration outcome of a bulk refresh, for the UI summary. */
type RefreshStatus = "refreshed" | "skipped" | "error";
interface RefreshOutcome {
  integration: string;
  status: RefreshStatus;
  detail?: string;
}

/**
 * Refresh every integration that the client has a config key for, best-effort.
 * A failing integration becomes an "error" outcome and never blocks the others.
 * Returns the column updates to persist plus a per-integration outcome list.
 */
async function refreshConfiguredIntegrations(
  row: Client,
): Promise<{ updates: Partial<Client>; outcomes: RefreshOutcome[] }> {
  const updates: Record<string, unknown> = {};
  const outcomes: RefreshOutcome[] = [];

  const run = async (
    integration: string,
    configured: boolean,
    fn: () => Promise<void>,
  ): Promise<void> => {
    if (!configured) {
      outcomes.push({ integration, status: "skipped", detail: "geen koppeling ingesteld" });
      return;
    }
    try {
      await fn();
      outcomes.push({ integration, status: "refreshed" });
    } catch (err) {
      outcomes.push({
        integration,
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  };

  await run(
    "googleAds",
    !!(row.googleAdsCustomerId ?? "").replace(/\D/g, ""),
    async () => {
      const report = await fetchGoogleAdsReport(row.googleAdsCustomerId ?? "");
      updates.googleAdsLive = report.text;
      updates.googleAdsLiveAt = report.fetchedAt;
    },
  );

  await run(
    "competitorAds",
    (row.competitorAdvertisers ?? "").trim().length > 0,
    async () => {
      const targets = (row.competitorAdvertisers ?? "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      const result = await fetchCompetitorAds(targets);
      updates.competitorAdsLive = result.text;
      updates.competitorAdsLiveAt = result.fetchedAt;
    },
  );

  await run(
    "searchConsole",
    (row.searchConsoleSiteUrl ?? "").trim().length > 0,
    async () => {
      const report = await fetchSearchConsoleReport(
        (row.searchConsoleSiteUrl ?? "").trim(),
      );
      updates.searchConsoleLive = report.text;
      updates.searchConsoleLiveAt = report.fetchedAt;
    },
  );

  await run(
    "ga4",
    (row.ga4PropertyId ?? "").trim().length > 0,
    async () => {
      const report = await fetchGa4Report((row.ga4PropertyId ?? "").trim());
      updates.ga4Live = report.text;
      updates.ga4LiveAt = report.fetchedAt;
    },
  );

  await run(
    "places",
    (row.placesQuery ?? "").trim().length > 0,
    async () => {
      const competitors = (row.placesCompetitors ?? "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      const report = await fetchPlacesReport(
        (row.placesQuery ?? "").trim(),
        competitors,
      );
      updates.placesLive = report.text;
      updates.placesLiveAt = report.fetchedAt;
    },
  );

  await run(
    "pagespeed",
    resolvePagespeedUrls(row).length > 0,
    async () => {
      const report = await fetchPageSpeedReport(resolvePagespeedUrls(row));
      updates.pagespeedLive = report.text;
      updates.pagespeedLiveAt = report.fetchedAt;
    },
  );

  await run(
    "businessProfile",
    (row.businessProfileLocationId ?? "").trim().length > 0,
    async () => {
      const report = await fetchBusinessProfileReport(
        (row.businessProfileLocationId ?? "").trim(),
      );
      updates.businessProfileLive = report.text;
      updates.businessProfileLiveAt = report.fetchedAt;
    },
  );

  await run(
    "websiteIntake",
    collectClientUrls(row.website, row.landingPages).length > 0,
    async () => {
      const urls = collectClientUrls(row.website, row.landingPages);
      const result = await fetchWebsiteIntake(urls);
      if (!result.text) {
        throw new Error(result.errors.join(" | ") || "Geen tekst gelezen.");
      }
      updates.websiteIntake = result.text;
      updates.websiteIntakeAt = new Date();
    },
  );

  return { updates: updates as Partial<Client>, outcomes };
}

/**
 * Refresh all configured integrations for ONE client. The UI loops this over
 * every client (sequentially) so each HTTP request stays short and the upstream
 * rate limiters are respected — a single server-side "refresh everything" call
 * would run for minutes and risk being torn down by the proxy.
 */
router.post("/clients/:id/refresh-all", async (req, res) => {
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

  const { updates, outcomes } = await refreshConfiguredIntegrations(row);

  let updated = row;
  if (Object.keys(updates).length > 0) {
    const [u] = await db
      .update(clientsTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(clientsTable.id, id))
      .returning();
    if (u) updated = u;
  }

  res.json({ client: serialize(updated), outcomes });
});

/**
 * Propose briefing-field values for a client by reading its own website (+ any
 * already-pulled live data) and asking the model to fill the fiche. This is a
 * PROPOSAL only: it never writes the briefing fields — the UI shows the
 * suggestions so a human reviews, edits and saves them. The only write side
 * effect is best-effort caching of the website-intake if it wasn't read yet.
 */
router.post("/clients/:id/briefing-suggest", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  let [row] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Klant niet gevonden." });
    return;
  }

  // Make sure there is website material to reason over. If the intake hasn't
  // been read yet but a website is configured, read it now and persist it.
  if (!(row.websiteIntake ?? "").trim()) {
    const urls = collectClientUrls(row.website, row.landingPages);
    if (urls.length > 0) {
      try {
        const result = await fetchWebsiteIntake(urls);
        if (result.text) {
          const [u] = await db
            .update(clientsTable)
            .set({
              websiteIntake: result.text,
              websiteIntakeAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(clientsTable.id, id))
            .returning();
          if (u) row = u;
        }
      } catch {
        // Fall through and suggest with whatever material we already have.
      }
    }
  }

  if (!(row.websiteIntake ?? "").trim()) {
    res.status(400).json({
      error:
        "Onvoldoende bronmateriaal. Vul eerst het veld Website in (en bewaar) zodat ik de website kan inlezen en de briefing kan voorstellen.",
    });
    return;
  }

  let raw: string;
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: buildBriefingPrompt(),
      messages: [{ role: "user", content: buildBriefingContext(row) }],
    });
    raw = message.content
      .map((blk) => (blk.type === "text" ? blk.text : ""))
      .join("");
  } catch (err) {
    res.status(502).json({
      error: "De briefing-analyse is mislukt. Probeer het opnieuw.",
      detail: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  let parsed;
  try {
    parsed = parseBriefingJson(raw);
  } catch {
    res
      .status(502)
      .json({ error: "Kon het briefing-antwoord niet interpreteren." });
    return;
  }

  res.json({
    client: serialize(row),
    suggestions: parsed.suggestions,
    notes: parsed.notes,
  });
});

/** Validate a Google Ads customer id value (digits, optionally dash-grouped). */
function validateAdsId(raw: string): string | { error: string } {
  if (!/^[\d\s-]+$/.test(raw)) {
    return { error: "Google Ads customer ID mag enkel cijfers en streepjes bevatten." };
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 12) {
    return { error: "Google Ads customer ID moet 8 tot 12 cijfers bevatten." };
  }
  return raw;
}

/** Validate a Search Console property value (sc-domain: or url-prefix). */
function validateScUrl(raw: string): string | { error: string } {
  const ok =
    /^sc-domain:[a-z0-9.-]+$/i.test(raw) || /^https?:\/\/[^\s]+$/i.test(raw);
  if (!ok) {
    return {
      error:
        'Search Console-property moet "sc-domain:voorbeeld.be" of "https://voorbeeld.be/" zijn.',
    };
  }
  return raw;
}

/**
 * Apply confirmed discovery results: fill missing keys on existing clients and
 * create the new clients the user ticked. Everything is validated again here
 * (the review payload is user-editable) and enrichments only ever fill a key
 * that is still empty — we never overwrite an existing value.
 */
router.post("/clients/discovery/apply", async (req, res) => {
  const body = (req.body ?? {}) as {
    enrichments?: unknown;
    newClients?: unknown;
  };
  const enrichments = Array.isArray(body.enrichments) ? body.enrichments : [];
  const newClients = Array.isArray(body.newClients) ? body.newClients : [];

  const enriched: { clientId: number; field: string }[] = [];
  const created: { id: number; name: string }[] = [];
  const errors: string[] = [];

  // --- Enrichments: fill a single empty key on an existing client. ----------
  for (const raw of enrichments) {
    const e = (raw ?? {}) as Record<string, unknown>;
    const clientId = Number(e.clientId);
    const field = String(e.field ?? "");
    const value = asTrimmed(e.value);
    if (!Number.isInteger(clientId) || clientId <= 0 || !value) {
      errors.push("Ongeldige aanvulling overgeslagen.");
      continue;
    }
    if (field !== "googleAdsCustomerId" && field !== "searchConsoleSiteUrl") {
      errors.push(`Onbekend veld "${field}" overgeslagen.`);
      continue;
    }
    const checked =
      field === "googleAdsCustomerId"
        ? validateAdsId(value)
        : validateScUrl(value);
    if (typeof checked !== "string") {
      errors.push(`${field}: ${checked.error}`);
      continue;
    }
    // Never clobber an existing value — only fill when still empty. Done as a
    // single conditional UPDATE so a concurrent writer can't slip a value in
    // between a read and the write (atomic compare-and-fill).
    const fieldCol =
      field === "googleAdsCustomerId"
        ? clientsTable.googleAdsCustomerId
        : clientsTable.searchConsoleSiteUrl;
    const [updated] = await db
      .update(clientsTable)
      .set({ [field]: checked, updatedAt: new Date() })
      .where(
        and(
          eq(clientsTable.id, clientId),
          or(isNull(fieldCol), eq(fieldCol, "")),
        ),
      )
      .returning();
    if (updated) {
      enriched.push({ clientId, field });
      continue;
    }
    // Nothing updated: either the client is gone or the key is already set.
    const [current] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.id, clientId));
    if (!current) {
      errors.push(`Klant ${clientId} niet gevonden.`);
    } else {
      errors.push(`${current.name}: ${field} is al ingevuld, overgeslagen.`);
    }
  }

  // --- New clients: validate + insert. --------------------------------------
  // Guard against duplicates (stale review payloads, manual edits, double
  // submits): skip a candidate whose name / Ads-ID / SC-property already exists
  // on a client, and track within-batch so the same key can't be inserted twice.
  const existingForDupe = newClients.length
    ? await db.select().from(clientsTable)
    : [];
  const digitsOf = (v: string | null | undefined) =>
    (v ?? "").replace(/\D/g, "");
  const takenNames = new Set(
    existingForDupe.map((c) => c.name.trim().toLowerCase()),
  );
  const takenAds = new Set(
    existingForDupe.map((c) => digitsOf(c.googleAdsCustomerId)).filter(Boolean),
  );
  const takenSc = new Set(
    existingForDupe
      .map((c) => (c.searchConsoleSiteUrl ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  for (const raw of newClients) {
    const n = (raw ?? {}) as Record<string, unknown>;
    const name = asTrimmed(n.name);
    if (!name) {
      errors.push("Nieuwe klant zonder naam overgeslagen.");
      continue;
    }
    const values: Record<string, string> = {};
    const adsRaw = asTrimmed(n.googleAdsCustomerId);
    if (adsRaw) {
      const checked = validateAdsId(adsRaw);
      if (typeof checked !== "string") {
        errors.push(`${name}: ${checked.error}`);
        continue;
      }
      values.googleAdsCustomerId = checked;
    }
    const scRaw = asTrimmed(n.searchConsoleSiteUrl);
    if (scRaw) {
      const checked = validateScUrl(scRaw);
      if (typeof checked !== "string") {
        errors.push(`${name}: ${checked.error}`);
        continue;
      }
      values.searchConsoleSiteUrl = checked;
    }
    const website = asTrimmed(n.website);
    if (website) values.website = website;

    const nameKey = name.toLowerCase();
    const adsKey = values.googleAdsCustomerId
      ? digitsOf(values.googleAdsCustomerId)
      : "";
    const scKey = values.searchConsoleSiteUrl
      ? values.searchConsoleSiteUrl.toLowerCase()
      : "";
    if (takenNames.has(nameKey)) {
      errors.push(`${name}: bestaat al als klant, overgeslagen.`);
      continue;
    }
    if (adsKey && takenAds.has(adsKey)) {
      errors.push(`${name}: Google Ads-ID is al in gebruik, overgeslagen.`);
      continue;
    }
    if (scKey && takenSc.has(scKey)) {
      errors.push(
        `${name}: Search Console-property is al in gebruik, overgeslagen.`,
      );
      continue;
    }

    const [inserted] = await db
      .insert(clientsTable)
      .values({ name, ...values })
      .returning();
    created.push({ id: inserted.id, name: inserted.name });
    takenNames.add(nameKey);
    if (adsKey) takenAds.add(adsKey);
    if (scKey) takenSc.add(scKey);
  }

  res.json({ enriched, created, errors });
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
