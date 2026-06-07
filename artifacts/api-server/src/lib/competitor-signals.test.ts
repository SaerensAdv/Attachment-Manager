import { describe, it, expect } from "vitest";
import {
  computeCompetitorSignals,
  renderCompetitorSignals,
} from "./competitor-signals";
import type { CompetitorAd, CompetitorAdvertiserResult } from "./serpapi";

const NOW = Date.UTC(2026, 5, 7); // 2026-06-07

function ad(over: Partial<CompetitorAd> = {}): CompetitorAd {
  return {
    advertiserId: "AR1",
    advertiser: "Concurrent BV",
    adCreativeId: "CR1",
    format: "text",
    firstShown: new Date(NOW - 100 * 86400_000),
    lastShown: new Date(NOW),
    totalDaysShown: 100,
    ...over,
  };
}

function result(
  ads: CompetitorAd[],
  over: Partial<CompetitorAdvertiserResult> = {},
): CompetitorAdvertiserResult {
  return {
    target: "AR1",
    kind: "advertiser_id",
    advertiser: "Concurrent BV",
    totalResults: ads.length,
    ads,
    ...over,
  };
}

describe("computeCompetitorSignals", () => {
  it("emits a no-ads info signal for an empty competitor", () => {
    const signals = computeCompetitorSignals([result([])], {}, NOW);
    expect(signals).toHaveLength(1);
    expect(signals[0].code).toBe("competitor-no-ads");
  });

  it("flags a burst of recently launched ads as a warning", () => {
    const recent = [
      ad({ firstShown: new Date(NOW - 2 * 86400_000), totalDaysShown: 2 }),
      ad({ firstShown: new Date(NOW - 3 * 86400_000), totalDaysShown: 3 }),
      ad({ firstShown: new Date(NOW - 4 * 86400_000), totalDaysShown: 4 }),
    ];
    const signals = computeCompetitorSignals([result(recent)], {}, NOW);
    expect(signals.some((s) => s.code === "competitor-recent-burst")).toBe(true);
    expect(signals.find((s) => s.code === "competitor-recent-burst")?.severity).toBe(
      "warning",
    );
  });

  it("does not flag a burst when launches are old", () => {
    const old = [
      ad({ firstShown: new Date(NOW - 200 * 86400_000) }),
      ad({ firstShown: new Date(NOW - 201 * 86400_000) }),
      ad({ firstShown: new Date(NOW - 202 * 86400_000) }),
    ];
    const signals = computeCompetitorSignals([result(old)], {}, NOW);
    expect(signals.some((s) => s.code === "competitor-recent-burst")).toBe(false);
  });

  it("detects format concentration", () => {
    const ads = [
      ad({ format: "video" }),
      ad({ format: "video" }),
      ad({ format: "video" }),
      ad({ format: "text" }),
    ];
    const signals = computeCompetitorSignals([result(ads)], {}, NOW);
    const focus = signals.find((s) => s.code === "competitor-format-focus");
    expect(focus).toBeDefined();
    expect(focus?.message).toContain("video");
  });

  it("detects a long-running creative", () => {
    const signals = computeCompetitorSignals(
      [result([ad({ totalDaysShown: 120 })])],
      {},
      NOW,
    );
    expect(signals.some((s) => s.code === "competitor-long-runner")).toBe(true);
  });

  it("renders nothing for an empty signal list", () => {
    expect(renderCompetitorSignals([])).toBe("");
  });

  it("renders one line per signal with a severity marker", () => {
    const rendered = renderCompetitorSignals([
      { severity: "warning", code: "x", message: "Test." },
    ]);
    expect(rendered).toContain("[~]");
    expect(rendered).toContain("Test.");
  });
});
