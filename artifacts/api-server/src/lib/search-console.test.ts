import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SearchConsoleConfigError,
  fetchSearchConsoleReport,
  searchConsoleQuery,
  validateSiteUrl,
  searchConsoleLimiter,
  searchConsoleCache,
} from "./search-console";
import { GoogleOAuthConfigError } from "./google-oauth";

const NOW = Date.UTC(2026, 5, 7); // 2026-06-07

function scRow(
  key: string,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    keys: [key],
    clicks: 10,
    impressions: 200,
    ctr: 0.05,
    position: 3,
    ...over,
  };
}

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Routes the mocked fetch to a token / totals / query / page response. */
function makeFetch(opts: {
  queries?: Record<string, unknown>[];
  pages?: Record<string, unknown>[];
  totals?: Record<string, unknown>;
} = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("oauth2.googleapis.com/token")) {
      return jsonResponse({ access_token: "fake-access-token" });
    }
    const body = JSON.parse(String(init?.body ?? "{}"));
    const dim = body.dimensions?.[0];
    if (!body.dimensions || body.dimensions.length === 0) {
      return jsonResponse({
        rows: [opts.totals ?? { clicks: 100, impressions: 5000, ctr: 0.02, position: 8.5 }],
      });
    }
    if (dim === "query") return jsonResponse({ rows: opts.queries ?? [] });
    if (dim === "page") return jsonResponse({ rows: opts.pages ?? [] });
    return jsonResponse({ rows: [] });
  });
}

describe("search console client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    process.env.GOOGLE_ADS_OAUTH_CLIENT_ID = "cid";
    process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET = "secret";
    process.env.GOOGLE_OAUTH_READONLY_REFRESH_TOKEN = "refresh";
    fetchMock = makeFetch();
    vi.stubGlobal("fetch", fetchMock);
    searchConsoleLimiter.reset();
    searchConsoleCache.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_ADS_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET;
    delete process.env.GOOGLE_OAUTH_READONLY_REFRESH_TOKEN;
  });

  it("validates the property URL", () => {
    expect(validateSiteUrl("sc-domain:voorbeeld.be")).toBe("sc-domain:voorbeeld.be");
    expect(validateSiteUrl("https://voorbeeld.be/")).toBe("https://voorbeeld.be/");
    expect(() => validateSiteUrl("voorbeeld.be")).toThrow(SearchConsoleConfigError);
    expect(() => validateSiteUrl("")).toThrow(SearchConsoleConfigError);
  });

  it("throws GoogleOAuthConfigError when the refresh token is missing", async () => {
    delete process.env.GOOGLE_OAUTH_READONLY_REFRESH_TOKEN;
    await expect(
      fetchSearchConsoleReport("sc-domain:voorbeeld.be"),
    ).rejects.toThrow(GoogleOAuthConfigError);
  });

  it("builds a report with totals, top queries and a signals section", async () => {
    fetchMock = makeFetch({
      queries: [
        scRow("dakwerken antwerpen", {
          clicks: 5,
          impressions: 800,
          ctr: 0.006,
          position: 12,
        }),
        scRow("merknaam", { clicks: 40, impressions: 1000, position: 1, ctr: 0.04 }),
      ],
      pages: [scRow("https://voorbeeld.be/dakwerken", { clicks: 5 })],
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await fetchSearchConsoleReport("sc-domain:voorbeeld.be");
    expect(out.text).toContain("Search Console: sc-domain:voorbeeld.be");
    expect(out.text).toContain("== Totalen ==");
    expect(out.text).toContain("dakwerken antwerpen");
    expect(out.text).toContain("== Signalen ==");
    expect(out.report.topQueries).toHaveLength(2);
    expect(out.report.startDate).toBe("2026-05-08");
    expect(out.report.endDate).toBe("2026-06-04");
  });

  it("caches identical queries within the TTL (cache key ignores the token)", async () => {
    const body = { startDate: "2026-05-07", endDate: "2026-06-04", dimensions: ["query"] };
    await searchConsoleQuery("token-a", "sc-domain:voorbeeld.be", body);
    await searchConsoleQuery("token-b", "sc-domain:voorbeeld.be", body);
    const queryCalls = fetchMock.mock.calls.filter(
      (c) => !String(c[0]).includes("oauth2"),
    );
    expect(queryCalls).toHaveLength(1);
  });

  it("surfaces a 403 as an auth error", async () => {
    fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("oauth2")) {
        return jsonResponse({ access_token: "t" });
      }
      return jsonResponse({ error: { message: "permission denied" } }, 403);
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchSearchConsoleReport("sc-domain:voorbeeld.be"),
    ).rejects.toMatchObject({ code: "AUTH_ERROR" });
  });
});
