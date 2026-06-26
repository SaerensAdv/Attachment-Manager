import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  clientsTable,
  clientGroupsTable,
  type Client,
} from "@workspace/db";
import { MONTHLY_REVENUE_GOAL_EUR, parseMonthlyFee } from "../lib/money";
import {
  asTrimmed,
  parseId,
  serialize,
  resolvePagespeedUrls,
} from "./clients-shared";

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
  "bingSiteUrl",
  "ga4PropertyId",
  "placesQuery",
  "placesCompetitors",
  "pagespeedUrls",
  "businessProfileLocationId",
  "billingName",
  "billingAddress",
  "billingCountry",
  "vatNumber",
  "btwMode",
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
  monthlyFee: number | null;
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
  return hasCode(err) || hasCode((err as { cause?: unknown } | null)?.cause);
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

  const monthlyFee = parseMonthlyFee(obj.monthlyFee);
  if (monthlyFee !== null && typeof monthlyFee === "object") {
    return { error: monthlyFee.error };
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
    const ok =
      /^sc-domain:[a-z0-9.-]+$/i.test(siteUrl) ||
      /^https?:\/\/[^\s]+$/i.test(siteUrl);
    if (!ok) {
      return {
        error:
          'Search Console-property moet "sc-domain:voorbeeld.be" of "https://voorbeeld.be/" zijn.',
      };
    }
  }

  // Bing Webmaster site must be a full URL-prefix property (https://...). Bing
  // has no "sc-domain:" concept, so reject anything that isn't an http(s) URL.
  const bingRaw = values.bingSiteUrl;
  if (bingRaw && !/^https?:\/\/[^\s]+$/i.test(bingRaw)) {
    return {
      error:
        'Bing Webmaster-site moet de volledige URL zijn, bv. "https://voorbeeld.be/".',
    };
  }

  // GA4 property id is numeric (optionally with a "properties/" prefix). Reject
  // anything else early so a typo never reaches the GA4 Data API.
  const ga4Raw = values.ga4PropertyId;
  if (ga4Raw) {
    const bare = ga4Raw.replace(/^properties\//i, "");
    if (!/^\d{6,}$/.test(bare)) {
      return {
        error: "GA4 property-id moet numeriek zijn (bv. 123456789).",
      };
    }
  }

  // BTW-modus is een keuzeveld: enkel "btw_21" (21%) of "verlegd" (reverse
  // charge) is geldig. Leeg laat de factuurroute de modus afleiden uit het
  // btw-nummer.
  const btwRaw = values.btwMode;
  if (btwRaw && btwRaw !== "btw_21" && btwRaw !== "verlegd") {
    return { error: 'BTW-modus moet "btw_21" of "verlegd" zijn.' };
  }

  return { name, groupId, monthlyFee, values };
}

router.get("/clients", async (_req, res) => {
  const rows = await db.select().from(clientsTable).orderBy(clientsTable.name);
  res.json({ clients: rows.map(serialize) });
});

/**
 * Cheap coverage / gap overview: for every client, which integrations have a
 * config key set and when each was last refreshed. Pure read of the rows we
 * already hold — no external API calls — so the UI can render an at-a-glance
 * matrix and decide what still needs filling or refreshing.
 */
router.get("/clients/coverage", async (_req, res) => {
  const rows = await db.select().from(clientsTable).orderBy(clientsTable.name);

  const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
  const has = (v: string | null): boolean => !!v && v.trim().length > 0;

  const clients = rows.map((c) => ({
    id: c.id,
    name: c.name,
    integrations: {
      googleAds: {
        configured: has(c.googleAdsCustomerId),
        liveAt: iso(c.googleAdsLiveAt),
      },
      competitorAds: {
        configured: has(c.competitorAdvertisers),
        liveAt: iso(c.competitorAdsLiveAt),
      },
      searchConsole: {
        configured: has(c.searchConsoleSiteUrl),
        liveAt: iso(c.searchConsoleLiveAt),
      },
      bing: { configured: has(c.bingSiteUrl), liveAt: iso(c.bingLiveAt) },
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
 * Revenue overview (read-only): the agency's monthly-fee total versus the goal,
 * plus a per-client breakdown so the dashboard can show "aan hoeveel zitten we
 * deze maand" in één oogopslag. Pure read of the fees we already hold — no
 * external calls. A null fee means "nog niet ingevuld" and counts as €0.
 */
router.get("/clients/revenue", async (_req, res) => {
  const rows = await db
    .select({
      id: clientsTable.id,
      name: clientsTable.name,
      monthlyFee: clientsTable.monthlyFee,
    })
    .from(clientsTable)
    .orderBy(clientsTable.name);

  const clients = rows.map((c) => ({
    id: c.id,
    name: c.name,
    monthlyFeeEur: c.monthlyFee ?? null,
  }));
  const clientFeeEur = clients.reduce(
    (sum, c) => sum + (c.monthlyFeeEur ?? 0),
    0,
  );
  const withFeeCount = clients.filter((c) => (c.monthlyFeeEur ?? 0) > 0).length;

  // Klantgroepen (kapstok) can carry their own fee — e.g. LCS, billed at group
  // level instead of per fiche. Only fee-bearing groups are surfaced; the total
  // is client fees + group fees. (Don't set both a group fee and member-fiche
  // fees for the same relationship, or it double-counts.)
  const groupRows = await db
    .select({
      id: clientGroupsTable.id,
      name: clientGroupsTable.name,
      monthlyFee: clientGroupsTable.monthlyFee,
    })
    .from(clientGroupsTable)
    .orderBy(clientGroupsTable.name);

  const groups = groupRows
    .filter((g) => (g.monthlyFee ?? 0) > 0)
    .map((g) => ({
      id: g.id,
      name: g.name,
      monthlyFeeEur: g.monthlyFee as number,
    }));
  const groupFeeEur = groups.reduce((sum, g) => sum + g.monthlyFeeEur, 0);

  res.json({
    goalEur: MONTHLY_REVENUE_GOAL_EUR,
    totalMonthlyFeeEur: clientFeeEur + groupFeeEur,
    clientCount: clients.length,
    withFeeCount,
    clients,
    groups,
  });
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
      .values({
        name: parsed.name,
        groupId: parsed.groupId,
        monthlyFee: parsed.monthlyFee,
        ...parsed.values,
      })
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
  const expectedRaw = asTrimmed(
    (req.body as Record<string, unknown>)?.updatedAt,
  );
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
        monthlyFee: parsed.monthlyFee,
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
