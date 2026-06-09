import { describe, it, expect } from "vitest";
import {
  computeCrawlStats,
  computeCrawlSignals,
  renderCrawlSignals,
  type CrawlRecord,
} from "./screaming-frog-signals";

function rec(over: Partial<CrawlRecord> = {}): CrawlRecord {
  return {
    url: "https://klant.be/",
    statusCode: 200,
    contentType: "text/html; charset=utf-8",
    indexable: true,
    indexabilityStatus: "",
    title: "Een unieke titel",
    metaDescription: "Een unieke meta description voor deze pagina.",
    h1: "Een H1",
    responseTimeMs: 300,
    sizeBytes: 50_000,
    redirectUrl: "",
    ...over,
  };
}

describe("crawl stats", () => {
  it("counts status-code buckets across all URLs", () => {
    const stats = computeCrawlStats([
      rec({ url: "a", statusCode: 404 }),
      rec({ url: "b", statusCode: 500 }),
      rec({ url: "c", statusCode: 301, redirectUrl: "d" }),
    ]);
    expect(stats.clientErrors).toBe(1);
    expect(stats.serverErrors).toBe(1);
    expect(stats.redirects).toBe(1);
  });

  it("scopes content checks to indexable HTML 200 pages", () => {
    const stats = computeCrawlStats([
      rec({ url: "a", title: "" }),
      rec({ url: "b", statusCode: 404, title: "" }), // not 200 -> ignored
      rec({ url: "c", indexable: false, title: "" }), // not indexable -> ignored
    ]);
    expect(stats.missingTitles).toBe(1);
    expect(stats.nonIndexable).toBe(1);
  });

  it("groups duplicate titles case-insensitively", () => {
    const stats = computeCrawlStats([
      rec({ url: "a", title: "Home" }),
      rec({ url: "b", title: "home" }),
      rec({ url: "c", title: "Other" }),
    ]);
    expect(stats.duplicateTitles).toBe(1);
  });

  it("detects redirect chains and loops from the export", () => {
    const chain = computeCrawlStats([
      rec({ url: "a", statusCode: 301, redirectUrl: "b" }),
      rec({ url: "b", statusCode: 301, redirectUrl: "c" }),
      rec({ url: "c", statusCode: 200 }),
    ]);
    expect(chain.redirectChains).toBe(1);
    expect(chain.redirectLoops).toBe(0);

    const loop = computeCrawlStats([
      rec({ url: "x", statusCode: 301, redirectUrl: "y" }),
      rec({ url: "y", statusCode: 301, redirectUrl: "x" }),
    ]);
    expect(loop.redirectLoops).toBeGreaterThan(0);
  });

  it("treats every row as HTML when no content-type column exists", () => {
    const stats = computeCrawlStats([rec({ contentType: "", title: "" })]);
    expect(stats.missingTitles).toBe(1);
  });
});

describe("crawl signals", () => {
  it("flags 5xx as high severity", () => {
    const stats = computeCrawlStats([rec({ statusCode: 500 })]);
    const s = computeCrawlSignals(stats).find(
      (x) => x.code === "crawl-server-errors",
    );
    expect(s?.severity).toBe("high");
  });

  it("escalates many 4xx errors to high", () => {
    const records = Array.from({ length: 12 }, (_v, i) =>
      rec({ url: `u${i}`, statusCode: 404 }),
    );
    const s = computeCrawlSignals(computeCrawlStats(records)).find(
      (x) => x.code === "crawl-client-errors",
    );
    expect(s?.severity).toBe("high");
  });

  it("flags a redirect loop as high", () => {
    const stats = computeCrawlStats([
      rec({ url: "x", statusCode: 301, redirectUrl: "y" }),
      rec({ url: "y", statusCode: 301, redirectUrl: "x" }),
    ]);
    expect(
      computeCrawlSignals(stats).some(
        (x) => x.code === "crawl-redirect-loops" && x.severity === "high",
      ),
    ).toBe(true);
  });

  it("emits a healthy info signal for a clean crawl", () => {
    const stats = computeCrawlStats([rec(), rec({ url: "https://klant.be/2", title: "Andere titel", metaDescription: "Andere description hier." })]);
    expect(
      computeCrawlSignals(stats).some((x) => x.code === "crawl-healthy"),
    ).toBe(true);
  });

  it("renders signals as a compact block, empty when none", () => {
    expect(renderCrawlSignals([])).toBe("");
    const rendered = renderCrawlSignals(
      computeCrawlSignals(computeCrawlStats([rec({ statusCode: 500 })])),
    );
    expect(rendered).toContain("[!]");
  });
});
