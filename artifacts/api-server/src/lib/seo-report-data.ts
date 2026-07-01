/**
 * SEO / website results report — data assembly (READ ONLY).
 *
 * The Ads monthly report has its own pipeline (`buildMonthlyPeriods` +
 * `fetchGoogleAdsReport`). This is the parallel pipeline for the recurring SEO /
 * website report: it resolves the calendar periods to compare and pulls a
 * best-effort snapshot from each organic source — Google Search Console
 * (primary, with real period-over-period + year-over-year deltas), the latest
 * technical crawl snapshot, PageSpeed (current-state) and Bing (a small optional
 * signal).
 *
 * Everything here is best-effort: a failing source is turned into a note and
 * never throws, so the generation run always finishes. The returned `metrics`
 * are JSON-serializable and drive the branded PDF cover; the `blocks` are the
 * Dutch, labelled text injected into the client doc so the team reasons over
 * real, period-correct numbers instead of guessing.
 */

import { fetchSearchConsoleReport } from "./search-console";
import type { SearchConsoleReport, SearchConsoleRow } from "./search-console";
import { fetchBingReport } from "./bing-webmaster";
import { fetchPageSpeedReport } from "./pagespeed";
import { listSnapshots } from "./crawl-history";
import type { CrawlStats } from "./screaming-frog-signals";

/** The two supported reporting rhythms; resolved from the workflow chosen. */
export type SeoReportCadence = "monthly" | "quarterly";

/** One inclusive reporting window with a human-readable Dutch label. */
export interface SeoReportPeriod {
  /** Inclusive start, YYYY-MM-DD. */
  startDate: string;
  /** Inclusive end, YYYY-MM-DD. */
  endDate: string;
  /** e.g. "mei 2026" (monthly) or "Q2 2026" (quarterly). */
  label: string;
}

/** The report period plus its two comparison windows. */
export interface SeoReportPeriods {
  /** The period the report covers (the last completed month/quarter). */
  current: SeoReportPeriod;
  /** The immediately preceding period (period-over-period). */
  previous: SeoReportPeriod;
  /** The same period one year earlier (year-over-year). */
  yearAgo: SeoReportPeriod;
}

