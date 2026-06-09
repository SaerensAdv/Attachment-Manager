/**
 * Screaming Frog crawl intake — the app side of the "Model B" bridge.
 *
 * The agency runs Screaming Frog SEO Spider (a licensed desktop crawler) on
 * their own machine and exports a crawl as CSV. A small push uploads that CSV to
 * the secret-authed intake endpoint; this module parses the export, turns it
 * into a few sharp Dutch observations (grounded only in real rows — nothing is
 * invented), and renders a compact report that gets stored on the client record
 * and read by the agents, exactly like the other live-data fields.
 *
 * The expected export is Screaming Frog's "Internal: All" tab as CSV, which
 * carries every field we need per URL (status code, indexability, title, meta
 * description, H1, response time, size, redirect target). Column matching is
 * tolerant so minor SF version differences don't break intake.
 */

import {
  computeCrawlSignals,
  computeCrawlStats,
  renderCrawlSignals,
  type CrawlRecord,
  type CrawlStats,
} from "./screaming-frog-signals";

const MAX_REPORT_LEN = 20_000;

/**
 * Parse CSV text into rows of string cells. Handles quoted fields, escaped
 * quotes (""), commas and newlines inside quotes, and both CRLF and LF. Pure.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  // Strip a UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  const pushField = (): void => {
    row.push(field);
    field = "";
  };
  const pushRow = (): void => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      pushRow();
    } else if (c === "\r") {
      // swallow; the following \n (if any) triggers the row push
    } else {
      field += c;
    }
  }
  // Flush trailing field/row unless the input ended exactly on a newline.
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

/**
 * Parse a numeric cell tolerantly across locales. Screaming Frog exports in the
 * user's system locale, so a Belgian/Dutch machine writes decimals with a comma
 * ("0,41") and may group thousands with a dot ("1.234"). We normalise both the
 * US ("1,234.56") and EU ("1.234,56") conventions to a plain JS number so speed
 * and size signals stay correct regardless of where the crawl was run.
 */
