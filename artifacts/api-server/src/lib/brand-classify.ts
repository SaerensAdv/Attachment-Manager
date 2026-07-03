/**
 * Branded vs non-branded query classification — pure, deterministic, read-only.
 *
 * A recurring SEO report is far sharper when organic queries are split into
 * BRANDED (people already searching for this business — they'd likely find it
 * anyway) and NON-BRANDED (generic demand the SEO work actually captures). This
 * module is the reusable classifier behind that split: it derives brand tokens
 * from the client name + domain and augments them with a per-client editable
 * list, then labels each Search Console query.
 *
 * Design goals (predictability first — this feeds a client-facing metric):
 *  - Auto-derivation NEVER uses a single generic brand word ("icon", "beauty")
 *    as a standalone token; only the full glued name, the domain second-level
 *    label glued, and manual terms match by substring. Auto tokens under 4 chars
 *    are skipped.
 *  - Bounded, deterministic typo/word-order tolerance: the all-words rule passes
 *    when every word of the brand name appears in the query in any order, each
 *    matched exactly or within Levenshtein distance 1 (for words ≥5 chars). This
 *    catches "icon beauty almere", "beuty icon", "besuty icon" without turning a
 *    generic word into a false positive.
 *  - Anything the auto rules miss (colloquial variants like "icon almere") is
 *    handled by the editable per-client brand-terms list.
 */

import type { SearchConsoleRow } from "./search-console";

/** Lowercase, strip diacritics, keep only a–z/0–9 (glued, no separators). */
export function normalizeBrand(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Alphanumeric words (lowercased, diacritics stripped, separators dropped). */
function toWords(s: string): string[] {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Parse a brand-terms field (newline/comma text or array) into trimmed terms. */
export function toBrandTermList(
  v: string[] | string | null | undefined,
): string[] {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : v.split(/[\n,]/);
  return arr.map((t) => t.trim()).filter(Boolean);
}

/** The second-level domain label, glued (e.g. beauty-icon.nl → "beautyicon"). */
function domainLabel(raw: string): string {
  let v = (raw ?? "").trim().toLowerCase();
  if (!v) return "";
  v = v.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "");
  v = v.split(/[/?#]/)[0]; // hostname only
  const parts = v.split(".").filter(Boolean);
  if (parts.length < 2) return normalizeBrand(v);
  return normalizeBrand(parts[parts.length - 2]);
}

/** Derived matcher: glued substrings + the brand-name word set. */
export interface BrandTokens {
  /** Glued strings matched anywhere inside a normalized query. */
  glue: string[];
  /** Brand-name words for the all-words (any-order, fuzzy) rule. */
  wordSet: string[];
}

/**
 * Derive brand tokens from the client identity + the editable manual list.
 * `name`/`website`/`siteUrl` feed the auto tokens; `extraTerms` is the per-client
 * list (each term glued and matched by substring, so it can encode colloquial
 * variants and known typos the auto rules can't infer).
 */
export function deriveBrandTokens(input: {
  name?: string | null;
  website?: string | null;
  siteUrl?: string | null;
  extraTerms?: string[] | string | null;
}): BrandTokens {
  const glue = new Set<string>();

  // Auto: full glued client name (≥4 chars to avoid tiny generic tokens).
  const nameGlue = normalizeBrand(input.name ?? "");
  if (nameGlue.length >= 4) glue.add(nameGlue);

  // Auto: domain second-level label, from website or the SC property URL.
  const label =
    domainLabel(input.website ?? "") || domainLabel(input.siteUrl ?? "");
  if (label.length >= 4) glue.add(label);

  // Manual terms: glued substrings (≥3 chars). These are the escape hatch for
  // variants/typos/word-order the auto rules can't infer.
  for (const term of toBrandTermList(input.extraTerms)) {
    const g = normalizeBrand(term);
    if (g.length >= 3) glue.add(g);
  }

  // Word set for the all-words rule: the brand-name words (≥2 chars).
  const wordSet = Array.from(
    new Set(toWords(input.name ?? "").filter((w) => w.length >= 2)),
  );

  return { glue: Array.from(glue), wordSet };
}

/** True when derivation produced anything usable to classify with. */
export function hasBrandTokens(tokens: BrandTokens): boolean {
  return tokens.glue.length > 0 || tokens.wordSet.length > 0;
}

/** Bounded Levenshtein edit distance (early-exit at >1 is enough for our use). */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 1) return 2; // beyond our tolerance; short-circuit
  const prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + cost);
      diag = tmp;
    }
  }
  return prev[n];
}

/** A single brand-name word matches a query word (exact, or ≤1 edit if ≥5 chars). */
function wordMatches(brandWord: string, queryWord: string): boolean {
  if (brandWord === queryWord) return true;
  if (brandWord.length >= 5 && Math.abs(brandWord.length - queryWord.length) <= 1) {
    return levenshtein(brandWord, queryWord) <= 1;
  }
  return false;
}

/** Classify a single query string as branded under the derived tokens. */
export function isBranded(query: string, tokens: BrandTokens): boolean {
  const nq = normalizeBrand(query);
  if (!nq) return false;

  // Rule (a): a glued token appears anywhere in the query.
  for (const g of tokens.glue) {
    if (g && nq.includes(g)) return true;
  }

  // Rule (b): every brand-name word is present (any order, fuzzy). Needs ≥2
  // brand words so a single generic word can never brand a query on its own.
  if (tokens.wordSet.length >= 2) {
    const qWords = toWords(query);
    const allPresent = tokens.wordSet.every((bw) =>
      qWords.some((qw) => wordMatches(bw, qw)),
    );
    if (allPresent) return true;
  }

  return false;
}

/** Split query rows into branded/non-branded (order preserved within each). */
export function classifyQueries(
  rows: SearchConsoleRow[],
  tokens: BrandTokens,
): { branded: SearchConsoleRow[]; nonBranded: SearchConsoleRow[] } {
  const branded: SearchConsoleRow[] = [];
  const nonBranded: SearchConsoleRow[] = [];
  for (const r of rows) {
    if (isBranded(r.key, tokens)) branded.push(r);
    else nonBranded.push(r);
  }
  return { branded, nonBranded };
}
