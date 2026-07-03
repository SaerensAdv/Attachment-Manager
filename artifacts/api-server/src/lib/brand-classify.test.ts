import { describe, it, expect } from "vitest";
import {
  normalizeBrand,
  deriveBrandTokens,
  hasBrandTokens,
  isBranded,
  classifyQueries,
  toBrandTermList,
} from "./brand-classify";
import type { SearchConsoleRow } from "./search-console";

function row(key: string, clicks = 1): SearchConsoleRow {
  return { key, clicks, impressions: clicks * 10, ctr: 0.1, position: 1 };
}

// Auto tokens for the real client "Beauty Icon" (beauty-icon.nl), no manual list.
const auto = deriveBrandTokens({
  name: "Beauty Icon",
  website: "https://beauty-icon.nl/",
  siteUrl: "sc-domain:beauty-icon.nl",
});

describe("normalizeBrand", () => {
  it("lowercases, strips separators and diacritics", () => {
    expect(normalizeBrand("Beauty-Icon")).toBe("beautyicon");
    expect(normalizeBrand("Beauté Icôn!")).toBe("beauteicon");
    expect(normalizeBrand("  BEAUTY icon  ")).toBe("beautyicon");
  });
});

describe("deriveBrandTokens", () => {
  it("derives the glued name + domain label and the brand word set", () => {
    expect(auto.glue).toContain("beautyicon");
    expect(auto.wordSet).toEqual(["beauty", "icon"]);
    expect(hasBrandTokens(auto)).toBe(true);
  });

  it("skips auto tokens shorter than 4 chars but keeps manual terms", () => {
    const t = deriveBrandTokens({ name: "Bo", extraTerms: ["bo shop"] });
    // "bo" (2 chars) is not added as an auto glue token…
    expect(t.glue).not.toContain("bo");
    // …but the manual term is glued and kept.
    expect(t.glue).toContain("boshop");
  });

  it("accepts manual terms as newline/comma text or an array", () => {
    expect(toBrandTermList("icon almere\nicon beauty")).toEqual([
      "icon almere",
      "icon beauty",
    ]);
    expect(toBrandTermList(["a", " b ", ""])).toEqual(["a", "b"]);
  });

  it("reports no usable tokens for an empty client", () => {
    expect(hasBrandTokens(deriveBrandTokens({}))).toBe(false);
  });
});

describe("isBranded — auto rules (no manual list)", () => {
  const branded = [
    "beauty icon almere",
    "beauty icon",
    "beautyicon",
    "beautyicon almere",
    "beautyicon kliniek",
    "beautyicon kliniek almere",
    "beauty icon reviews",
    "icon beauty almere", // word-order variant (all-words rule)
    "icon beauty", // word-order variant
    "beuty icon", // typo (Levenshtein 1)
    "besuty icon", // typo (Levenshtein 1)
    "beaty icon", // typo (Levenshtein 1)
  ];
  for (const q of branded) {
    it(`brands "${q}"`, () => {
      expect(isBranded(q, auto)).toBe(true);
    });
  }

  const nonBranded = [
    "tanden bleken almere",
    "botox almere",
    "fillers almere",
    "microblading almere",
    "cryolipolyse almere",
    "vet bevriezen almere",
    "lemon bottle behandeling",
  ];
  for (const q of nonBranded) {
    it(`does not brand "${q}"`, () => {
      expect(isBranded(q, auto)).toBe(false);
    });
  }

  it("never brands on a single generic brand word alone", () => {
    // "beauty" or "icon" alone (or in unrelated phrases) must not brand.
    expect(isBranded("beauty salon almere", auto)).toBe(false);
    expect(isBranded("beautiful home", auto)).toBe(false);
    expect(isBranded("icon almere", auto)).toBe(false); // needs manual list
  });
});

describe("isBranded — with editable per-client list", () => {
  const withList = deriveBrandTokens({
    name: "Beauty Icon",
    website: "https://beauty-icon.nl/",
    extraTerms: "icon almere\nicon beauty",
  });

  it("brands colloquial variants once added to the manual list", () => {
    expect(isBranded("icon almere", withList)).toBe(true);
    expect(isBranded("icon beauty almere", withList)).toBe(true);
  });
});

describe("classifyQueries — aggregate split on the real June top queries", () => {
  const rows: SearchConsoleRow[] = [
    row("beauty icon almere", 227),
    row("beauty icon", 161),
    row("beautyicon", 69),
    row("tanden bleken almere", 61),
    row("botox almere", 41),
    row("beautyicon almere", 32),
    row("icon almere", 13), // branded only via manual list
    row("icon beauty almere", 12), // branded via all-words rule
    row("beautyicon kliniek", 12),
    row("beuty icon", 3), // typo → branded
  ];

  it("splits with the editable list catching the 'icon' colloquial variant", () => {
    const tokens = deriveBrandTokens({
      name: "Beauty Icon",
      website: "https://beauty-icon.nl/",
      extraTerms: ["icon almere"],
    });
    const { branded, nonBranded } = classifyQueries(rows, tokens);
    const clicks = (rs: SearchConsoleRow[]) =>
      rs.reduce((a, r) => a + r.clicks, 0);
    // Only the two generic-treatment queries stay non-branded.
    expect(nonBranded.map((r) => r.key).sort()).toEqual([
      "botox almere",
      "tanden bleken almere",
    ]);
    expect(clicks(branded)).toBe(529);
    expect(clicks(nonBranded)).toBe(102);
  });
});
