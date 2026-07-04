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

describe("fetchSeoReportSnapshot — branded vs non-branded split", () => {
  const periods = buildSeoReportPeriods(
    new Date("2026-06-07T10:00:00Z"),
    "monthly",
  );

  const currentQueries = [
    { key: "voorbeeld schoenen", clicks: 30, impressions: 100, ctr: 0.3, position: 2 },
    { key: "voorbeeld", clicks: 20, impressions: 50, ctr: 0.4, position: 1 },
    { key: "rode schoenen kopen", clicks: 40, impressions: 200, ctr: 0.2, position: 8 },
    { key: "sneakers online", clicks: 10, impressions: 100, ctr: 0.1, position: 12 },
  ];

  beforeEach(() => {
    scMock.mockReset();
    bingMock.mockReset();
    psMock.mockReset();
    snapMock.mockReset();
    snapMock.mockResolvedValue([]);
    bingMock.mockRejectedValue(new Error("no bing"));
    psMock.mockResolvedValue({ text: "", fetchedAt: new Date(), records: [] });
  });

  it("splits queries auto-derived from name/domain, impression-weighted position, leading with non-branded", async () => {
    scMock.mockImplementation(async (_site, opts) => {
      if (opts?.dateRange?.startDate === periods.current.startDate) {
        return scResult(
          { clicks: 100, impressions: 450, ctr: 0.22, position: 6 },
          currentQueries,
        );
      }
      throw new Error("no comparison data");
    });

    const out = await fetchSeoReportSnapshot(
      {
        name: "Voorbeeld Shop",
        searchConsoleSiteUrl: "sc-domain:voorbeeld.be",
      },
      1,
      "monthly",
      periods,
    );

    const split = out.metrics?.search.brandSplit;
    expect(split).toBeTruthy();
    expect(split?.autoDerived).toBe(true);
    expect(split?.manualTermCount).toBe(0);

    // "voorbeeld schoenen" (30) + "voorbeeld" (20) = 50 branded clicks;
    // "rode schoenen kopen" (40) + "sneakers online" (10) = 50 non-branded.
    expect(split?.current.branded.clicks).toBe(50);
    expect(split?.current.nonBranded.clicks).toBe(50);
    expect(split?.current.branded.clickShare).toBeCloseTo(0.5, 5);
    expect(split?.current.nonBranded.clickShare).toBeCloseTo(0.5, 5);
    expect(split?.current.branded.queryCount).toBe(2);
    expect(split?.current.nonBranded.queryCount).toBe(2);

    // Impression-weighted average position for the non-branded side:
    // (8*200 + 12*100) / 300 = 9.333…
    expect(split?.current.nonBranded.position).toBeCloseTo(9.3333, 3);
    // Branded: (2*100 + 1*50) / 150 = 1.666…
    expect(split?.current.branded.position).toBeCloseTo(1.6667, 3);

    // Top non-branded leads with the biggest non-branded term.
    expect(split?.topNonBranded[0]?.key).toBe("rode schoenen kopen");
    expect(split?.topNonBranded.some((q) => q.key === "voorbeeld")).toBe(false);

    // No comparison period → previous split absent.
    expect(split?.previous).toBeNull();

    // Team-facing block leads with the non-branded numbers.
    const block = out.blocks.find((b) => /branded vs non-branded/i.test(b));
    expect(block).toBeTruthy();
    expect(block?.indexOf("Non-branded:")).toBeLessThan(
      block?.indexOf("Branded:") ?? -1,
    );
  });

  it("uses a manual brand term to catch a variant the auto rules miss", async () => {
    const queries = [
      { key: "voorbeeld schoenen", clicks: 30, impressions: 100, ctr: 0.3, position: 2 },
      { key: "vrbld outlet", clicks: 25, impressions: 80, ctr: 0.3, position: 3 },
      { key: "rode schoenen kopen", clicks: 40, impressions: 200, ctr: 0.2, position: 8 },
    ];
    scMock.mockImplementation(async (_site, opts) => {
      if (opts?.dateRange?.startDate === periods.current.startDate) {
        return scResult(
          { clicks: 95, impressions: 380, ctr: 0.25, position: 5 },
          queries,
        );
      }
      throw new Error("no comparison data");
    });

    const out = await fetchSeoReportSnapshot(
      {
        name: "Voorbeeld Shop",
        searchConsoleSiteUrl: "sc-domain:voorbeeld.be",
        brandTerms: "vrbld",
      },
      1,
      "monthly",
      periods,
    );

    const split = out.metrics?.search.brandSplit;
    expect(split?.manualTermCount).toBe(1);
    // "vrbld outlet" is only branded because of the manual term.
    expect(split?.current.branded.clicks).toBe(55);
    expect(split?.current.nonBranded.clicks).toBe(40);
    expect(split?.topNonBranded.some((q) => q.key === "vrbld outlet")).toBe(
      false,
    );
  });

  it("captures a previous-period split when the comparison period is available", async () => {
    scMock.mockImplementation(async (_site, opts) => {
      const start = opts?.dateRange?.startDate;
      if (start === periods.current.startDate) {
        return scResult(
          { clicks: 100, impressions: 450, ctr: 0.22, position: 6 },
          currentQueries,
        );
      }
      if (start === periods.previous.startDate) {
        return scResult(
          { clicks: 60, impressions: 300, ctr: 0.2, position: 7 },
          [
            { key: "voorbeeld", clicks: 20, impressions: 60, ctr: 0.33, position: 2 },
            { key: "goedkope schoenen", clicks: 40, impressions: 240, ctr: 0.17, position: 9 },
          ],
        );
      }
      throw new Error("no year-ago data");
    });

    const out = await fetchSeoReportSnapshot(
      {
        name: "Voorbeeld Shop",
        searchConsoleSiteUrl: "sc-domain:voorbeeld.be",
      },
      1,
      "monthly",
      periods,
    );

    const split = out.metrics?.search.brandSplit;
    expect(split?.previous).toBeTruthy();
    expect(split?.previous?.branded.clicks).toBe(20);
    expect(split?.previous?.nonBranded.clicks).toBe(40);
  });
});

