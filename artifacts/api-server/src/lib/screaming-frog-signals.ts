/**
 * Screaming Frog crawl signals — pure, read-only diagnostics derived only from a
 * technical crawl export the user already produced on their licensed Screaming
 * Frog SEO Spider. No new crawl is run here and no numbers are invented: every
 * signal is grounded in real rows from the export, so it is safe to surface
 * directly to the agents as observations.
 *
 * The goal is to turn a raw "Internal: All" CSV into a few sharp Dutch
 * observations about a client's technical SEO health (broken links, missing or
 * duplicate titles/descriptions, missing H1s, indexability, redirect
 * chains/loops, slow/large pages) — the checks the user picked.
 *
 * This module is split in two pure steps so both are independently testable:
 *   records -> computeCrawlStats -> CrawlStats
 *   CrawlStats -> computeCrawlSignals -> CrawlSignal[]
 */

export type CrawlSignalSeverity = "high" | "warning" | "info";

export interface CrawlSignal {
  severity: CrawlSignalSeverity;
  /** Stable machine code (handy for tests / future filtering). */
  code: string;
  /** Dutch, human-readable observation for the agent + reviewer. */
  message: string;
}

/** One normalized row from a Screaming Frog crawl export. */
export interface CrawlRecord {
  /** Crawled URL (Address). */
  url: string;
  /** HTTP status code (0 when unknown). */
  statusCode: number;
  /** Lower-cased content type ("" when unknown). */
  contentType: string;
  /** Whether SF marked the URL as Indexable. */
  indexable: boolean;
  /** SF "Indexability Status" (e.g. "Noindex", "Canonicalised"). */
  indexabilityStatus: string;
  /** First page title ("" when missing). */
  title: string;
  /** First meta description ("" when missing). */
  metaDescription: string;
  /** First H1 ("" when missing). */
  h1: string;
  /** Server response time in milliseconds (0 when unknown). */
  responseTimeMs: number;
  /** HTML transfer size in bytes (0 when unknown). */
  sizeBytes: number;
  /** Redirect target for 3xx URLs ("" when none). */
  redirectUrl: string;
}

/** Aggregated, normalized counts from one crawl. All counts are >= 0. */
export interface CrawlStats {
  /** Total URLs in the export. */
  totalUrls: number;
  /** URLs returning a 4xx (broken links / client errors). */
  clientErrors: number;
  /** URLs returning a 5xx (server errors). */
  serverErrors: number;
  /** URLs returning a 3xx (redirects). */
  redirects: number;
  /** Redirect chains (>= 2 hops, no loop) starting at a 3xx URL. */
  redirectChains: number;
  /** Redirect loops (a cycle) starting at a 3xx URL. */
  redirectLoops: number;
  /** Indexable HTML 200 URLs missing a title. */
  missingTitles: number;
  /** Groups of indexable HTML 200 URLs sharing the same title (>1 each). */
  duplicateTitles: number;
  /** Indexable HTML 200 URLs missing a meta description. */
  missingMetaDescriptions: number;
  /** Groups of indexable HTML 200 URLs sharing the same meta description. */
  duplicateMetaDescriptions: number;
  /** Indexable HTML 200 URLs missing an H1. */
  missingH1: number;
  /** HTML 200 URLs that are not indexable (noindex / canonicalised away). */
  nonIndexable: number;
  /** URLs whose response time exceeds the slow threshold. */
  slowPages: number;
  /** HTML URLs whose size exceeds the large threshold. */
  largePages: number;
}

export interface CrawlSignalThresholds {
  /** At/above this many 4xx URLs the issue is a hard problem, not a warning. */
  clientErrorsHigh: number;
  /** At/above this many missing titles the issue is a hard problem. */
  missingTitlesHigh: number;
  /** At/above this many missing meta descriptions the issue is a hard problem. */
  missingMetaHigh: number;
  /** At/above this many missing H1s the issue is a hard problem. */
  missingH1High: number;
  /** Response time (ms) above which a page counts as slow. */
  slowPageMs: number;
  /** HTML size (bytes) above which a page counts as large. */
  largePageBytes: number;
}

export const DEFAULT_CRAWL_THRESHOLDS: CrawlSignalThresholds = {
  clientErrorsHigh: 10,
  missingTitlesHigh: 10,
  missingMetaHigh: 25,
  missingH1High: 25,
  slowPageMs: 1000,
  largePageBytes: 1_500_000,
};

