import { describe, expect, it } from "vitest";

import {
  buildAuditData,
  KPI_KEYS,
  toTokenMap,
  type BuildAuditDataInput,
} from "./audit-deck-data";
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

// Numbers taken from the LIVE Car Audio Limburg deck so the builder stays a
// faithful, deterministic reproduction of the hand-authored output.
function liveInput(): BuildAuditDataInput {
  return {
    client: { naam: "Car Audio Limburg", accountId: "5416666067" },
    periodA: { start: new Date(Date.UTC(2025, 0, 1)), end: new Date(Date.UTC(2025, 5, 11)) },
    periodB: { start: new Date(Date.UTC(2026, 0, 1)), end: new Date(Date.UTC(2026, 5, 11)) },
    fetchedAt: new Date(Date.UTC(2026, 5, 11)),
    metricsA: metrics({
      cost: 1891.7,
      impressions: 327983,
      clicks: 5931,
      conversions: 31,
      conversionsValue: 626.9,
      ctr: 0.0181,
      avgCpc: 0.32,
      cpa: 61.02,
    }),
    metricsB: metrics({
      cost: 2268.7,
      impressions: 463150,
      clicks: 7272,
      conversions: 1,
      conversionsValue: 179.0,
      ctr: 0.0157,
      avgCpc: 0.31,
      cpa: 2268.7,
    }),
  };
}

describe("buildAuditData / toTokenMap", () => {
  it("formats the KPI table to match the live deck (nl-BE, euro prefix)", () => {
    const map = toTokenMap(buildAuditData(liveInput()));

    expect(map["kpi.kosten.a"]).toBe("€1.891,70");
    expect(map["kpi.kosten.b"]).toBe("€2.268,70");
    expect(map["kpi.kosten.delta"]).toBe("+20%");

    expect(map["kpi.vertoningen.a"]).toBe("327.983");
    expect(map["kpi.vertoningen.b"]).toBe("463.150");
    expect(map["kpi.vertoningen.delta"]).toBe("+41%");

    expect(map["kpi.klikken.a"]).toBe("5.931");
    expect(map["kpi.klikken.b"]).toBe("7.272");
    expect(map["kpi.klikken.delta"]).toBe("+23%");

    expect(map["kpi.ctr.a"]).toBe("1,81%");
    expect(map["kpi.ctr.b"]).toBe("1,57%");
    expect(map["kpi.ctr.delta"]).toBe("\u22120,24 pp");

    expect(map["kpi.conversies.a"]).toBe("31");
    expect(map["kpi.conversies.b"]).toBe("1");
    expect(map["kpi.conversies.delta"]).toBe("\u221297%");

    expect(map["kpi.conversiewaarde.a"]).toBe("€626,90");
    expect(map["kpi.conversiewaarde.b"]).toBe("€179,00");
    expect(map["kpi.conversiewaarde.delta"]).toBe("\u221271%");
  });

  it("marks cost-per-conversion as 'niet bruikbaar' when a period has too few conversions", () => {
    const map = toTokenMap(buildAuditData(liveInput()));
    expect(map["kpi.kostPerConversie.a"]).toBe("€61,02");
    expect(map["kpi.kostPerConversie.b"]).toBe("€2.268,70");
    expect(map["kpi.kostPerConversie.delta"]).toBe("niet bruikbaar");
  });

  it("computes a cost-per-conversion delta when both periods have enough conversions", () => {
    const input = liveInput();
    input.metricsA = metrics({ cost: 500, conversions: 10, cpa: 50 });
    input.metricsB = metrics({ cost: 600, conversions: 10, cpa: 60 });
    const map = toTokenMap(buildAuditData(input));
    expect(map["kpi.kostPerConversie.delta"]).toBe("+20%");
  });

  it("derives a deterministic Oordeel status + hero from the conversion delta", () => {
    const map = toTokenMap(buildAuditData(liveInput()));
    expect(map["oordeel.status"]).toBe("Verslechterend");
    expect(map["oordeel.kernmetriekLabel"]).toBe("Conversies");
    expect(map["oordeel.a"]).toBe("31");
    expect(map["oordeel.b"]).toBe("1");
  });

  it("flags improving / stable status by conversion bands", () => {
    const up = liveInput();
    up.metricsA = metrics({ conversions: 100 });
    up.metricsB = metrics({ conversions: 120 });
    expect(toTokenMap(buildAuditData(up))["oordeel.status"]).toBe("Verbeterend");

    const flat = liveInput();
    flat.metricsA = metrics({ conversions: 100 });
    flat.metricsB = metrics({ conversions: 102 });
    expect(toTokenMap(buildAuditData(flat))["oordeel.status"]).toBe("Stabiel");
  });

  it("builds nl-BE period + meta labels", () => {
    const map = toTokenMap(buildAuditData(liveInput()));
    expect(map["meta.klantnaam"]).toBe("Car Audio Limburg");
    expect(map["meta.accountId"]).toBe("541-666-6067");
    expect(map["meta.opgehaald"]).toBe("11 juni 2026");
    expect(map["period.rangeLong"]).toBe("1 januari – 11 juni");
    expect(map["period.rangeShort"]).toBe("1 jan – 11 jun");
    expect(map["period.vergelijking"]).toBe("2026 vs 2025");
    expect(map["period.aYear"]).toBe("2025");
    expect(map["period.bYear"]).toBe("2026");
  });

  it("emits exactly the 36 tokens the deck template declares", () => {
    const map = toTokenMap(buildAuditData(liveInput()));
    const keys = Object.keys(map).sort();
    const expected = [
      "meta.klantnaam",
      "meta.accountId",
      "meta.opgehaald",
      "period.rangeLong",
      "period.rangeShort",
      "period.vergelijking",
      "period.aYear",
      "period.bYear",
      "oordeel.kernmetriekLabel",
      "oordeel.a",
      "oordeel.b",
      "oordeel.status",
      ...KPI_KEYS.flatMap((k) => [`kpi.${k}.a`, `kpi.${k}.b`, `kpi.${k}.delta`]),
    ].sort();
    expect(keys).toEqual(expected);
    expect(keys).toHaveLength(36);
    for (const v of Object.values(map)) expect(v).not.toContain("[[");
  });
});
