import { fetchSearchConsoleReport } from "../src/lib/search-console";

async function main() {
  const site = process.argv[2] ?? "sc-domain:sanidetect.be";
  try {
    const r = await fetchSearchConsoleReport(site);
    console.log(`OK ${site}`);
    console.log(
      `totals: clicks=${r.report.totals.clicks} impressions=${r.report.totals.impressions} pos=${r.report.totals.position.toFixed(1)}`,
    );
    console.log(`topQueries: ${r.report.topQueries.length}`);
  } catch (err) {
    console.log(`FAIL ${site}: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

void main();
