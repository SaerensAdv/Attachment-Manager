import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, clientsTable, type Client } from "@workspace/db";
import {
  collectClientUrls,
  fetchWebsiteIntake,
} from "../lib/website-intake";
import { fetchGoogleAdsReport, GoogleAdsConfigError } from "../lib/google-ads";
import { renderSnapshotPdf } from "../lib/snapshot-pdf";
import {
  buildAuditDataForRow,
  buildQbrDataForRow,
  generateDeckForRow,
  type DeckKind,
} from "../lib/deck-generation";
import { fetchCompetitorAds, SerpApiConfigError } from "../lib/serpapi";
import {
  fetchSearchConsoleReport,
  SearchConsoleConfigError,
} from "../lib/search-console";
import { fetchBingReport, BingConfigError } from "../lib/bing-webmaster";
import { fetchGa4Report, Ga4ConfigError } from "../lib/ga4";
import { fetchPlacesReport, PlacesConfigError } from "../lib/places";
import { fetchPageSpeedReport, PageSpeedConfigError } from "../lib/pagespeed";
import {
  fetchBusinessProfileReport,
  BusinessProfileConfigError,
} from "../lib/business-profile";
import { GoogleOAuthConfigError } from "../lib/google-oauth";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  buildBriefingContext,
  buildBriefingPrompt,
  parseBriefingJson,
} from "../lib/briefing-suggest";
import { summarizeCrawl } from "../lib/screaming-frog";
import { recordSnapshot, listSnapshots } from "../lib/crawl-history";
import { parseId, serialize, resolvePagespeedUrls } from "./clients-shared";

const router: IRouter = Router();

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

/**
 * One-page, branded "snapshot" PDF of the client's live Google Ads numbers.
 * Read-only: pulls fresh metrics (last 30 days) and renders them — nothing is
 * written to Google or the DB. Returned inline so the browser can preview or
 * save it. Mirrors the live-fetch route's error handling.
 */
router.get("/clients/:id/snapshot.pdf", async (req, res) => {
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
    const dateLabel = new Intl.DateTimeFormat("nl-BE", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Brussels",
    }).format(new Date());
    const pdf = await renderSnapshotPdf({
      clientName: row.name,
      dateLabel,
      metrics: report.metrics,
    });
    const slug =
      row.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "klant";
    res.status(200);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(pdf.length));
    res.setHeader(
      "Content-Disposition",
      `inline; filename="snapshot-${slug}.pdf"`,
    );
    res.end(pdf);
  } catch (err) {
    if (err instanceof GoogleAdsConfigError) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(502).json({
      error: "Kon de snapshot niet opstellen.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * Typed, read-only data contract for the Google Ads audit deck (T7).
 *
 * Pulls two periods of live metrics — current year-to-date (B) vs the same
 * range a year earlier (A), both anchored on Europe/Brussels — and returns a
 * fully nl-BE-formatted `AuditData` object. The deck generator
 * (scripts/generate-audit-deck.ts) consumes this and bakes the values into a
 * cloned, STATIC slide deck; nothing is written here. Mirrors the snapshot.pdf
 * live-fetch error handling.
 */
router.get("/clients/:id/audit-data.json", async (req, res) => {
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

  try {
    const data = await buildAuditDataForRow(row);
    res.status(200).json(data);
  } catch (err) {
    if (err instanceof GoogleAdsConfigError) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(502).json({
      error: "Kon de audit-data niet opstellen.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * Typed, read-only data contract for the Google Ads QBR (kwartaalrapportage)
 * deck (T6).
 *
 * Pulls THREE periods of live metrics — the last FULL quarter (Q), the quarter
 * before it (QoQ baseline) and the same quarter a year earlier (YoY baseline),
 * all anchored on Europe/Brussels — and returns a fully nl-BE-formatted
 * `QbrData` object. The deck generator (scripts/generate-qbr-deck.ts) consumes
 * this and bakes the values into a cloned, STATIC slide deck; nothing is written
 * here. Mirrors the audit-data live-fetch error handling. Targets/doelstellingen
 * are never derived — they stay human-filled in the deck.
 */
router.get("/clients/:id/qbr-data.json", async (req, res) => {
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

  try {
    const data = await buildQbrDataForRow(row);
    res.status(200).json(data);
  } catch (err) {
    if (err instanceof GoogleAdsConfigError) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(502).json({
      error: "Kon de kwartaaldata niet opstellen.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * Self-service deck generation: build a filled, STATIC audit- or QBR-deck for
 * one client from live Google Ads data and overlay it onto the shared demo
 * OUTPUT slot. Same pipeline as the generator scripts, but in-process so it can
 * be a one-click button. The deck is frozen at the reported numbers; the
 * durable deliverable is the PPTX/PDF export. Missing customer ID → 400.
 */
router.post("/clients/:id/generate-deck", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const kind = (req.body?.kind ?? "") as DeckKind;
  if (kind !== "audit" && kind !== "qbr") {
    res.status(400).json({
      error: "Kies een geldig deck-type: 'audit' of 'qbr'.",
    });
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

  try {
    const result = await generateDeckForRow({ kind, row });
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof GoogleAdsConfigError) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(502).json({
      error:
        kind === "audit"
          ? "Kon het audit-deck niet genereren."
          : "Kon het QBR-deck niet genereren.",
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

router.post("/clients/:id/bing-refresh", async (req, res) => {
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

  const siteUrl = (row.bingSiteUrl ?? "").trim();
  if (!siteUrl) {
    res.status(400).json({
      error:
        "Deze klant heeft nog geen Bing Webmaster-site. Vul de site-URL in (bv. https://voorbeeld.be/) en bewaar eerst.",
    });
    return;
  }

  try {
    const report = await fetchBingReport(siteUrl);
    const [updated] = await db
      .update(clientsTable)
      .set({
        bingLive: report.text,
        bingLiveAt: report.fetchedAt,
        updatedAt: new Date(),
      })
      .where(eq(clientsTable.id, id))
      .returning();
    res.json(serialize(updated));
  } catch (err) {
    if (err instanceof BingConfigError) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(502).json({
      error: "Kon Bing Webmaster niet uitlezen.",
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
      error: "Lege export: voeg de Screaming Frog CSV ('Internal: All') toe.",
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

  // Keep a point in the history so months can be compared. Best-effort: a
  // failure here must not undo the upload (the latest crawl is already stored).
  await recordSnapshot(id, summary.fetchedAt, summary.stats);

  res.json(serialize(updated));
});

// Crawl history for a client: one snapshot per crawl day, newest first, used by
// the upload page to compare technical SEO month over month.
router.get("/clients/:id/crawl-snapshots", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const snapshots = await listSnapshots(id);
  res.json({
    snapshots: snapshots.map((s) => ({
      id: s.id,
      clientId: s.clientId,
      crawledAt: s.crawledAt.toISOString(),
      stats: s.stats,
    })),
  });
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
      outcomes.push({
        integration,
        status: "skipped",
        detail: "geen koppeling ingesteld",
      });
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
    "bing",
    (row.bingSiteUrl ?? "").trim().length > 0,
    async () => {
      const report = await fetchBingReport((row.bingSiteUrl ?? "").trim());
      updates.bingLive = report.text;
      updates.bingLiveAt = report.fetchedAt;
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

export default router;
