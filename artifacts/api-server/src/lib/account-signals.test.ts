import { describe, it, expect } from "vitest";
import {
  computeAccountSignals,
  renderAccountSignals,
} from "./account-signals";
import type {
  GoogleAdsMetrics,
  GoogleAdsCampaignMetric,
} from "./google-ads";

function campaign(
  over: Partial<GoogleAdsCampaignMetric> & { name: string },
): GoogleAdsCampaignMetric {
  return {
    status: "ENABLED",
    cost: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    conversionsValue: 0,
    ctr: 0,
    avgCpc: 0,
    cpa: null,
    roas: null,
    ...over,
  };
}

function metrics(over: {
  cost: number;
  conversions: number;
  campaigns?: GoogleAdsCampaignMetric[];
}): GoogleAdsMetrics {
  const { cost, conversions } = over;
  return {
    accountName: "Test",
    customerId: "123",
    currency: "EUR",
    rangeLabel: "laatste 30 dagen",
    totals: {
      cost,
      impressions: 1000,
      clicks: 100,
      conversions,
      conversionsValue: 0,
      ctr: 0.1,
      avgCpc: cost / 100,
      cpa: conversions > 0 ? cost / conversions : null,
      roas: null,
    },
    campaigns: over.campaigns ?? [],
  };
}

describe("computeAccountSignals", () => {
  it("stays silent below the account spend floor", () => {
    expect(computeAccountSignals(metrics({ cost: 10, conversions: 0 }))).toEqual(
      [],
    );
  });

  it("flags account-wide spend with zero conversions as high severity", () => {
    const signals = computeAccountSignals(
      metrics({ cost: 500, conversions: 0 }),
    );
    expect(signals).toHaveLength(1);
    expect(signals[0].severity).toBe("high");
    expect(signals[0].code).toBe("tracking-account-zero-conv");
  });

  it("does not emit per-campaign zero-conversion signals when the whole account has zero conversions", () => {
    const signals = computeAccountSignals(
      metrics({
        cost: 500,
        conversions: 0,
        campaigns: [campaign({ name: "A", cost: 300, conversions: 0 })],
      }),
    );
    // Only the account-level high signal, no per-campaign duplication.
    expect(signals.map((s) => s.code)).toEqual(["tracking-account-zero-conv"]);
  });

  it("flags a spending campaign with no conversions when the account does convert", () => {
    const signals = computeAccountSignals(
      metrics({
        cost: 500,
        conversions: 10,
        campaigns: [
          campaign({ name: "Good", cost: 200, conversions: 10, cpa: 20 }),
          campaign({ name: "Dead", cost: 100, conversions: 0 }),
        ],
      }),
    );
    const codes = signals.map((s) => s.code);
    expect(codes).toContain("campaign-zero-conv");
    expect(signals.find((s) => s.code === "campaign-zero-conv")?.message).toContain(
      "Dead",
    );
  });

  it("ignores low-spend campaigns for per-campaign signals", () => {
    const signals = computeAccountSignals(
      metrics({
        cost: 500,
        conversions: 10,
        campaigns: [campaign({ name: "Tiny", cost: 5, conversions: 0 })],
      }),
    );
    expect(signals.map((s) => s.code)).not.toContain("campaign-zero-conv");
  });

  it("flags a campaign whose CPA is far above the account average", () => {
    // Account CPA = 500 / 10 = 50. Outlier factor default 2 → threshold 100.
    const signals = computeAccountSignals(
      metrics({
        cost: 500,
        conversions: 10,
        campaigns: [
          campaign({ name: "Cheap", cost: 100, conversions: 5, cpa: 20 }),
          campaign({ name: "Pricey", cost: 400, conversions: 2, cpa: 200 }),
        ],
      }),
    );
    const outlier = signals.find((s) => s.code === "campaign-cpa-outlier");
    expect(outlier).toBeDefined();
    expect(outlier?.message).toContain("Pricey");
  });

  it("does not flag a campaign within the CPA factor", () => {
    const signals = computeAccountSignals(
      metrics({
        cost: 500,
        conversions: 10,
        campaigns: [
          campaign({ name: "Normal", cost: 300, conversions: 4, cpa: 75 }),
        ],
      }),
    );
    expect(signals.map((s) => s.code)).not.toContain("campaign-cpa-outlier");
  });

  it("orders high-severity signals before warnings", () => {
    const signals = computeAccountSignals(
      metrics({
        cost: 500,
        conversions: 0,
        campaigns: [campaign({ name: "X", cost: 200, conversions: 0 })],
      }),
    );
    expect(signals[0].severity).toBe("high");
  });
});

describe("renderAccountSignals", () => {
  it("returns no lines for an empty signal list", () => {
    expect(renderAccountSignals([])).toEqual([]);
  });

  it("renders a heading plus one line per signal", () => {
    const lines = renderAccountSignals([
      { severity: "high", code: "x", message: "Belangrijk probleem" },
      { severity: "warning", code: "y", message: "Kleinere zaak" },
    ]);
    expect(lines[0]).toContain("Signalen");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("BELANGRIJK");
    expect(lines[2]).toContain("Let op");
  });
});