describe("fetchSeoReportSnapshot — comparison domains", () => {
  const periods = buildSeoReportPeriods(
    new Date("2026-06-07T10:00:00Z"),
    "monthly",
  );

  beforeEach(() => {
    scMock.mockReset();
    bingMock.mockReset();
    psMock.mockReset();
    snapMock.mockReset();
    snapMock.mockResolvedValue([]);
    bingMock.mockRejectedValue(new Error("no bing"));
    psMock.mockResolvedValue({ text: "", fetchedAt: new Date(), records: [] });
  });

  it("appends comparison-domain blocks without changing the primary metrics", async () => {
    scMock.mockImplementation(async (site, opts) => {
      const start = opts?.dateRange?.startDate;
      if (
        start === periods.current.startDate ||
        start === periods.previous.startDate
      ) {
        return scResult(
          {
            clicks: site === "sc-domain:voorbeeld.be" ? 100 : 7,
            impressions: 500,
            ctr: 0.2,
            position: 6,
          },
          [{ key: "iets", clicks: 5, impressions: 50, ctr: 0.1, position: 4 }],
        );
      }
      throw new Error("no year-ago data");
    });

    const out = await fetchSeoReportSnapshot(
      {
        name: "Voorbeeld Shop",
        searchConsoleSiteUrl: "sc-domain:voorbeeld.be",
        comparisonScUrls: "sc-domain:voorbeeld.com",
      },
      1,
      "monthly",
      periods,
    );

    // Primary metrics untouched: siteUrl + totals come from the primary domain.
    expect(out.metrics?.siteUrl).toBe("sc-domain:voorbeeld.be");
    expect(out.metrics?.search.current.clicks).toBe(100);

    const cmpBlocks = out.blocks.filter((b) => /VERGELIJKINGSDOMEIN/.test(b));
    expect(cmpBlocks).toHaveLength(2); // current + previous window
    expect(
      cmpBlocks.some((b) =>
        /sc-domain:voorbeeld\.com \(rapportperiode\)/.test(b),
      ),
    ).toBe(true);
    expect(
      cmpBlocks.some(
        (b) => /sc-domain:voorbeeld\.com/.test(b) && /vorige periode/.test(b),
      ),
    ).toBe(true);
  });

  it("drops the primary property and de-duplicates comparison entries", async () => {
    scMock.mockImplementation(async (_site, opts) => {
      const start = opts?.dateRange?.startDate;
      if (
        start === periods.current.startDate ||
        start === periods.previous.startDate
      ) {
        return scResult({ clicks: 10, impressions: 100, ctr: 0.1, position: 5 });
      }
      throw new Error("no data");
    });

    const out = await fetchSeoReportSnapshot(
      {
        name: "Voorbeeld Shop",
        searchConsoleSiteUrl: "sc-domain:voorbeeld.be",
        comparisonScUrls:
          "sc-domain:voorbeeld.be\nsc-domain:voorbeeld.com\nsc-domain:voorbeeld.com",
      },
      1,
      "monthly",
      periods,
    );

    const cmpCurrent = out.blocks.filter((b) =>
      /VERGELIJKINGSDOMEIN .*\(rapportperiode\)/.test(b),
    );
    expect(cmpCurrent).toHaveLength(1); // only voorbeeld.com, once; primary excluded
    expect(cmpCurrent[0]).toMatch(/sc-domain:voorbeeld\.com/);
  });

  it("adds no comparison blocks when the field is absent", async () => {
    scMock.mockImplementation(async (_site, opts) => {
      if (opts?.dateRange?.startDate === periods.current.startDate) {
        return scResult({ clicks: 10, impressions: 100, ctr: 0.1, position: 5 });
      }
      throw new Error("no data");
    });

    const out = await fetchSeoReportSnapshot(
      { name: "Voorbeeld Shop", searchConsoleSiteUrl: "sc-domain:voorbeeld.be" },
      1,
      "monthly",
      periods,
    );

    expect(out.blocks.some((b) => /VERGELIJKINGSDOMEIN/.test(b))).toBe(false);
  });
});
