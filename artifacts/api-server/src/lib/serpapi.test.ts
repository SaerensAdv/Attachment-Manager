import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SerpApiError,
  SerpApiConfigError,
  fetchCompetitorAds,
  serpApiSearch,
  serpApiLimiter,
  serpApiCache,
} from "./serpapi";

const NOW_S = Math.floor(Date.UTC(2026, 5, 7) / 1000); // 2026-06-07

function adCreative(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    advertiser_id: "AR123",
    advertiser: "Concurrent BV",
    ad_creative_id: "CR1",
    format: "text",
    first_shown: NOW_S - 5 * 86400,
    last_shown: NOW_S,
    total_days_shown: 5,
    ...over,
  };
}

function serpResponse(
  ads: Record<string, unknown>[],
  total = ads.length,
): Response {
  return new Response(
    JSON.stringify({
      search_information: { total_results: total },
      ad_creatives: ads,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("serpapi client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.SERPAPI_API_KEY = "test-key";
    fetchMock = vi.fn(async () => serpResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    serpApiLimiter.reset();
    serpApiCache.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.SERPAPI_API_KEY;
  });

  it("throws SerpApiConfigError when the key is missing", async () => {
    delete process.env.SERPAPI_API_KEY;
    await expect(fetchCompetitorAds(["AR123"])).rejects.toThrow(
      SerpApiConfigError,
    );
  });

  it("caches identical searches within the TTL", async () => {
    fetchMock.mockResolvedValue(serpResponse([adCreative()]));
    await serpApiSearch("google_ads_transparency_center", { advertiser_id: "AR123" });
    await serpApiSearch("google_ads_transparency_center", { advertiser_id: "AR123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after the cache expires", async () => {
    fetchMock.mockImplementation(async () => serpResponse([adCreative()]));
    await serpApiSearch("google_ads_transparency_center", { advertiser_id: "AR123" });
    vi.advanceTimersByTime(61 * 60 * 1000);
    await serpApiSearch("google_ads_transparency_center", { advertiser_id: "AR123" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never sends the api_key as part of the cache key", async () => {
    fetchMock.mockResolvedValue(serpResponse([adCreative()]));
    await serpApiSearch("google_ads_transparency_center", { advertiser_id: "AR1" });
    process.env.SERPAPI_API_KEY = "different-key";
    // Same params → cache hit regardless of the key value.
    await serpApiSearch("google_ads_transparency_center", { advertiser_id: "AR1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("classifies a 401 as AUTH_ERROR", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401 }),
    );
    await expect(
      serpApiSearch("google_ads_transparency_center", { advertiser_id: "AR9" }),
    ).rejects.toMatchObject({ code: "AUTH_ERROR" });
  });

  it("classifies a 500 as API_ERROR", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
    await expect(
      serpApiSearch("google_ads_transparency_center", { advertiser_id: "AR8" }),
    ).rejects.toMatchObject({ code: "API_ERROR" });
  });

  it("treats an HTTP 200 with a top-level error as an empty result", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "hasn't returned any results" }), {
        status: 200,
      }),
    );
    const out = await fetchCompetitorAds(["AR123"]);
    expect(out.results[0].ads).toHaveLength(0);
    expect(out.results[0].totalResults).toBe(0);
  });

  it("retries once after a 429, halving the rate", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(serpResponse([adCreative()]));
    const p = serpApiSearch("google_ads_transparency_center", { advertiser_id: "AR7" });
    await vi.advanceTimersByTimeAsync(2000);
    const json = await p;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(Array.isArray((json as { ad_creatives?: unknown[] }).ad_creatives)).toBe(
      true,
    );
  });

  it("wraps a network failure as NETWORK_ERROR", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    await expect(
      serpApiSearch("google_ads_transparency_center", { advertiser_id: "AR6" }),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("interprets an AR-prefixed target as advertiser_id and others as text", async () => {
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      const u = new URL(String(url));
      if (u.searchParams.has("advertiser_id")) {
        return serpResponse([adCreative({ advertiser: "Tesla" })]);
      }
      return serpResponse([adCreative({ advertiser: "By Domain" })], 12);
    });
    const out = await fetchCompetitorAds(["AR17828074650563772417", "concurrent.be"]);
    expect(out.results).toHaveLength(2);
    expect(out.results[0].kind).toBe("advertiser_id");
    expect(out.results[1].kind).toBe("text");
    expect(out.results[1].totalResults).toBe(12);
  });

  it("keeps going when one target fails (best-effort)", async () => {
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      const u = new URL(String(url));
      if (u.searchParams.get("advertiser_id") === "AR111") {
        return new Response("boom", { status: 500 });
      }
      return serpResponse([adCreative()]);
    });
    const out = await fetchCompetitorAds(["AR111", "AR222"]);
    expect(out.results).toHaveLength(1);
    expect(out.results[0].target).toBe("AR222");
    expect(out.text).toContain("Niet opgehaald");
  });

  it("appends a Dutch signals section grounded in the fetched creatives", async () => {
    fetchMock.mockResolvedValue(
      serpResponse([
        adCreative({ total_days_shown: 200, first_shown: NOW_S - 200 * 86400 }),
      ]),
    );
    const out = await fetchCompetitorAds(["AR123"]);
    expect(out.text).toContain("### Signalen");
    expect(out.text).toContain("bewezen");
  });

  it("normalizes unix seconds to dates and parses format/days", async () => {
    fetchMock.mockResolvedValue(
      serpResponse([
        adCreative({ format: "VIDEO", total_days_shown: 79, first_shown: NOW_S - 79 * 86400 }),
      ]),
    );
    const out = await fetchCompetitorAds(["AR123"]);
    const ad = out.results[0].ads[0];
    expect(ad.format).toBe("video");
    expect(ad.totalDaysShown).toBe(79);
    expect(ad.firstShown).toBeInstanceOf(Date);
  });
});
