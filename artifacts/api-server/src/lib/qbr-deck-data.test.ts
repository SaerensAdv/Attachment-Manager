import { describe, expect, it } from "vitest";

import {
  type BuildQbrDataInput,
  buildQbrData,
  lastFullQuarter,
  previousQuarter,
  sameQuarterLastYear,
  toTokenMap,
} from "./qbr-deck-data";
import { KPI_KEYS } from "./deck-format";
import type { GoogleAdsMetrics } from "./google-ads";

function metrics(
  totals: Partial<GoogleAdsMetrics["totals"]>,
  over: Partial<GoogleAdsMetrics> = {},
): GoogleAdsMetrics {
  return {
    accountName: "Test Account",
    customerId: "5416666067",
    currency: "EUR",
    rangeLabel: "test",
    totals: {
      cost: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      conversionsValue: 0,
      ctr: 0,
      avgCpc: 0,
      cpa: null,
      roas: null,
      ...totals,
    },
    campaigns: [],
    ...over,
  };
}

function sampleInput(): BuildQbrDataInput {
  const quarter = lastFullQuarter(new Date(Date.UTC(2026, 5, 11)));
  return {
    client: { naam: "Car Audio Limburg", accountId: "5416666067" },
    quarter,
    prevQuarter: previousQuarter(quarter),
    yoyQuarter: sameQuarterLastYear(quarter),
    fetchedAt: new Date(Date.UTC(2026, 5, 11)),
    // Q1 2026
    metricsQ: metrics({
      cost: 1500,
      impressions: 300000,
      clicks: 6000,
      conversions: 30,
      conversionsValue: 600,
      ctr: 0.02,
      avgCpc: 0.25,
      cpa: 50,
    }),
    // Q4 2025 (QoQ baseline)
    metricsPrevQ: metrics({
      cost: 1200,
      impressions: 250000,
      clicks: 5000,
      conversions: 25,
      conversionsValue: 500,
      ctr: 0.02,
      avgCpc: 0.24,
      cpa: 48,
    }),
    // Q1 2025 (YoY baseline)
    metricsYoyQ: metrics({
      cost: 1000,
      impressions: 200000,
      clicks: 4000,
      conversions: 20,
      conversionsValue: 400,
      ctr: 0.02,
      avgCpc: 0.25,
      cpa: 50,
    }),
  };
}

describe("quarter helpers", () => {
  it("derives the last FULL quarter from a mid-quarter anchor", () => {
    const q = lastFullQuarter(new Date(Date.UTC(2026, 5, 11))); // 11 Jun 2026 → in Q2
    expect(q.label).toBe("Q1 2026");
    expect(q.year).toBe(2026);
    expect(q.quarter).toBe(1);
    expect(q.start.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(q.end.toISOString().slice(0, 10)).toBe("2026-03-31");
  });

  it("rolls back across the year boundary when the anchor is in Q1", () => {
    const q = lastFullQuarter(new Date(Date.UTC(2026, 1, 15))); // 15 Feb 2026 → in Q1
    expect(q.label).toBe("Q4 2025");
    expect(q.start.toISOString().slice(0, 10)).toBe("2025-10-01");
    expect(q.end.toISOString().slice(0, 10)).toBe("2025-12-31");
  });

  it("computes QoQ and YoY baselines", () => {
    const q = lastFullQuarter(new Date(Date.UTC(2026, 5, 11)));
    expect(previousQuarter(q).label).toBe("Q4 2025");
    expect(sameQuarterLastYear(q).label).toBe("Q1 2025");
  });

  it("ends Q2 on 30 June (last day of quarter)", () => {
    const q = lastFullQuarter(new Date(Date.UTC(2026, 8, 1))); // 1 Sep 2026 → in Q3
    expect(q.label).toBe("Q2 2026");
    expect(q.end.toISOString().slice(0, 10)).toBe("2026-06-30");
  });
});

describe("buildQbrData / toTokenMap", () => {
  it("labels the three periods", () => {
    const data = buildQbrData(sampleInput());
    expect(data.period.kwartaal).toBe("Q1 2026");
    expect(data.period.qoqLabel).toBe("Q4 2025");
    expect(data.period.yoyLabel).toBe("Q1 2025");
    expect(data.period.rangeLong).toBe("1 januari – 31 maart 2026");
    expect(data.period.fetchedAt).toBe("11 juni 2026");
  });

  it("formats current values + QoQ/YoY deltas (nl-BE, euro prefix)", () => {
    const data = buildQbrData(sampleInput());
    expect(data.kpis.kosten.displayQ).toBe("€1.500,00");
    expect(data.kpis.kosten.displayPrevQ).toBe("€1.200,00");
    expect(data.kpis.kosten.displayYoyQ).toBe("€1.000,00");
    // QoQ: 1200 → 1500 = +25%; YoY: 1000 → 1500 = +50%
    expect(data.kpis.kosten.displayQoq).toBe("+25%");
    expect(data.kpis.kosten.displayYoy).toBe("+50%");
    // conversies QoQ: 25 → 30 = +20%; YoY: 20 → 30 = +50%
    expect(data.kpis.conversies.displayQoq).toBe("+20%");
    expect(data.kpis.conversies.displayYoy).toBe("+50%");
  });

  it("drives the verdict off conversions QoQ + YoY", () => {
    const data = buildQbrData(sampleInput());
    expect(data.oordeel.kernmetriekLabel).toBe("Conversies");
    expect(data.oordeel.qoqStatus).toBe("Verbeterend"); // +20%
    expect(data.oordeel.yoyStatus).toBe("Verbeterend"); // +50%
  });

  it("gates cost-per-conversion deltas on enough conversions in both periods", () => {
    const input = sampleInput();
    input.metricsPrevQ = metrics({ cost: 500, conversions: 2, cpa: 250 });
    const data = buildQbrData(input);
    // QoQ baseline has too few conversions → not usable.
    expect(data.kpis.kostPerConversie.displayQoq).toBe("niet bruikbaar");
    // YoY baseline still has 20 conversions → usable.
    expect(data.kpis.kostPerConversie.displayYoy).toBe("+0%");
  });

  it("renders n.v.t. for a delta against a zero baseline", () => {
    const input = sampleInput();
    input.metricsPrevQ = metrics({ clicks: 0 });
    const data = buildQbrData(input);
    expect(data.kpis.klikken.displayQoq).toBe("n.v.t.");
  });

  it("emits exactly the 53-key token set the template expects", () => {
    const map = toTokenMap(buildQbrData(sampleInput()));
    const keys = Object.keys(map);
    // 3 meta + 4 period + 6 oordeel + 8 kpi × 5 = 53
    expect(keys).toHaveLength(53);
    for (const k of KPI_KEYS) {
      expect(map).toHaveProperty(`kpi.${k}.q`);
      expect(map).toHaveProperty(`kpi.${k}.prevQ`);
      expect(map).toHaveProperty(`kpi.${k}.yoyQ`);
      expect(map).toHaveProperty(`kpi.${k}.qoq`);
      expect(map).toHaveProperty(`kpi.${k}.yoy`);
    }
    expect(map).toHaveProperty("meta.klantnaam", "Car Audio Limburg");
    expect(map).toHaveProperty("oordeel.qoqStatus", "Verbeterend");
    // No empty values leak through.
    for (const v of Object.values(map)) expect(v).not.toBe("");
  });
});
