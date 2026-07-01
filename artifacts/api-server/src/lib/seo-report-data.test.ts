import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildSeoReportPeriods,
  fetchSeoReportSnapshot,
  type SeoSearchTotals,
} from "./seo-report-data";
import { fetchSearchConsoleReport } from "./search-console";
import { fetchBingReport } from "./bing-webmaster";
import { fetchPageSpeedReport } from "./pagespeed";
import { listSnapshots } from "./crawl-history";
import type { CrawlStats } from "./screaming-frog-signals";

vi.mock("./search-console", () => ({ fetchSearchConsoleReport: vi.fn() }));
vi.mock("./bing-webmaster", () => ({ fetchBingReport: vi.fn() }));
vi.mock("./pagespeed", () => ({ fetchPageSpeedReport: vi.fn() }));
vi.mock("./crawl-history", () => ({ listSnapshots: vi.fn() }));

const scMock = vi.mocked(fetchSearchConsoleReport);
const bingMock = vi.mocked(fetchBingReport);
const psMock = vi.mocked(fetchPageSpeedReport);
const snapMock = vi.mocked(listSnapshots);

function scResult(
  totals: SeoSearchTotals,
  topQueries: {
    key: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }[] = [],
) {
  return {
    text: "sc-text",
    fetchedAt: new Date(),
    report: {
      siteUrl: "sc-domain:voorbeeld.be",
      startDate: "s",
      endDate: "e",
      totals,
      topQueries,
      topPages: [],
    },
  };
}

const fakeStats: CrawlStats = {
  totalUrls: 120,
  clientErrors: 3,
  serverErrors: 1,
  redirects: 5,
  redirectChains: 0,
  redirectLoops: 0,
  missingTitles: 2,
  duplicateTitles: 1,
  missingMetaDescriptions: 4,
  duplicateMetaDescriptions: 0,
  missingH1: 6,
  nonIndexable: 7,
  slowPages: 8,
  largePages: 9,
};

describe("buildSeoReportPeriods — monthly", () => {
  it("reports the previous calendar month with PoP + YoY", () => {
    const p = buildSeoReportPeriods(new Date("2026-06-07T10:00:00Z"), "monthly");
    expect(p.current).toMatchObject({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    expect(p.previous).toMatchObject({
      startDate: "2026-04-01",
      endDate: "2026-04-30",
    });
    expect(p.yearAgo).toMatchObject({
      startDate: "2025-05-01",
      endDate: "2025-05-31",
    });
  });

  it("crosses the year boundary in January", () => {
    const p = buildSeoReportPeriods(new Date("2026-01-15T10:00:00Z"), "monthly");
    expect(p.current).toMatchObject({
      startDate: "2025-12-01",
      endDate: "2025-12-31",
    });
    expect(p.previous.startDate).toBe("2025-11-01");
    expect(p.yearAgo).toMatchObject({
      startDate: "2024-12-01",
      endDate: "2024-12-31",
    });
  });

  it("anchors on Brussels time at the start of the month", () => {
    // 00:30 Brussels on Jun 1 is still May 31 22:30 UTC — must still report May.
    const p = buildSeoReportPeriods(new Date("2026-05-31T22:30:00Z"), "monthly");
    expect(p.current.startDate).toBe("2026-05-01");
  });
});

describe("buildSeoReportPeriods — quarterly", () => {
  it("reports the previous completed quarter with PoP + YoY", () => {
    const p = buildSeoReportPeriods(new Date("2026-05-07T10:00:00Z"), "quarterly");
    expect(p.current).toMatchObject({
      startDate: "2026-01-01",
      endDate: "2026-03-31",
      label: "Q1 2026",
    });
    expect(p.previous).toMatchObject({
      startDate: "2025-10-01",
      endDate: "2025-12-31",
      label: "Q4 2025",
    });
    expect(p.yearAgo).toMatchObject({
      startDate: "2025-01-01",
      endDate: "2025-03-31",
      label: "Q1 2025",
    });
  });

  it("crosses the year boundary in January (reports Q4 last year)", () => {
    const p = buildSeoReportPeriods(new Date("2026-01-10T10:00:00Z"), "quarterly");
    expect(p.current).toMatchObject({
      startDate: "2025-10-01",
      endDate: "2025-12-31",
      label: "Q4 2025",
    });
    expect(p.previous.label).toBe("Q3 2025");
    expect(p.yearAgo.label).toBe("Q4 2024");
  });
});

describe("fetchSeoReportSnapshot — best-effort degradation", () => {
  beforeEach(() => {
    scMock.mockReset();
    bingMock.mockReset();
    psMock.mockReset();
    snapMock.mockReset();
  });

  it("degrades to notes with no Search Console property and no crawl", async () => {
    snapMock.mockResolvedValue([]);
    const periods = buildSeoReportPeriods(new Date("2026-06-07T10:00:00Z"), "monthly");
    const out = await fetchSeoReportSnapshot(
      { searchConsoleSiteUrl: "" },
      1,
      "monthly",
      periods,
    );
    expect(out.metrics).toBeNull();
    expect(out.blocks).toHaveLength(0);
    expect(out.notes.some((n) => /Search Console-property/.test(n))).toBe(true);
    expect(out.notes.some((n) => /crawl/i.test(n))).toBe(true);
    expect(scMock).not.toHaveBeenCalled();
    expect(psMock).not.toHaveBeenCalled();
  });

  it("builds metrics from SC current even when PoP/YoY and other sources fail", async () => {
    const periods = buildSeoReportPeriods(new Date("2026-06-07T10:00:00Z"), "monthly");
    scMock.mockImplementation(async (_site, opts) => {
      const start = opts?.dateRange?.startDate;
      if (start === periods.current.startDate) {
        return scResult(
          { clicks: 100, impressions: 1000, ctr: 0.1, position: 5 },
          [{ key: "schoenen kopen", clicks: 100, impressions: 1000, ctr: 0.1, position: 5 }],
        );
      }
      throw new Error("no data for comparison period");
    });
    snapMock.mockResolvedValue([
      { id: 1, clientId: 1, crawledAt: new Date("2026-05-20T00:00:00Z"), stats: fakeStats },
    ]);
    psMock.mockResolvedValue({ text: "", fetchedAt: new Date(), records: [] });

    const out = await fetchSeoReportSnapshot(
      { searchConsoleSiteUrl: "sc-domain:voorbeeld.be" },
      1,
      "monthly",
      periods,
    );

    expect(out.metrics).not.toBeNull();
    expect(out.metrics?.search.current.clicks).toBe(100);
    expect(out.metrics?.search.previous).toBeNull();
    expect(out.metrics?.search.yearAgo).toBeNull();
    expect(out.metrics?.search.topQueries).toHaveLength(1);
    // Crawl snapshot is attached to metrics + emitted as a block.
    expect(out.metrics?.crawl?.totalUrls).toBe(120);
    expect(out.blocks.some((b) => /Technische crawl/.test(b))).toBe(true);
    // Both comparison-period failures surface as notes.
    expect(out.notes.some((n) => /vorige periode/.test(n))).toBe(true);
    expect(out.notes.some((n) => /Jaar-op-jaar/.test(n))).toBe(true);
  });
});
