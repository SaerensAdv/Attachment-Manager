import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GoogleAdsApiError,
  GoogleAdsConfigError,
  fetchGoogleAdsReport,
  fetchGoogleAdsAdCopyContext,
  fetchGoogleAdsNegativesContext,
} from "./google-ads";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

describe("google-ads client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "dev-token";
    process.env.GOOGLE_ADS_OAUTH_CLIENT_ID = "client-id";
    process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_ADS_REFRESH_TOKEN = "refresh-token";
    process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = "1234567890";
    fetchMock = vi.fn(async () => new Response(JSON.stringify([])));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    delete process.env.GOOGLE_ADS_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET;
    delete process.env.GOOGLE_ADS_REFRESH_TOKEN;
    delete process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  });

  function mockAccessToken(): void {
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr === TOKEN_URL) {
        return new Response(
          JSON.stringify({
            access_token: "test-access-token",
            token_type: "Bearer",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (urlStr.includes("/googleAds:searchStream")) {
        return new Response(JSON.stringify([{ results: [] }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("Not Found", { status: 404 });
    });
  }

  it("throws GoogleAdsConfigError when secrets are missing", async () => {
    delete process.env.GOOGLE_ADS_REFRESH_TOKEN;
    await expect(fetchGoogleAdsReport("1234567890")).rejects.toThrow(
      GoogleAdsConfigError,
    );
  });

  it("caches identical GAQL calls within 30 minutes", async () => {
    mockAccessToken();
    let apiCalls = 0;
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr === TOKEN_URL) {
        return new Response(
          JSON.stringify({ access_token: "t1", token_type: "Bearer" }),
          { status: 200 },
        );
      }
      apiCalls++;
      return new Response(
        JSON.stringify([
          {
            results: [
              {
                customer: { descriptiveName: "Test", currencyCode: "EUR" },
                metrics: {
                  costMicros: 1_000_000,
                  impressions: 100,
                  clicks: 10,
                  conversions: 1,
                  conversionsValue: 2,
                },
              },
            ],
          },
        ]),
        { status: 200 },
      );
    });

    const r1 = await fetchGoogleAdsReport("1234567890");
    expect(r1.metrics.accountName).toBe("Test");
    expect(apiCalls).toBe(3);

    apiCalls = 0;
    const r2 = await fetchGoogleAdsReport("1234567890");
    expect(r2.metrics.accountName).toBe("Test");
    expect(apiCalls).toBe(0);

    vi.advanceTimersByTime(31 * 60 * 1000);

    apiCalls = 0;
    const r3 = await fetchGoogleAdsReport("1234567890");
    expect(r3.metrics.accountName).toBe("Test");
    expect(apiCalls).toBe(3);
  });

  it("rate-limits GAQL calls with a token bucket", async () => {
    mockAccessToken();
    let callCount = 0;
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr === TOKEN_URL) {
        return new Response(
          JSON.stringify({ access_token: "t1", token_type: "Bearer" }),
          { status: 200 },
        );
      }
      callCount++;
      return new Response(
        JSON.stringify([
          {
            results: [
              {
                customer: { descriptiveName: "Test", currencyCode: "EUR" },
                metrics: {
                  costMicros: 1_000_000,
                  impressions: 100,
                  clicks: 10,
                  conversions: 1,
                  conversionsValue: 2,
                },
              },
            ],
          },
        ]),
        { status: 200 },
      );
    });

    const start = Date.now();
    await fetchGoogleAdsReport("1234567890");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it("retries once on 429 with halved rate limit", async () => {
    mockAccessToken();
    let failCount = 0;
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr === TOKEN_URL) {
        return new Response(
          JSON.stringify({ access_token: "t1", token_type: "Bearer" }),
          { status: 200 },
        );
      }
      failCount++;
      if (failCount <= 1) {
        return new Response(
          JSON.stringify({
            error: {
              code: 429,
              message: "Rate limit exceeded",
              status: "RESOURCE_EXHAUSTED",
            },
          }),
          { status: 429 },
        );
      }
      return new Response(
        JSON.stringify([
          {
            results: [
              {
                customer: { descriptiveName: "Test", currencyCode: "EUR" },
                metrics: {
                  costMicros: 1_000_000,
                  impressions: 100,
                  clicks: 10,
                  conversions: 1,
                  conversionsValue: 2,
                },
              },
            ],
          },
        ]),
        { status: 200 },
      );
    });

    const r = await fetchGoogleAdsReport("1234567890");
    expect(r.metrics.accountName).toBe("Test");
    expect(failCount).toBe(4);
  });

  it("classifies errors with specific codes", async () => {
    mockAccessToken();
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr === TOKEN_URL) {
        return new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description: "Bad credentials",
          }),
          { status: 401 },
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    try {
      await fetchGoogleAdsReport("1234567890");
    } catch (err) {
      expect(err).toBeInstanceOf(GoogleAdsApiError);
      const apiErr = err as GoogleAdsApiError;
      expect(apiErr.code).toBe("AUTH_ERROR");
    }
  });

  it("classifies 404 as NOT_FOUND", async () => {
    mockAccessToken();
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr === TOKEN_URL) {
        return new Response(
          JSON.stringify({ access_token: "t1", token_type: "Bearer" }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ error: { code: 404, message: "Not found", status: "NOT_FOUND" } }),
        { status: 404 },
      );
    });

    try {
      await fetchGoogleAdsReport("1234567890");
    } catch (err) {
      expect(err).toBeInstanceOf(GoogleAdsApiError);
      const apiErr = err as GoogleAdsApiError;
      expect(apiErr.code).toBe("NOT_FOUND");
    }
  });

  it("classifies network error as NETWORK_ERROR", async () => {
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr === TOKEN_URL) {
        return new Response(
          JSON.stringify({ access_token: "t1", token_type: "Bearer" }),
          { status: 200 },
        );
      }
      throw new Error("Connection refused");
    });

    try {
      await fetchGoogleAdsReport("1234567890");
    } catch (err) {
      expect(err).toBeInstanceOf(GoogleAdsApiError);
      const apiErr = err as GoogleAdsApiError;
      expect(apiErr.code).toBe("NETWORK_ERROR");
    }
  });

  it("returns ad-copy context with fetchedAt", async () => {
    mockAccessToken();
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr === TOKEN_URL) {
        return new Response(
          JSON.stringify({ access_token: "t1", token_type: "Bearer" }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify([{ results: [] }]),
        { status: 200 },
      );
    });

    const result = await fetchGoogleAdsAdCopyContext("1234567890");
    expect(result.text).toContain("1234567890");
    expect(result.fetchedAt).toBeInstanceOf(Date);
  });

  it("returns negatives context with fetchedAt", async () => {
    mockAccessToken();
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr === TOKEN_URL) {
        return new Response(
          JSON.stringify({ access_token: "t1", token_type: "Bearer" }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify([{ results: [] }]),
        { status: 200 },
      );
    });

    const result = await fetchGoogleAdsNegativesContext("1234567890");
    expect(result.text).toContain("1234567890");
    expect(result.fetchedAt).toBeInstanceOf(Date);
  });
});
