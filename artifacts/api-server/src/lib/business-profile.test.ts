import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  BusinessProfileConfigError,
  fetchBusinessProfileReport,
  fetchDailyMetricTotals,
  normalizeLocationId,
  businessProfileLimiter,
  businessProfileCache,
} from "./business-profile";

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A fetchMultiDailyMetricsTimeSeries response: one datedValue per metric. */
function metricsResponse(values: Record<string, number>): unknown {
  return {
    multiDailyMetricTimeSeries: [
      {
        dailyMetricTimeSeries: Object.entries(values).map(([metric, v]) => ({
          dailyMetric: metric,
          timeSeries: {
            datedValues: [
              { date: { year: 2026, month: 5, day: 1 }, value: String(v) },
            ],
          },
        })),
      },
    ],
  };
}

describe("normalizeLocationId", () => {
  it("accepts a bare numeric id", () => {
    expect(normalizeLocationId("123")).toBe("123");
  });
  it("extracts the id from a resource name", () => {
    expect(normalizeLocationId("accounts/9/locations/456")).toBe("456");
    expect(normalizeLocationId("locations/789")).toBe("789");
  });
  it("throws on empty input", () => {
    expect(() => normalizeLocationId("  ")).toThrow(BusinessProfileConfigError);
  });
  it("throws on a junk id", () => {
    expect(() => normalizeLocationId("../etc")).toThrow(
      BusinessProfileConfigError,
    );
  });
});

describe("business profile client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const TOKEN_OK = {
    access_token: "fake-access-token",
    expires_in: 3600,
  };

  beforeEach(() => {
    process.env.GOOGLE_ADS_OAUTH_CLIENT_ID = "cid";
    process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET = "secret";
    process.env.GOOGLE_OAUTH_READONLY_REFRESH_TOKEN = "refresh";
    fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("oauth2")) return jsonResponse(TOKEN_OK);
      return jsonResponse(
        metricsResponse({
          BUSINESS_IMPRESSIONS_MOBILE_SEARCH: 2000,
          BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: 1000,
          CALL_CLICKS: 40,
          WEBSITE_CLICKS: 60,
          BUSINESS_DIRECTION_REQUESTS: 30,
          BUSINESS_CONVERSATIONS: 10,
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    businessProfileLimiter.reset();
    businessProfileCache.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_ADS_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET;
    delete process.env.GOOGLE_OAUTH_READONLY_REFRESH_TOKEN;
  });

  it("throws a config error for a missing location id", async () => {
    await expect(fetchBusinessProfileReport("")).rejects.toThrow(
      BusinessProfileConfigError,
    );
  });

  it("builds a report with totals and signals", async () => {
    const out = await fetchBusinessProfileReport("locations/123");
    expect(out.text).toContain("Business Profile-locatie: 123");
    expect(out.text).toContain("== Totalen ==");
    expect(out.text).toContain("Vertoningen (totaal): 3000");
    expect(out.text).toContain("Telefoonklikken: 40");
    expect(out.report.impressions).toBe(3000);
    expect(out.report.actions).toBe(140);
  });

  it("sums daily values per metric", async () => {
    const totals = await fetchDailyMetricTotals(
      "tok",
      "123",
      new Date("2026-05-01"),
      new Date("2026-05-30"),
    );
    expect(totals.CALL_CLICKS).toBe(40);
    expect(totals.BUSINESS_IMPRESSIONS_MOBILE_SEARCH).toBe(2000);
  });

  it("caches identical windows within the TTL", async () => {
    const s = new Date("2026-05-01");
    const e = new Date("2026-05-30");
    await fetchDailyMetricTotals("tok", "123", s, e);
    await fetchDailyMetricTotals("tok", "123", s, e);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces a 403 (e.g. not allowlisted) as an auth error", async () => {
    fetchMock = vi.fn(async () =>
      jsonResponse({ error: { message: "not allowlisted" } }, 403),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchDailyMetricTotals(
        "tok",
        "123",
        new Date("2026-05-01"),
        new Date("2026-05-30"),
      ),
    ).rejects.toMatchObject({ code: "AUTH_ERROR" });
  });
});