/** Organic search totals for one period (CTR is a fraction 0..1). */
export interface SeoSearchTotals {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/**
 * The structured, JSON-serializable snapshot that drives the PDF cover + email
 * KPI block. Built only when Search Console current data is available; the
 * crawl / pagespeed / bing sub-parts are each independently nullable.
 */
export interface SeoReportMetrics {
  siteUrl: string;
  cadence: SeoReportCadence;
  periodLabel: string;
  previousLabel: string;
  yearAgoLabel: string;
  search: {
    current: SeoSearchTotals;
    previous: SeoSearchTotals | null;
    yearAgo: SeoSearchTotals | null;
    /** Top organic queries this period (for the PDF bar chart). */
    topQueries: {
      key: string;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }[];
  };
  crawl: {
    crawledAt: string;
    totalUrls: number;
    clientErrors: number;
    serverErrors: number;
    missingTitles: number;
    missingMetaDescriptions: number;
    missingH1: number;
    nonIndexable: number;
    slowPages: number;
  } | null;
  pagespeed: {
    url: string;
    strategy: "mobile" | "desktop";
    performanceScore: number;
    lcpMs: number;
    cls: number;
  } | null;
  bing: {
    clicks: number;
    impressions: number;
  } | null;
}

/** The client fields this pipeline reads. Structural so tests need no full row. */
export interface SeoReportClient {
  searchConsoleSiteUrl?: string | null;
  bingSiteUrl?: string | null;
  website?: string | null;
  landingPages?: string | null;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The Brussels-local (year, 1-based month) for `base`, so a run in the first
 * hours of a month still resolves to the correct completed period (UTC could
 * still read the prior month at 00:30 Brussels on the 1st). */
function brusselsYearMonth(base: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(base);
  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
  };
}

/** A calendar month window from a 0-based month index (which may be <0 or >11;
 * Date normalizes it into the right year). */
function monthPeriod(year: number, month0: number): SeoReportPeriod {
  const start = new Date(Date.UTC(year, month0, 1));
  const end = new Date(Date.UTC(year, month0 + 1, 0));
  const label = start.toLocaleDateString("nl-BE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return { startDate: isoDay(start), endDate: isoDay(end), label };
}

/** A calendar quarter window from a quarter serial (year*4 + q, q in 0..3). */
function quarterPeriod(serial: number): SeoReportPeriod {
  const year = Math.floor(serial / 4);
  const q = ((serial % 4) + 4) % 4;
  const start = new Date(Date.UTC(year, q * 3, 1));
  const end = new Date(Date.UTC(year, q * 3 + 3, 0));
  return {
    startDate: isoDay(start),
    endDate: isoDay(end),
    label: `Q${q + 1} ${year}`,
  };
}

/**
 * Resolve the three windows the report compares. The report covers the LAST
 * COMPLETED period relative to `base` (so a run on the 1st reports the month/
 * quarter that just ended), with the preceding period (PoP) and the same period
 * one year earlier (YoY). Anchored on Europe/Brussels.
 */
export function buildSeoReportPeriods(
  base: Date,
  cadence: SeoReportCadence,
): SeoReportPeriods {
  const { year, month } = brusselsYearMonth(base);
  if (cadence === "quarterly") {
    // Current calendar quarter (0..3) → the report covers the previous quarter.
    const currentQ = Math.floor((month - 1) / 3);
    const reportSerial = year * 4 + currentQ - 1;
    return {
      current: quarterPeriod(reportSerial),
      previous: quarterPeriod(reportSerial - 1),
      yearAgo: quarterPeriod(reportSerial - 4),
    };
  }
  // Monthly: report the previous calendar month. `month` is 1-based, so the
  // previous month is index `month - 2` (0-based); Date normalizes underflow.
  const rm = month - 2;
  return {
    current: monthPeriod(year, rm),
    previous: monthPeriod(year, rm - 1),
    yearAgo: monthPeriod(year - 1, rm),
  };
}

function msg(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 200);
}

/** Wrap a source's raw text as a clearly-labelled Dutch block for the team. */
function labelledBlock(
  heading: string,
  period: SeoReportPeriod | null,
  text: string,
): string {
  const range = period
    ? ` — ${period.label} (${period.startDate} t.e.m. ${period.endDate})`
    : "";
  return `## ${heading}${range}\n\n\`\`\`\n${text.trim()}\n\`\`\`\n`;
}

function totalsOf(report: SearchConsoleReport): SeoSearchTotals {
  return {
    clicks: report.totals.clicks,
    impressions: report.totals.impressions,
    ctr: report.totals.ctr,
    position: report.totals.position,
  };
}

function topQueriesOf(
  rows: SearchConsoleRow[],
): SeoReportMetrics["search"]["topQueries"] {
  return rows.slice(0, 8).map((r) => ({
    key: r.key,
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
}

/**
 * Assemble the SEO report snapshot for one client. Best-effort per source:
 * every failure becomes a note, nothing throws. `metrics` is populated only when
 * the Search Console current period succeeds (it drives the PDF's KPI cover);
 * the crawl / pagespeed / bing detail is always added to `blocks` regardless, so
 * the client doc stays complete even without a verified SC property.
 */
export async function fetchSeoReportSnapshot(
  client: SeoReportClient,
  clientId: number | null,
  cadence: SeoReportCadence,
  periods: SeoReportPeriods,
  opts: { now?: number } = {},
): Promise<{ blocks: string[]; metrics: SeoReportMetrics | null; notes: string[] }> {
  const now = opts.now ?? Date.now();
  const blocks: string[] = [];
  const notes: string[] = [];
  let metrics: SeoReportMetrics | null = null;

  // --- Google Search Console (primary; three completed windows) -------------
  const scSite = (client.searchConsoleSiteUrl ?? "").trim();
  if (scSite) {
    let current: SearchConsoleReport | null = null;
    try {
      const cur = await fetchSearchConsoleReport(scSite, {
        now,
        dateRange: {
          startDate: periods.current.startDate,
          endDate: periods.current.endDate,
        },
      });
      current = cur.report;
      blocks.push(
        labelledBlock(
          "Search Console — organische zoekprestaties (rapportperiode)",
          periods.current,
          cur.text,
        ),
      );
    } catch (err) {
      notes.push(
        `Search Console-data (rapportperiode) kon niet opgehaald worden: ${msg(err)}`,
      );
    }

    if (current) {
      let previous: SeoSearchTotals | null = null;
      let yearAgo: SeoSearchTotals | null = null;

      // Previous period (PoP) — best-effort.
      try {
        const prev = await fetchSearchConsoleReport(scSite, {
          now,
          dateRange: {
            startDate: periods.previous.startDate,
            endDate: periods.previous.endDate,
          },
        });
        previous = totalsOf(prev.report);
        blocks.push(
          labelledBlock(
            "Search Console — vorige periode (vergelijking)",
            periods.previous,
            prev.text,
          ),
        );
      } catch (err) {
        notes.push(
          `Vergelijkingsdata vorige periode (${periods.previous.label}) kon niet opgehaald worden: ${msg(err)}`,
        );
      }

      // Same period last year (YoY) — best-effort.
      try {
        const ya = await fetchSearchConsoleReport(scSite, {
          now,
          dateRange: {
            startDate: periods.yearAgo.startDate,
            endDate: periods.yearAgo.endDate,
          },
        });
        yearAgo = totalsOf(ya.report);
        blocks.push(
          labelledBlock(
            "Search Console — zelfde periode vorig jaar (vergelijking)",
            periods.yearAgo,
            ya.text,
          ),
        );
      } catch (err) {
        notes.push(
          `Jaar-op-jaar data (${periods.yearAgo.label}) kon niet opgehaald worden: ${msg(err)}`,
        );
      }

      metrics = {
        siteUrl: current.siteUrl,
        cadence,
        periodLabel: periods.current.label,
        previousLabel: periods.previous.label,
        yearAgoLabel: periods.yearAgo.label,
        search: {
          current: totalsOf(current),
          previous,
          yearAgo,
          topQueries: topQueriesOf(current.topQueries),
        },
        crawl: null,
        pagespeed: null,
        bing: null,
      };
    }
  } else {
    notes.push(
      "Geen Search Console-property ingesteld voor deze klant; organische zoekdata ontbreekt in dit rapport.",
    );
  }

  // --- Technical crawl health (latest snapshot) ----------------------------
  if (clientId !== null) {
    try {
      const snaps = await listSnapshots(clientId);
      if (snaps.length > 0) {
        const latest = snaps[0]; // listSnapshots is newest-first
        const s: CrawlStats = latest.stats;
        blocks.push(
          labelledBlock(
            `Technische crawl (laatste crawl: ${isoDay(latest.crawledAt)})`,
            null,
            renderCrawlText(s),
          ),
        );
        if (metrics) {
          metrics.crawl = {
            crawledAt: latest.crawledAt.toISOString(),
            totalUrls: s.totalUrls,
            clientErrors: s.clientErrors,
            serverErrors: s.serverErrors,
            missingTitles: s.missingTitles,
            missingMetaDescriptions: s.missingMetaDescriptions,
            missingH1: s.missingH1,
            nonIndexable: s.nonIndexable,
            slowPages: s.slowPages,
          };
        }
      } else {
        notes.push(
          "Geen technische crawl beschikbaar voor deze klant; het rapport bevat geen crawl-gezondheid.",
        );
      }
    } catch (err) {
      notes.push(`Crawl-snapshot kon niet geladen worden: ${msg(err)}`);
    }
  }

  // --- PageSpeed (current-state; homepage + first landing page) -------------
  const psUrls = pageSpeedUrls(client);
  if (psUrls.length > 0) {
    try {
      const ps = await fetchPageSpeedReport(psUrls, { strategy: "mobile" });
      if (ps.text.trim()) {
        blocks.push(
          labelledBlock("PageSpeed — sitesnelheid (mobiel, huidige staat)", null, ps.text),
        );
      }
      const found = ps.records.find((r) => r.found);
      if (metrics && found) {
        metrics.pagespeed = {
          url: found.url,
          strategy: found.strategy,
          performanceScore: found.performanceScore,
          lcpMs: found.lcpMs,
          cls: found.cls,
        };
      }
    } catch (err) {
      notes.push(`PageSpeed-data kon niet opgehaald worden: ${msg(err)}`);
    }
  }

  // --- Bing (optional small signal; current-state only) --------------------
  const bingSite = (client.bingSiteUrl ?? "").trim();
  if (bingSite) {
    try {
      const bing = await fetchBingReport(bingSite);
      if (bing.text.trim()) {
        blocks.push(
          labelledBlock(
            "Bing Webmaster — organische zoekprestaties (huidige staat)",
            null,
            bing.text,
          ),
        );
      }
      if (metrics) {
        metrics.bing = {
          clicks: bing.report.totals.clicks,
          impressions: bing.report.totals.impressions,
        };
      }
    } catch (err) {
      notes.push(`Bing-data kon niet opgehaald worden: ${msg(err)}`);
    }
  }

  return { blocks, metrics, notes };
}

/** A compact Dutch crawl-health summary from the stored stats. */
function renderCrawlText(s: CrawlStats): string {
  return [
    `URL's gecrawld: ${s.totalUrls}`,
    `Foutstatussen: ${s.clientErrors}x 4xx, ${s.serverErrors}x 5xx, ${s.redirects}x 3xx`,
    `Niet-indexeerbaar: ${s.nonIndexable}`,
    `Ontbrekende titels: ${s.missingTitles} · dubbele titelgroepen: ${s.duplicateTitles}`,
    `Ontbrekende meta descriptions: ${s.missingMetaDescriptions} · dubbele groepen: ${s.duplicateMetaDescriptions}`,
    `Ontbrekende H1: ${s.missingH1}`,
    `Trage pagina's: ${s.slowPages} · grote pagina's: ${s.largePages}`,
  ].join("\n");
}

/** The (max 2) URLs measured for PageSpeed: the homepage + first landing page. */
function pageSpeedUrls(client: SeoReportClient): string[] {
  const urls: string[] = [];
  const site = (client.website ?? "").trim();
  if (/^https?:\/\/\S+$/i.test(site)) urls.push(site);
  const first = (client.landingPages ?? "")
    .split(/[\n,]/)
    .map((u) => u.trim())
    .find((u) => /^https?:\/\/\S+$/i.test(u));
  if (first && !urls.includes(first)) urls.push(first);
  return urls;
}
