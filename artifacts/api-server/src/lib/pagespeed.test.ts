import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PageSpeedConfigError,
  fetchPageSpeedReport,
  runPagespeed,
  pagespeedLimiter,
  pagespeedCache,
} from "./pagespeed";

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A runPagespeed response with the audits we read. */
function lighthouseResponse(p: {
  score?: number;
  lcpMs?: number;
  cls?: number;
  tbtMs?: number;
}): unknown {
  return {
    lighthouseResult: {
      categories: { performance: { score: p.score ?? 0.95 } },
      audits: {
        "largest-contentful-paint": { numericValue: p.lcpMs ?? 1800 },
        "cumulative-layout-shift": { numericValue: p.cls ?? 0.02 },
        "total-blocking-time": { numericValue: p.tbtMs ?? 80 },
      },
    },
  };
}

describe("pagespeed client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.PAGESPEED_API_KEY = "fake-psi-key";
    fetchMock = vi.fn(async () => jsonResponse(lighthouseResponse({})));
    vi.stubGlobal("fetch", fetchMock);
    pagespeedLimiter.reset();
    pagespeedCache.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.PAGESPEED_API_KEY;
  });

  it("throws PageSpeedConfigError when the key is missing", async () => {
    delete process.env.PAGESPEED_API_KEY;
    await expect(fetchPageSpeedReport(["https://klant.be"])).rejects.toThrow(
      PageSpeedConfigError,
    );
  });

  it("builds a report with metrics and signals for a slow page", async () => {
    fetchMock = vi.fn(async () =>
      jsonResponse(
        lighthouseResponse({ score: 0.35, lcpMs: 5200, cls: 0.3, tbtMs: 600 }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await fetchPageSpeedReport(["https://klant.be"]);
    expect(out.text).toContain("Landingspagina-snelheid");
    expect(out.text).toContain("== Signalen ==");
    expect(out.text).toMatch(/score 35\/100/);
    expect(out.records).toHaveLength(1);
    expect(out.records[0].performanceScore).toBe(35);
    expect(out.records[0].found).toBe(true);
  });

  it("prepends https:// to a bare hostname", async () => {
    await fetchPageSpeedReport(["klant.be"]);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("url=https%3A%2F%2Fklant.be");
  });

  it("reports a missing lighthouse result without throwing", async () => {
    fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchPageSpeedReport(["https://klant.be"]);
    expect(out.records[0].found).toBe(false);
    expect(out.text).toContain("geen Lighthouse-resultaat");
  });

  it("caches identical url+strategy within the TTL", async () => {
    await runPagespeed("https://klant.be", "mobile");
    await runPagespeed("https://klant.be", "mobile");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces a 403 as an auth error", async () => {
    fetchMock = vi.fn(async () =>
      jsonResponse({ error: { message: "key invalid" } }, 403),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(runPagespeed("https://klant.be", "mobile")).rejects.toMatchObject(
      { code: "AUTH_ERROR" },
    );
  });
});