function num(value: string | undefined): number {
  if (!value) return 0;
  let s = value.replace(/[^0-9.,\-]/g, "");
  if (!s) return 0;
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  if (dots && commas) {
    // Both separators present: the one that appears last is the decimal point,
    // the other is thousands grouping ("1.234,56" EU vs "1,234.56" US).
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(/,/g, ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (commas) {
    // Commas only: a single comma is a decimal separator ("0,412"); several are
    // thousands grouping ("1,234,567").
    s = commas === 1 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (dots > 1) {
    // Several dots can only be EU thousands grouping ("1.234.567").
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Build a tolerant header -> index lookup from the CSV header row. */
function indexHeaders(header: string[]): Map<string, number> {
  const map = new Map<string, number>();
  header.forEach((h, i) => {
    const key = h.trim().toLowerCase();
    if (key && !map.has(key)) map.set(key, i);
  });
  return map;
}

/** Find the column index for the first header that matches any candidate. */
function col(headers: Map<string, number>, candidates: string[]): number {
  for (const cand of candidates) {
    const want = cand.toLowerCase();
    for (const [key, idx] of headers) {
      if (key === want || key.startsWith(want)) return idx;
    }
  }
  return -1;
}

/**
 * Parse a Screaming Frog "Internal: All" CSV export into normalized records.
 * Unknown columns are tolerated; missing values become empty/zero. Pure.
 */
export function parseCrawlCsv(csv: string): CrawlRecord[] {
  const rows = parseCsv(csv);
  if (rows.length < 2) return [];
  const headers = indexHeaders(rows[0]);

  const cAddress = col(headers, ["address", "url"]);
  // "indexability status" must be excluded when resolving plain "indexability".
  const cIndexabilityStatus = col(headers, ["indexability status"]);
  let cIndexability = col(headers, ["indexability"]);
  if (cIndexability === cIndexabilityStatus) cIndexability = -1;
  const cStatusCode = col(headers, ["status code"]);
  const cContentType = col(headers, ["content type", "content"]);
  const cTitle = col(headers, ["title 1", "title"]);
  const cMeta = col(headers, ["meta description 1", "meta description"]);
  const cH1 = col(headers, ["h1-1", "h1-1 ", "h1"]);
  const cResponse = col(headers, ["response time"]);
  const cSize = col(headers, ["size (bytes)", "size"]);
  const cRedirect = col(headers, ["redirect url", "redirect uri"]);

  if (cAddress === -1) return [];

  const cell = (r: string[], idx: number): string =>
    idx >= 0 && idx < r.length ? r[idx].trim() : "";

  const records: CrawlRecord[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i];
    const url = cell(r, cAddress);
    if (!url) continue;
    const indexabilityRaw = cell(r, cIndexability).toLowerCase();
    // SF "Response Time" is in seconds; normalize to milliseconds.
    const responseSeconds = num(cell(r, cResponse));
    records.push({
      url,
      statusCode: Math.round(num(cell(r, cStatusCode))),
      contentType: cell(r, cContentType).toLowerCase(),
      indexable: indexabilityRaw === "indexable",
      indexabilityStatus: cell(r, cIndexabilityStatus),
      title: cell(r, cTitle),
      metaDescription: cell(r, cMeta),
      h1: cell(r, cH1),
      responseTimeMs: Math.round(responseSeconds * 1000),
      sizeBytes: Math.round(num(cell(r, cSize))),
      redirectUrl: cell(r, cRedirect),
    });
  }
  return records;
}

function fmtInt(n: number): string {
  return n.toLocaleString("nl-BE");
}

/** Render a compact Dutch overview of the aggregated crawl stats. */
function renderOverview(stats: CrawlStats): string {
  const lines = [
    "== Technische crawl (Screaming Frog) ==",
    `- URL's gecrawld: ${fmtInt(stats.totalUrls)}`,
    `- Statuscodes: ${fmtInt(stats.clientErrors)}x 4xx, ${fmtInt(stats.serverErrors)}x 5xx, ${fmtInt(stats.redirects)}x 3xx`,
    `- Titels: ${fmtInt(stats.missingTitles)} ontbrekend, ${fmtInt(stats.duplicateTitles)} dubbele groep(en)`,
    `- Meta descriptions: ${fmtInt(stats.missingMetaDescriptions)} ontbrekend, ${fmtInt(stats.duplicateMetaDescriptions)} dubbele groep(en)`,
    `- H1: ${fmtInt(stats.missingH1)} ontbrekend`,
    `- Niet-indexeerbaar: ${fmtInt(stats.nonIndexable)}`,
    `- Redirect chains: ${fmtInt(stats.redirectChains)}, loops: ${fmtInt(stats.redirectLoops)}`,
    `- Trage pagina's: ${fmtInt(stats.slowPages)}, grote pagina's: ${fmtInt(stats.largePages)}`,
  ];
  return lines.join("\n");
}

export interface CrawlSummary {
  /** Rendered Dutch report (overview + signals), ready to store on the client. */
  text: string;
  /** When the crawl was produced (caller-supplied) or received. */
  fetchedAt: Date;
  records: CrawlRecord[];
  stats: CrawlStats;
}

/**
 * Parse a Screaming Frog CSV export and summarize it into a stored report plus
 * signals. Best-effort: an empty/unparseable export yields a clear note instead
 * of throwing, so a bad upload never breaks a client's profile.
 */
export function summarizeCrawl(
  csv: string,
  opts: { crawledAt?: Date } = {},
): CrawlSummary {
  const fetchedAt = opts.crawledAt ?? new Date();
  const records = parseCrawlCsv(csv);
  const stats = computeCrawlStats(records);

  if (records.length === 0) {
    return {
      text: "Geen bruikbare crawl-data in de export (verwacht een Screaming Frog 'Internal: All' CSV).",
      fetchedAt,
      records,
      stats,
    };
  }

  const signals = computeCrawlSignals(stats);
  const rendered = renderCrawlSignals(signals);

  const parts = [renderOverview(stats)];
  if (rendered) {
    parts.push("", "== Signalen ==", rendered);
  }

  let text = parts.join("\n").trim();
  if (text.length > MAX_REPORT_LEN) {
    text = text.slice(0, MAX_REPORT_LEN) + "\n…(ingekort)";
  }

  return { text, fetchedAt, records, stats };
}
