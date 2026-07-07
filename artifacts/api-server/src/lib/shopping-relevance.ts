/**
 * Product-relevance scoring for Shopping search terms.
 *
 * Given the raw per-ad-group pull from `google-ads.ts`
 * (`fetchShoppingTermRelevanceData`), score how relevant each search term is to
 * the PRODUCTS that actually serve in that ad group. Shopping campaigns have no
 * positive keywords, so relevance is steered only by negatives — this is what
 * tells the user which terms are worth excluding.
 *
 * The score is HYBRID and layered so it stays reproducible and cheap:
 *   1. Deterministic pass — normalise diacritics, tokenise the products +
 *      ad-group name, and match each term token (exact or Levenshtein<=2 for
 *      typos of a stocked brand). This produces a grounded base score 0-100.
 *   2. Best-effort LLM pass per ad group — nuance the deterministic score and
 *      write short Dutch advice (e.g. "0.0 = alcoholvrije variant, niet in
 *      assortiment"). If the model call fails, the deterministic result stands.
 *   3. Learned-rule overrides — a user rule (from earlier exclusions) pins the
 *      verdict deterministically and always wins.
 *
 * This module is pure: learned rules are passed in, never read here, so it is
 * easy to test and has no side effects. It never writes to Google Ads.
 */

import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "./logger";
import type {
  ShoppingTermRelevanceData,
  ShoppingAdGroupRelevance,
} from "./google-ads";

/** A durable rule learned from a past user decision (from the store). */
export interface LearnedRule {
  scope: "brand" | "adgroup" | "term";
  pattern: string;
  rule: "exclude" | "keep";
  note: string | null;
}

export type TermVerdict = "keep" | "review" | "exclude";

export interface ScoredTerm {
  term: string;
  /** 0-100; higher = more relevant to the group's products (keep). */
  score: number;
  verdict: TermVerdict;
  advice: string;
  reason: string;
  matchedProducts: string[];
  alreadyExcluded: boolean;
  suggestedMatchType: "EXACT" | "PHRASE";
  cost: number;
  clicks: number;
  conversions: number;
}

export interface ScoredAdGroup {
  adGroupId: string;
  adGroupName: string;
  campaignId: string;
  campaignName: string;
  products: { title: string; brand: string; productType: string }[];
  terms: ScoredTerm[];
}

export interface RelevanceResult {
  customerId: string;
  currency: string;
  adGroups: ScoredAdGroup[];
  warnings: string[];
}

/** Score >= this = keep; >= REVIEW = review; below = exclude candidate. */
const KEEP_THRESHOLD = 70;
const REVIEW_THRESHOLD = 40;

/**
 * Packaging / commerce filler that adds no product-identity signal. Stripped
 * from BOTH product tokens and term tokens so matching keys off distinctive
 * words (brand, product) instead of "goedkoop", "blik", "kopen"...
 */
const STOPWORDS = new Set([
  "de", "het", "een", "en", "of", "van", "voor", "met", "per", "the", "op",
  "drank", "dranken", "drankje", "drinken", "drink",
  "blik", "blikje", "blikjes", "fles", "flesje", "flesjes", "fust", "fusten",
  "vat", "vaten", "krat", "kratten", "tray", "trays", "pak", "pack", "packs",
  "sixpack", "six", "stuk", "stuks", "liter", "litre", "cl", "ml", "l",
  "doos", "dozen", "set", "sets", "verpakking",
  "kopen", "koop", "bestellen", "bestel", "online", "aanbieding",
  "aanbiedingen", "goedkoop", "goedkope", "goedkoopste", "prijs", "prijzen",
  "korting", "deal", "deals", "beste", "nabij", "winkel",
]);

