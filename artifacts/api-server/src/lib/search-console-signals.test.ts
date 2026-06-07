import { describe, it, expect } from "vitest";
import {
  computeSearchConsoleSignals,
  renderSearchConsoleSignals,
} from "./search-console-signals";
import type { SearchConsoleRow } from "./search-console";

function row(over: Partial<SearchConsoleRow> = {}): SearchConsoleRow {
  return { key: "term", clicks: 0, impressions: 0, ctr: 0, position: 1, ...over };
}

describe("search console signals", () => {
  it("flags striking-distance queries (page 2 with real impressions)", () => {
    const signals = computeSearchConsoleSignals([
      row({ key: "dakwerken antwerpen", impressions: 800, position: 12, clicks: 5 }),
    ]);
    const codes = signals.map((s) => s.code);
    expect(codes).toContain("sc-striking-distance");
    expect(signals.find((s) => s.code === "sc-striking-distance")?.message).toContain(
      "dakwerken antwerpen",
    );
  });

  it("ignores striking-distance candidates below the impression floor", () => {
    const signals = computeSearchConsoleSignals([
      row({ key: "rare term", impressions: 10, position: 12 }),
    ]);
    expect(signals.map((s) => s.code)).not.toContain("sc-striking-distance");
  });

  it("flags high-rank low-CTR queries", () => {
    const signals = computeSearchConsoleSignals([
      row({ key: "merknaam", impressions: 5000, position: 2, ctr: 0.005, clicks: 25 }),
    ]);
    expect(signals.map((s) => s.code)).toContain("sc-low-ctr");
  });

  it("reports the top traffic-driving query", () => {
    const signals = computeSearchConsoleSignals([
      row({ key: "a", clicks: 3, position: 4 }),
      row({ key: "b", clicks: 50, position: 1 }),
    ]);
    const top = signals.find((s) => s.code === "sc-top-query");
    expect(top?.message).toContain('"b"');
  });

  it("renders nothing for an empty signal list", () => {
    expect(renderSearchConsoleSignals([])).toBe("");
  });

  it("orders warnings before info in the rendered block", () => {
    const signals = computeSearchConsoleSignals([
      row({ key: "kans", impressions: 800, position: 12, clicks: 5 }),
    ]);
    const rendered = renderSearchConsoleSignals(signals);
    expect(rendered.indexOf("[~]")).toBeLessThan(rendered.indexOf("[i]"));
  });
});
