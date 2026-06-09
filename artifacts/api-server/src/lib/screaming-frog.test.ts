import { describe, it, expect } from "vitest";
import { parseCsv, parseCrawlCsv, summarizeCrawl } from "./screaming-frog";

describe("parseCsv", () => {
  it("handles quoted fields with commas, escaped quotes and newlines", () => {
    const csv = 'a,b,c\r\n"x,1","say ""hi""","line1\nline2"\r\n';
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(["a", "b", "c"]);
    expect(rows[1]).toEqual(["x,1", 'say "hi"', "line1\nline2"]);
  });

  it("strips a UTF-8 BOM", () => {
    const rows = parseCsv("\uFEFFa,b\n1,2\n");
    expect(rows[0]).toEqual(["a", "b"]);
  });
});

const SF_HEADER =
  "Address,Content Type,Status Code,Indexability,Indexability Status,Title 1,Meta Description 1,H1-1,Response Time,Size (Bytes),Redirect URL";

describe("parseCrawlCsv", () => {
  it("maps Screaming Frog 'Internal: All' columns into records", () => {
    const csv = [
      SF_HEADER,
      'https://klant.be/,text/html; charset=UTF-8,200,Indexable,,Titel,Beschrijving,Kop,0.412,82345,',
      'https://klant.be/oud,text/html,301,"Non-Indexable","Redirected",,,,0.1,0,https://klant.be/nieuw',
    ].join("\n");
    const records = parseCrawlCsv(csv);
    expect(records).toHaveLength(2);
    expect(records[0].statusCode).toBe(200);
    expect(records[0].indexable).toBe(true);
    expect(records[0].responseTimeMs).toBe(412);
    expect(records[0].sizeBytes).toBe(82345);
    expect(records[1].statusCode).toBe(301);
    expect(records[1].indexable).toBe(false);
    expect(records[1].redirectUrl).toBe("https://klant.be/nieuw");
  });

  it("returns no records for an empty or header-only export", () => {
    expect(parseCrawlCsv("")).toHaveLength(0);
    expect(parseCrawlCsv(SF_HEADER)).toHaveLength(0);
  });

  it("parses EU-locale numbers (comma decimal, dot grouping)", () => {
    const csv = [
      SF_HEADER,
      'https://klant.be/,text/html,200,Indexable,,Titel,Beschrijving,Kop,"0,412","1.234.567",',
    ].join("\n");
    const [record] = parseCrawlCsv(csv);
    expect(record.responseTimeMs).toBe(412);
    expect(record.sizeBytes).toBe(1234567);
  });

  it("parses US-locale numbers (dot decimal, comma grouping)", () => {
    const csv = [
      SF_HEADER,
      'https://klant.be/,text/html,200,Indexable,,Titel,Beschrijving,Kop,0.412,"1,234,567",',
    ].join("\n");
    const [record] = parseCrawlCsv(csv);
    expect(record.responseTimeMs).toBe(412);
    expect(record.sizeBytes).toBe(1234567);
  });
});

describe("summarizeCrawl", () => {
  it("produces a Dutch report with an overview and signals", () => {
    const csv = [
      SF_HEADER,
      "https://klant.be/a,text/html,500,Indexable,,Titel A,Desc A,H1 A,0.3,40000,",
      "https://klant.be/b,text/html,200,Indexable,,,Desc B,H1 B,0.2,30000,",
    ].join("\n");
    const out = summarizeCrawl(csv);
    expect(out.records).toHaveLength(2);
    expect(out.stats.serverErrors).toBe(1);
    expect(out.text).toContain("Technische crawl");
    expect(out.text).toContain("Signalen");
    expect(out.text).toContain("[!]");
  });

  it("falls back to a clear note for an unusable export", () => {
    const out = summarizeCrawl("not a real csv");
    expect(out.records).toHaveLength(0);
    expect(out.text).toContain("Geen bruikbare crawl-data");
  });

  it("uses a supplied crawledAt when given", () => {
    const when = new Date("2026-06-01T08:00:00.000Z");
    const out = summarizeCrawl(
      `${SF_HEADER}\nhttps://klant.be/,text/html,200,Indexable,,T,D,H,0.2,1000,`,
      { crawledAt: when },
    );
    expect(out.fetchedAt.toISOString()).toBe(when.toISOString());
  });
});
