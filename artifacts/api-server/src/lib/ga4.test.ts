import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  Ga4ConfigError,
  fetchGa4Report,
  ga4RunReport,
  validatePropertyId,
  ga4Limiter,
  ga4Cache,
} from "./ga4";
import { GoogleOAuthConfigError } from "./google-oauth";

const NOW = Date.UTC(2026, 5, 7); // 2026-06-07

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Build a GA4 runReport-shaped response from header names + row tuples. */
function ga4Response(
  metricNames: string[],
  rows: { dims?: string[]; metrics: number[] }[],
): unknown {
  return {
    metricHeaders: metricNames.map((name) => ({ name })),
    rows: rows.map((r) => ({
      dimensionValues: (r.dims ?? []).map((value) => ({ value })),
      metricValues: r.metrics.map((v) => ({ value: String(v) })),
    })),
  };
}

/** Routes the mocked fetch to token / totals / channel / landingPage responses. */
function makeFetch(
  opts: {
    totals?: number[];
    channels?: { dims?: string[]; metrics: number[] }[];
    landingPages?: { dims?: string[]; metrics: number[] }[];
  } = {},
) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("oauth2.googleapis.com/token")) {
      return jsonResponse({ access_token: "fake-access-token" });
    }
    const body = JSON.parse(String(init?.body ?? "{}"));
    const dim = body.dimensions?.[0]?.name;
    if (!body.dimensions || body.dimensions.length === 0) {
      return jsonResponse(
        ga4Response(
          ["sessions", "totalUsers", "screenPageViews", "conversions", "engagementRate"],
          [{ metrics: opts.totals ?? [5000, 4000, 12000, 120, 0.55] }],
        ),
      );
    }
    if (dim === "sessionDefaultChannelGroup") {
      return jsonResponse(
        ga4Response(
          ["sessions", "conversions", "engagementRate"],
          opts.channels ?? [],
        ),
      );
    }
    if (dim === "landingPage") {
      return jsonResponse(
        ga4Response(["sessions", "conversions"], opts.landingPages ?? []),
      );
    }
    return jsonResponse(ga4Response([], []));
  });
}

describe("ga4 client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    process.env.GOOGLE_ADS_OAUTH_CLIENT_ID = "cid";
    process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET = "secret";
    process.env.GOOGLE_OAUTH_READONLY_REFRESH_TOKEN = "refresh";
    fetchMock = makeFetch();
    vi.stubGlobal("fetch", fetchMock);
    ga4Limiter.reset();
    ga4Cache.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_ADS_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET;
    delete process.env.GOOGLE_OAUTH_READONLY_REFRESH_TOKEN;
  });

  it("validates and normalizes the property id", () => {
    expect(validatePropertyId("123456789")).toBe("123456789");
    expect(validatePropertyId("properties/123456789")).toBe("123456789");
    expect(() => validatePropertyId("abc")).toThrow(Ga4ConfigError);
    expect(() => validatePropertyId("")).toThrow(Ga4ConfigError);
  });

  it("throws GoogleOAuthConfigError when the refresh token is missing", async () => {
    delete process.env.GOOGLE_OAUTH_READONLY_REFRESH_TOKEN;
    await expect(fetchGa4Report("123456789")).rejects.toThrow(
      GoogleOAuthConfigError,
    );
  });

  it("builds a report with totals, channels, landing pages and signals", async () => {
    fetchMock = makeFetch({
      totals: [3000, 2500, 8000, 90, 0.3],
      channels: [
        { dims: ["Organic Search"], metrics: [1500, 50, 0.6] },
        { dims: ["Paid Search"], metrics: [800, 0, 0.4] },
      ],
      landingPages: [{ dims: ["/offerte"], metrics: [600, 40] }],
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await fetchGa4Report("123456789");
    expect(out.text).toContain("GA4 property: 123456789");
    expect(out.text).toContain("== Totalen ==");
    expect(out.text).toContain("Organic Search");
    expect(out.text).toContain("== Signalen ==");
    // Paid Search has 800 sessions and 0 conversions → zero-conversion signal.
    expect(out.text).toContain("Paid Search");
    expect(out.report.channels).toHaveLength(2);
    expect(out.report.startDate).toBe("2026-05-10");
    expect(out.report.endDate).toBe("2026-06-06");
  });

  it("caches identical reports within the TTL (cache key ignores the token)", async () => {
    const body = {
      dateRanges: [{ startDate: "2026-05-10", endDate: "2026-06-06" }],
      metrics: [{ name: "sessions" }],
    };
    await ga4RunReport("token-a", "123456789", body);
    await ga4RunReport("token-b", "123456789", body);
    const reportCalls = fetchMock.mock.calls.filter(
      (c) => !String(c[0]).includes("oauth2"),
    );
    expect(reportCalls).toHaveLength(1);
  });

  it("surfaces a 403 as an auth error", async () => {
    fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("oauth2")) {
        return jsonResponse({ access_token: "t" });
      }
      return jsonResponse({ error: { message: "permission denied" } }, 403);
    });
    vi.stubGlobal("fetch", fetchMock);
    // Totals + channels + pages are best-effort, so the report itself does not
    // throw; the low-level call does. Assert on the low-level classification.
    await expect(
      ga4RunReport("t", "123456789", { metrics: [{ name: "sessions" }] }),
    ).rejects.toMatchObject({ code: "AUTH_ERROR" });
  });
});
