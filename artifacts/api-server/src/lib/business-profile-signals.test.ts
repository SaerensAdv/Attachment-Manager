import { describe, it, expect } from "vitest";
import {
  computeGmbSignals,
  renderGmbSignals,
  type GmbReport,
} from "./business-profile-signals";

function report(over: Partial<GmbReport> = {}): GmbReport {
  return {
    locationId: "123",
    startDate: "2026-05-01",
    endDate: "2026-05-30",
    metrics: {},
    impressions: 3000,
    calls: 40,
    websiteClicks: 60,
    directionRequests: 30,
    conversations: 10,
    actions: 140,
    ...over,
  };
}

describe("gmb signals", () => {
  it("flags zero impressions as high severity", () => {
    const signals = computeGmbSignals(
      report({ impressions: 0, actions: 0, calls: 0 }),
    );
    const s = signals.find((x) => x.code === "gmb-no-visibility");
    expect(s?.severity).toBe("high");
  });

  it("flags low visibility as a warning", () => {
    const signals = computeGmbSignals(
      report({ impressions: 40, actions: 1, calls: 0 }),
    );
    expect(signals.some((s) => s.code === "gmb-low-visibility")).toBe(true);
  });

  it("flags impressions without any calls", () => {
    const signals = computeGmbSignals(
      report({ impressions: 2000, calls: 0, actions: 100 }),
    );
    expect(signals.some((s) => s.code === "gmb-no-calls")).toBe(true);
  });

  it("flags a low action rate", () => {
    const signals = computeGmbSignals(
      report({ impressions: 5000, actions: 20, calls: 5 }),
    );
    expect(signals.some((s) => s.code === "gmb-low-action-rate")).toBe(true);
  });

  it("emits a healthy info signal for good engagement", () => {
    const signals = computeGmbSignals(report());
    expect(signals.some((s) => s.code === "gmb-healthy-engagement")).toBe(true);
  });

  it("renders signals as a compact block, empty when none", () => {
    expect(renderGmbSignals([])).toBe("");
    const rendered = renderGmbSignals(
      computeGmbSignals(report({ impressions: 0, actions: 0, calls: 0 })),
    );
    expect(rendered).toContain("[!]");
  });
});