function normUrl(u: string): string {
  return u.trim();
}

/** Count groups of values that occur more than once (case-insensitive). */
function countDuplicateGroups(values: string[]): number {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let groups = 0;
  for (const n of counts.values()) if (n > 1) groups += 1;
  return groups;
}

/**
 * Aggregate normalized crawl records into counts. Pure and deterministic.
 * Content checks (titles/descriptions/H1/indexability) are scoped to HTML 200
 * pages; status counts span every URL in the export.
 */
export function computeCrawlStats(
  records: CrawlRecord[],
  thresholds: Partial<CrawlSignalThresholds> = {},
): CrawlStats {
  const t = { ...DEFAULT_CRAWL_THRESHOLDS, ...thresholds };

  // If the export has no Content Type column at all, treat every row as HTML so
  // content checks still run instead of silently producing zeros.
  const anyContentType = records.some((r) => r.contentType.length > 0);
  const isHtml = (r: CrawlRecord): boolean =>
    anyContentType ? r.contentType.includes("html") : true;

  let clientErrors = 0;
  let serverErrors = 0;
  let redirects = 0;
  let slowPages = 0;
  let largePages = 0;

  for (const r of records) {
    if (r.statusCode >= 400 && r.statusCode < 500) clientErrors += 1;
    else if (r.statusCode >= 500 && r.statusCode < 600) serverErrors += 1;
    else if (r.statusCode >= 300 && r.statusCode < 400) redirects += 1;
    if (r.responseTimeMs >= t.slowPageMs) slowPages += 1;
    if (isHtml(r) && r.sizeBytes >= t.largePageBytes) largePages += 1;
  }

  // Redirect chains/loops: follow each 3xx URL through the redirect map built
  // from the export itself (targets are usually in the same crawl).
  const redirectMap = new Map<string, string>();
  for (const r of records) {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.redirectUrl.trim()) {
      redirectMap.set(normUrl(r.url), normUrl(r.redirectUrl));
    }
  }
  let redirectChains = 0;
  let redirectLoops = 0;
  for (const start of redirectMap.keys()) {
    const visited = new Set<string>();
    let cur = start;
    let hops = 0;
    let loop = false;
    while (redirectMap.has(cur) && hops < 20) {
      if (visited.has(cur)) {
        loop = true;
        break;
      }
      visited.add(cur);
      cur = redirectMap.get(cur)!;
      hops += 1;
    }
    if (loop) redirectLoops += 1;
    else if (hops >= 2) redirectChains += 1;
  }

  const eligible = records.filter((r) => isHtml(r) && r.statusCode === 200);
  const indexableEligible = eligible.filter((r) => r.indexable);

  const missingTitles = indexableEligible.filter((r) => !r.title.trim()).length;
  const duplicateTitles = countDuplicateGroups(
    indexableEligible.map((r) => r.title),
  );
  const missingMetaDescriptions = indexableEligible.filter(
    (r) => !r.metaDescription.trim(),
  ).length;
  const duplicateMetaDescriptions = countDuplicateGroups(
    indexableEligible.map((r) => r.metaDescription),
  );
  const missingH1 = indexableEligible.filter((r) => !r.h1.trim()).length;
  const nonIndexable = eligible.filter((r) => !r.indexable).length;

  return {
    totalUrls: records.length,
    clientErrors,
    serverErrors,
    redirects,
    redirectChains,
    redirectLoops,
    missingTitles,
    duplicateTitles,
    missingMetaDescriptions,
    duplicateMetaDescriptions,
    missingH1,
    nonIndexable,
    slowPages,
    largePages,
  };
}

/**
 * Derive read-only diagnostic signals from aggregated crawl stats. Ordered by
 * severity (high first). Pure and deterministic.
 */