/** Lowercase + strip diacritics ("Stëlz" -> "stelz"). */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Distinctive tokens: alphanumeric, length >= 2, not a stopword. */
function tokenize(s: string): string[] {
  return normalize(s)
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** Classic Levenshtein edit distance (small strings only). */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

interface GroupTokens {
  all: Set<string>;
  brands: Set<string>;
}

/** Build the product + brand token sets for one ad group. */
function buildGroupTokens(group: ShoppingAdGroupRelevance): GroupTokens {
  const all = new Set<string>();
  const brands = new Set<string>();
  for (const t of tokenize(group.adGroupName)) brands.add(t);
  for (const p of group.products) {
    for (const t of tokenize(p.title)) all.add(t);
    for (const t of tokenize(p.brand)) {
      all.add(t);
      brands.add(t);
    }
    for (const t of tokenize(p.productType)) all.add(t);
  }
  for (const b of brands) all.add(b);
  return { all, brands };
}

/** True if a term token matches a product token exactly or as a near-typo. */
function tokenMatches(termTok: string, productTokens: Set<string>): boolean {
  if (productTokens.has(termTok)) return true;
  if (termTok.length >= 4) {
    for (const p of productTokens) {
      if (p.length >= 4 && Math.abs(p.length - termTok.length) <= 2) {
        if (levenshtein(termTok, p) <= 2) return true;
      }
    }
  }
  return false;
}

function verdictFor(score: number): TermVerdict {
  if (score >= KEEP_THRESHOLD) return "keep";
  if (score >= REVIEW_THRESHOLD) return "review";
  return "exclude";
}

/** Does an existing negative already cover this term? */
function isAlreadyExcluded(
  term: string,
  group: ShoppingAdGroupRelevance,
): boolean {
  const nt = normalize(term).trim();
  return group.existingNegatives.some((neg) => {
    const nn = normalize(neg.text).trim();
    if (!nn) return false;
    if (nn === nt) return true;
    // A phrase/broad negative already catches this term if its words appear.
    if (neg.matchType !== "EXACT" && nt.includes(nn)) return true;
    return false;
  });
}

/** First learned rule that applies to this term in this group, if any. */
function matchingRule(
  rules: LearnedRule[],
  group: ShoppingAdGroupRelevance,
  term: string,
  brandTokens: Set<string>,
): LearnedRule | null {
  const nTerm = normalize(term).trim();
  const nGroup = normalize(group.adGroupName).trim();
  for (const rule of rules) {
    const p = normalize(rule.pattern).trim();
    if (!p) continue;
    if (rule.scope === "term" && nTerm === p) return rule;
    if (rule.scope === "adgroup" && nGroup.includes(p)) return rule;
    if (rule.scope === "brand") {
      const toks = tokenize(rule.pattern);
      if (toks.some((t) => brandTokens.has(t))) return rule;
    }
  }
  return null;
}

/** Deterministic base score + metadata for one term. */
function scoreTermDeterministic(
  term: string,
  group: ShoppingAdGroupRelevance,
  tokens: GroupTokens,
  cost: number,
  clicks: number,
  conversions: number,
): ScoredTerm {
  const termToks = tokenize(term);
  const matched = termToks.filter((t) => tokenMatches(t, tokens.all));
  const unmatched = termToks.filter((t) => !matched.includes(t));
  const brandHit = termToks.some((t) => tokens.brands.has(t));

  let score: number;
  if (termToks.length === 0) {
    // No distinctive words (e.g. "goedkoop bestellen") — generic, weak match.
    score = 30;
  } else {
    const coverage = matched.length / termToks.length;
    score = Math.round(coverage * 100);
    if (brandHit) score = Math.max(score, 75);
  }

  const alreadyExcluded = isAlreadyExcluded(term, group);
  // Hard safety: a term that converts is relevant by definition — never lead
  // the user toward excluding it.
  if (conversions > 0) score = Math.max(score, 80);

  const matchedProducts = group.products
    .filter((p) => {
      const pt = tokenize(p.title);
      return matched.some((m) => pt.includes(m));
    })
    .slice(0, 3)
    .map((p) => p.title);

  const reason =
    termToks.length === 0
      ? "Geen onderscheidende productwoorden in deze zoekterm."
      : `${matched.length}/${termToks.length} kernwoorden matchen de producten` +
        (unmatched.length ? `; niet gematcht: ${unmatched.join(", ")}` : "");

  const verdict = verdictFor(score);
  let advice: string;
  if (conversions > 0) advice = "Converteert — niet uitsluiten.";
  else if (verdict === "keep")
    advice = "Relevant voor de producten in deze groep.";
  else if (verdict === "review")
    advice = "Deels relevant — controleer of dit bij je producten past.";
  else advice = "Lijkt niet bij de producten in deze groep te passen.";
  if (alreadyExcluded) advice = `Al uitgesloten. ${advice}`;

  // Broad off-product queries default to PHRASE (catch variants); otherwise
  // EXACT (only that literal query) is the cautious default.
  const suggestedMatchType: "EXACT" | "PHRASE" =
    verdict === "exclude" && termToks.length >= 3 && matched.length === 0
      ? "PHRASE"
      : "EXACT";

  return {
    term,
    score,
    verdict,
    advice,
    reason,
    matchedProducts,
    alreadyExcluded,
    suggestedMatchType,
    cost,
    clicks,
    conversions,
  };
}

interface LlmAdjustment {
  score: number;
  verdict: TermVerdict;
  advice: string;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Geen JSON-object gevonden in het antwoord.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Best-effort per-group LLM nuance. Returns a map term -> adjustment. Any
 * failure (model error, bad JSON) resolves to an empty map so the deterministic
 * score stands. Only terms not already keep-with-conversions are sent, to keep
 * the prompt small.
 */
async function enrichGroupWithLlm(
  group: ShoppingAdGroupRelevance,
  base: ScoredTerm[],
): Promise<Map<string, LlmAdjustment>> {
  const out = new Map<string, LlmAdjustment>();
  const candidates = base.filter((t) => t.conversions === 0).slice(0, 40);
  if (candidates.length === 0 || group.products.length === 0) return out;

  const productList = group.products
    .slice(0, 20)
    .map((p) => `- ${p.title}${p.brand ? ` (merk: ${p.brand})` : ""}`)
    .join("\n");
  const termList = candidates
    .map((t) => `- "${t.term}" (basisscore ${t.score})`)
    .join("\n");

  const system = [
    "Je bent een Google Ads Shopping-specialist bij een Belgisch bureau.",
    "Een Shopping-advertentiegroep toont enkel de producten hieronder.",
    "Beoordeel per zoekterm hoe relevant die is voor DEZE producten.",
    "",
    "Richtlijnen:",
    "- score 0-100: hoog = past bij de producten (behouden), laag = niet passend (uitsluiten).",
    "- Een typefout van een merk dat je voert (bv. 'steltz' voor 'Stëlz') is RELEVANT: behouden.",
    "- Een variant die niet in de productlijst staat (bv. '0.0'/'alcoholvrij' terwijl enkel de gewone versie er is) is NIET relevant: uitsluiten.",
    "- Een te brede of generieke zoekterm die andere producten bedoelt: uitsluiten.",
    "- verdict is 'keep', 'review' of 'exclude'.",
    "- advies: één korte Nederlandse zin (max 12 woorden), concreet, geen emoji.",
    "",
    'Antwoord uitsluitend met JSON: {"terms":[{"term":"...","score":0,"verdict":"keep|review|exclude","advies":"..."}]}',
    "Neem elke aangeleverde zoekterm exact één keer op. Geen tekst buiten de JSON.",
  ].join("\n");

  const user = [
    `PRODUCTEN IN DEZE GROEP (${group.adGroupName}):`,
    productList,
    "",
    "ZOEKTERMEN:",
    termList,
  ].join("\n");

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: user }],
    });
    const raw = message.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const parsed = parseJsonObject(raw);
    const list = Array.isArray(parsed.terms) ? parsed.terms : [];
    for (const item of list) {
      if (typeof item !== "object" || item === null) continue;
      const obj = item as Record<string, unknown>;
      const term = typeof obj.term === "string" ? obj.term : null;
      if (!term) continue;
      const scoreRaw = Number(obj.score);
      const score = Number.isFinite(scoreRaw)
        ? Math.max(0, Math.min(100, Math.round(scoreRaw)))
        : null;
      const verdictRaw =
        typeof obj.verdict === "string" ? obj.verdict.toLowerCase() : "";
      const verdict: TermVerdict | null =
        verdictRaw === "keep" || verdictRaw === "review" || verdictRaw === "exclude"
          ? (verdictRaw as TermVerdict)
          : null;
      const advice =
        typeof obj.advies === "string" && obj.advies.trim()
          ? obj.advies.trim()
          : typeof obj.advice === "string" && obj.advice.trim()
            ? obj.advice.trim()
            : null;
      if (score === null && verdict === null && advice === null) continue;
      out.set(term, {
        score: score ?? verdictFallbackScore(verdict),
        verdict: verdict ?? verdictFor(score ?? 50),
        advice: advice ?? "",
      });
    }
  } catch (err) {
    logger.warn(
      { err, adGroup: group.adGroupName },
      "Shopping-relevance: LLM-verrijking overgeslagen",
    );
  }
  return out;
}

