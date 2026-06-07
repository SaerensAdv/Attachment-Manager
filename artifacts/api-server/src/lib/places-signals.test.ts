import { describe, it, expect } from "vitest";
import {
  computePlaceSignals,
  renderPlaceSignals,
  type PlaceRecord,
} from "./places-signals";

function rec(over: Partial<PlaceRecord> = {}): PlaceRecord {
  return {
    query: "q",
    role: "client",
    name: "Klant",
    found: true,
    rating: 4.5,
    reviewCount: 100,
    primaryType: "car_repair",
    formattedAddress: "Straat 1",
    businessStatus: "OPERATIONAL",
    ...over,
  };
}

describe("places signals", () => {
  it("flags a non-operational client listing as high severity", () => {
    const signals = computePlaceSignals([
      rec({ businessStatus: "CLOSED_TEMPORARILY" }),
    ]);
    const s = signals.find((x) => x.code === "places-client-not-operational");
    expect(s?.severity).toBe("high");
  });

  it("flags a low client rating", () => {
    const signals = computePlaceSignals([rec({ rating: 3.5 })]);
    expect(signals.some((s) => s.code === "places-client-low-rating")).toBe(true);
  });

  it("flags too few client reviews", () => {
    const signals = computePlaceSignals([rec({ reviewCount: 5 })]);
    expect(signals.some((s) => s.code === "places-client-few-reviews")).toBe(
      true,
    );
  });

  it("flags a competitor with a strong review lead", () => {
    const signals = computePlaceSignals([
      rec({ reviewCount: 50 }),
      rec({ role: "competitor", name: "Concurrent", reviewCount: 200 }),
    ]);
    expect(
      signals.some((s) => s.code === "places-competitor-review-lead"),
    ).toBe(true);
  });

  it("emits nothing notable for a strong, well-reviewed client", () => {
    const signals = computePlaceSignals([rec({ rating: 4.8, reviewCount: 250 })]);
    expect(signals).toHaveLength(0);
  });

  it("ignores a client listing that was not found", () => {
    const signals = computePlaceSignals([
      rec({ found: false, rating: 0, reviewCount: 0 }),
    ]);
    expect(signals).toHaveLength(0);
  });

  it("renders signals as a compact block, empty when none", () => {
    expect(renderPlaceSignals([])).toBe("");
    const rendered = renderPlaceSignals(
      computePlaceSignals([rec({ businessStatus: "CLOSED_PERMANENTLY" })]),
    );
    expect(rendered).toContain("[!]");
  });
});
