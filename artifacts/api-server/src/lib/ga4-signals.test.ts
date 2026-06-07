import { describe, it, expect } from "vitest";
import {
  computeGa4Signals,
  renderGa4Signals,
  type Ga4SignalsInput,
} from "./ga4-signals";

function input(over: Partial<Ga4SignalsInput> = {}): Ga4SignalsInput {
  return {
    totals: {
      sessions: 1000,
      totalUsers: 800,
      screenPageViews: 3000,
      conversions: 50,
      engagementRate: 0.6,
      ...over.totals,
    },
    channels: over.channels ?? [],
    landingPages: over.landingPages ?? [],
  };
}

describe("ga4 signals", () => {
  it("flags a high-traffic channel with zero conversions", () => {
    const signals = computeGa4Signals(
      input({
        channels: [
          { channel: "Paid Search", sessions: 500, conversions: 0, engagementRate: 0.5 },
        ],
      }),
    );
    expect(signals.some((s) => s.code === "ga4-zero-conversion-channel")).toBe(
      true,
    );
  });

  it("does not flag a low-traffic channel with zero conversions", () => {
    const signals = computeGa4Signals(
      input({
        channels: [
          { channel: "Referral", sessions: 10, conversions: 0, engagementRate: 0.5 },
        ],
      }),
    );
    expect(signals.some((s) => s.code === "ga4-zero-conversion-channel")).toBe(
      false,
    );
  });

  it("flags overall low engagement", () => {
    const signals = computeGa4Signals(
      input({ totals: { engagementRate: 0.2 } as Ga4SignalsInput["totals"] }),
    );
    expect(signals.some((s) => s.code === "ga4-low-engagement")).toBe(true);
  });

  it("reports the top channel and top landing page", () => {
    const signals = computeGa4Signals(
      input({
        channels: [
          { channel: "Organic Search", sessions: 700, conversions: 30, engagementRate: 0.7 },
          { channel: "Direct", sessions: 300, conversions: 10, engagementRate: 0.6 },
        ],
        landingPages: [
          { page: "/home", sessions: 400, conversions: 20 },
          { page: "/blog", sessions: 100, conversions: 2 },
        ],
      }),
    );
    const top = signals.find((s) => s.code === "ga4-top-channel");
    expect(top?.message).toContain("Organic Search");
    const land = signals.find((s) => s.code === "ga4-top-landing-page");
    expect(land?.message).toContain("/home");
  });

  it("emits nothing notable for a clean account", () => {
    const signals = computeGa4Signals(input());
    expect(signals.some((s) => s.severity === "warning")).toBe(false);
  });

  it("renders signals as a compact block, empty when none", () => {
    expect(renderGa4Signals([])).toBe("");
    const rendered = renderGa4Signals(
      computeGa4Signals(
        input({
          channels: [
            { channel: "Paid Search", sessions: 500, conversions: 0, engagementRate: 0.5 },
          ],
        }),
      ),
    );
    expect(rendered).toContain("[~]");
  });
});
