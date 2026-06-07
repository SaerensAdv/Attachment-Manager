import { describe, it, expect } from "vitest";
import {
  computePageSpeedSignals,
  renderPageSpeedSignals,
  type PageSpeedRecord,
} from "./pagespeed-signals";

function rec(over: Partial<PageSpeedRecord> = {}): PageSpeedRecord {
  return {
    url: "https://klant.be",
    strategy: "mobile",
    found: true,
    performanceScore: 95,
    lcpMs: 1800,
    cls: 0.02,
    inpMs: 80,
    ...over,
  };
}

describe("pagespeed signals", () => {
  it("flags a critically low performance score as high severity", () => {
    const signals = computePageSpeedSignals([rec({ performanceScore: 35 })]);
    const s = signals.find((x) => x.code === "pagespeed-score-critical");
    expect(s?.severity).toBe("high");
  });

  it("flags a merely low performance score as a warning", () => {
    const signals = computePageSpeedSignals([rec({ performanceScore: 70 })]);
    expect(signals.some((s) => s.code === "pagespeed-score-low")).toBe(true);
  });

  it("flags a critically slow LCP", () => {
    const signals = computePageSpeedSignals([rec({ lcpMs: 5200 })]);
    const s = signals.find((x) => x.code === "pagespeed-lcp-critical");
    expect(s?.severity).toBe("high");
  });

  it("flags an elevated CLS as a warning", () => {
    const signals = computePageSpeedSignals([rec({ cls: 0.15 })]);
    expect(signals.some((s) => s.code === "pagespeed-cls-elevated")).toBe(true);
  });

  it("flags slow interaction (INP/TBT)", () => {
    const signals = computePageSpeedSignals([rec({ inpMs: 600 })]);
    const s = signals.find((x) => x.code === "pagespeed-inp-critical");
    expect(s?.severity).toBe("high");
  });

  it("emits a healthy info signal for a fast page", () => {
    const signals = computePageSpeedSignals([rec()]);
    expect(signals.some((s) => s.code === "pagespeed-healthy")).toBe(true);
  });

  it("ignores a record that was not found", () => {
    const signals = computePageSpeedSignals([
      rec({ found: false, performanceScore: 0, lcpMs: 0, cls: 0, inpMs: 0 }),
    ]);
    expect(signals).toHaveLength(0);
  });

  it("renders signals as a compact block, empty when none", () => {
    expect(renderPageSpeedSignals([])).toBe("");
    const rendered = renderPageSpeedSignals(
      computePageSpeedSignals([rec({ performanceScore: 30 })]),
    );
    expect(rendered).toContain("[!]");
  });
});