export function computeCrawlSignals(
  stats: CrawlStats,
  thresholds: Partial<CrawlSignalThresholds> = {},
): CrawlSignal[] {
  const t = { ...DEFAULT_CRAWL_THRESHOLDS, ...thresholds };
  const high: CrawlSignal[] = [];
  const warnings: CrawlSignal[] = [];
  const infos: CrawlSignal[] = [];

  if (stats.serverErrors > 0) {
    high.push({
      severity: "high",
      code: "crawl-server-errors",
      message:
        `${stats.serverErrors} pagina('s) geven een serverfout (5xx) — ` +
        `kritiek: deze zijn voor bezoekers en Google onbereikbaar.`,
    });
  }

  if (stats.clientErrors > 0) {
    const severe = stats.clientErrors >= t.clientErrorsHigh;
    (severe ? high : warnings).push({
      severity: severe ? "high" : "warning",
      code: "crawl-client-errors",
      message:
        `${stats.clientErrors} pagina('s) geven een 4xx-fout (zoals 404 broken links) — ` +
        `verspilt crawlbudget en schaadt de gebruikerservaring.`,
    });
  }

  if (stats.redirectLoops > 0) {
    high.push({
      severity: "high",
      code: "crawl-redirect-loops",
      message:
        `${stats.redirectLoops} redirect-loop(s) gedetecteerd — ` +
        `deze URL's komen nooit op een eindpagina uit.`,
    });
  }

  if (stats.redirectChains > 0) {
    warnings.push({
      severity: "warning",
      code: "crawl-redirect-chains",
      message:
        `${stats.redirectChains} redirect chain(s) met meerdere hops — ` +
        `vervang door één directe redirect.`,
    });
  }

  if (stats.missingTitles > 0) {
    const severe = stats.missingTitles >= t.missingTitlesHigh;
    (severe ? high : warnings).push({
      severity: severe ? "high" : "warning",
      code: "crawl-missing-titles",
      message: `${stats.missingTitles} indexeerbare pagina('s) missen een paginatitel.`,
    });
  }

  if (stats.duplicateTitles > 0) {
    warnings.push({
      severity: "warning",
      code: "crawl-duplicate-titles",
      message: `${stats.duplicateTitles} groep(en) pagina's delen dezelfde paginatitel.`,
    });
  }

  if (stats.missingMetaDescriptions > 0) {
    const severe = stats.missingMetaDescriptions >= t.missingMetaHigh;
    (severe ? high : warnings).push({
      severity: severe ? "high" : "warning",
      code: "crawl-missing-meta",
      message: `${stats.missingMetaDescriptions} indexeerbare pagina('s) missen een meta description.`,
    });
  }

  if (stats.duplicateMetaDescriptions > 0) {
    infos.push({
      severity: "info",
      code: "crawl-duplicate-meta",
      message: `${stats.duplicateMetaDescriptions} groep(en) pagina's delen dezelfde meta description.`,
    });
  }

  if (stats.missingH1 > 0) {
    const severe = stats.missingH1 >= t.missingH1High;
    (severe ? high : warnings).push({
      severity: severe ? "high" : "warning",
      code: "crawl-missing-h1",
      message: `${stats.missingH1} indexeerbare pagina('s) missen een H1.`,
    });
  }

  if (stats.slowPages > 0) {
    warnings.push({
      severity: "warning",
      code: "crawl-slow-pages",
      message:
        `${stats.slowPages} pagina('s) reageren traag (serverrespons boven ` +
        `${(t.slowPageMs / 1000).toFixed(1).replace(".", ",")}s).`,
    });
  }

  if (stats.nonIndexable > 0) {
    infos.push({
      severity: "info",
      code: "crawl-non-indexable",
      message:
        `${stats.nonIndexable} pagina('s) zijn niet-indexeerbaar (noindex of canonical) — ` +
        `controleer of dat bedoeld is.`,
    });
  }

  if (stats.largePages > 0) {
    infos.push({
      severity: "info",
      code: "crawl-large-pages",
      message:
        `${stats.largePages} HTML-pagina('s) zijn groot (boven ` +
        `${(t.largePageBytes / 1_000_000).toFixed(1).replace(".", ",")} MB).`,
    });
  }

  if (
    stats.totalUrls > 0 &&
    high.length === 0 &&
    warnings.length === 0
  ) {
    infos.push({
      severity: "info",
      code: "crawl-healthy",
      message:
        `Geen technische crawl-problemen gevonden over ${stats.totalUrls} URL('s) — ` +
        `titels, descriptions, H1's, indexability en redirects zijn in orde.`,
    });
  }

  return [...high, ...warnings, ...infos];
}

/** Render signals as a compact Dutch markdown block, or "" if none. */
export function renderCrawlSignals(signals: CrawlSignal[]): string {
  if (signals.length === 0) return "";
  const icon: Record<CrawlSignalSeverity, string> = {
    high: "[!]",
    warning: "[~]",
    info: "[i]",
  };
  return signals.map((s) => `${icon[s.severity]} ${s.message}`).join("\n");
}