function verdictFallbackScore(verdict: TermVerdict | null): number {
  if (verdict === "keep") return 85;
  if (verdict === "exclude") return 20;
  return 55;
}

/** Score one ad group end-to-end: deterministic -> LLM -> learned rules. */
async function scoreGroup(
  group: ShoppingAdGroupRelevance,
  rules: LearnedRule[],
): Promise<ScoredAdGroup> {
  const tokens = buildGroupTokens(group);
  const base = group.searchTerms.map((t) =>
    scoreTermDeterministic(
      t.term,
      group,
      tokens,
      t.cost,
      t.clicks,
      t.conversions,
    ),
  );

  const adjustments = await enrichGroupWithLlm(group, base);

  const terms = base.map((t) => {
    const merged: ScoredTerm = { ...t };
    const adj = adjustments.get(t.term);
    if (adj && t.conversions === 0) {
      merged.score = adj.score;
      merged.verdict = adj.verdict;
      if (adj.advice) merged.advice = adj.advice;
    }
    // Converting terms can never be nudged to exclude.
    if (merged.conversions > 0 && merged.verdict === "exclude") {
      merged.verdict = "keep";
      merged.score = Math.max(merged.score, 80);
      merged.advice = "Converteert — niet uitsluiten.";
    }
    // Learned rules win outright.
    const rule = matchingRule(rules, group, t.term, tokens.brands);
    if (rule) {
      if (rule.rule === "exclude") {
        merged.verdict = "exclude";
        merged.score = 5;
        merged.advice = rule.note
          ? `Geleerde regel: ${rule.note}`
          : "Geleerde regel: uitsluiten.";
      } else {
        merged.verdict = "keep";
        merged.score = 95;
        merged.advice = rule.note
          ? `Geleerde regel: ${rule.note}`
          : "Geleerde regel: behouden.";
      }
    }
    if (merged.alreadyExcluded && !merged.advice.startsWith("Al uitgesloten")) {
      merged.advice = `Al uitgesloten. ${merged.advice}`;
    }
    return merged;
  });

  const rank: Record<TermVerdict, number> = { exclude: 0, review: 1, keep: 2 };
  terms.sort(
    (a, b) => rank[a.verdict] - rank[b.verdict] || b.cost - a.cost,
  );

  return {
    adGroupId: group.adGroupId,
    adGroupName: group.adGroupName,
    campaignId: group.campaignId,
    campaignName: group.campaignName,
    products: group.products.map((p) => ({
      title: p.title,
      brand: p.brand,
      productType: p.productType,
    })),
    terms,
  };
}

/** Run `fn` over `items` with a bounded number of concurrent workers. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (x: T) => Promise<R>,
): Promise<R[]> {
  const ret = new Array<R>(items.length);
  let i = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (i < items.length) {
        const idx = i++;
        ret[idx] = await fn(items[idx]);
      }
    },
  );
  await Promise.all(workers);
  return ret;
}

/**
 * Score a full read-only pull. Deterministic scoring always runs; the LLM pass
 * is best-effort per group (bounded concurrency); learned rules override.
 */
export async function scoreShoppingTerms(
  data: ShoppingTermRelevanceData,
  learnedRules: LearnedRule[],
): Promise<RelevanceResult> {
  const adGroups = await mapWithConcurrency(data.adGroups, 3, (group) =>
    scoreGroup(group, learnedRules),
  );
  return {
    customerId: data.customerId,
    currency: data.currency,
    adGroups,
    warnings: data.warnings,
  };
}
