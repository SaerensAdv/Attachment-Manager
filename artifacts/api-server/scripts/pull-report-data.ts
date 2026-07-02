/**
 * READ-ONLY throwaway: pull live Google Ads data for the manual monthly +
 * quarterly reporting exercise. Fetches six periods for one customer id and
 * writes both the human-readable text and the structured metrics to a JSON file
 * so the narrative + PDF can be built without re-hitting Google.
 *
 * Usage:
 *   pnpm exec tsx scripts/pull-report-data.ts --customer <id> [--out <path>]
 */
import { writeFileSync, readFileSync, existsSync } from "fs";
import { fetchGoogleAdsReport, type GoogleAdsCustomRange } from "../src/lib/google-ads";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

const PERIODS: { key: string; group: "maand" | "kwartaal"; range: GoogleAdsCustomRange }[] = [
  { key: "maand_juni2026", group: "maand", range: { start: "2026-06-01", end: "2026-06-30", label: "juni 2026", short: "jun 2026" } },
  { key: "maand_mei2026", group: "maand", range: { start: "2026-05-01", end: "2026-05-31", label: "mei 2026", short: "mei 2026" } },
  { key: "maand_juni2025", group: "maand", range: { start: "2025-06-01", end: "2025-06-30", label: "juni 2025", short: "jun 2025" } },
  { key: "kw_q2_2026", group: "kwartaal", range: { start: "2026-04-01", end: "2026-06-30", label: "Q2 2026 (apr–jun)", short: "Q2 2026" } },
  { key: "kw_q1_2026", group: "kwartaal", range: { start: "2026-01-01", end: "2026-03-31", label: "Q1 2026 (jan–mrt)", short: "Q1 2026" } },
  { key: "kw_q2_2025", group: "kwartaal", range: { start: "2025-04-01", end: "2025-06-30", label: "Q2 2025 (apr–jun)", short: "Q2 2025" } },
];

async function main() {
  const customer = arg("customer");
  if (!customer) throw new Error("--customer <id> ontbreekt.");
  const out = arg("out") ?? `/tmp/report-data-${customer.replace(/\D/g, "")}.json`;
  const groupFilter = arg("group"); // "maand" | "kwartaal" | null (all)

  // Merge into an existing file so monthly + quarterly runs can be split.
  const results: Record<string, unknown> =
    existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : { customer, periods: {} };
  results.customer = customer;
  results.pulledAt = new Date().toISOString();
  const periods = (results.periods = (results.periods as Record<string, unknown>) ?? {}) as Record<string, unknown>;

  const selected = groupFilter ? PERIODS.filter((p) => p.group === groupFilter) : PERIODS;
  for (const p of selected) {
    process.stdout.write(`\n=== ${p.group.toUpperCase()} · ${p.range.label} (${p.range.start} t.e.m. ${p.range.end}) ===\n`);
    try {
      const r = await fetchGoogleAdsReport(customer, { custom: p.range });
      periods[p.key] = { group: p.group, range: p.range, text: r.text, metrics: r.metrics };
      const t = r.metrics.totals;
      console.log(
        `kosten €${t.cost.toFixed(2)} | klikken ${t.clicks} | vertoningen ${t.impressions} | ` +
          `conversies ${t.conversions.toFixed(2)} | CPA ${t.cpa !== null ? "€" + t.cpa.toFixed(2) : "n.v.t."} | ` +
          `ROAS ${t.roas !== null ? t.roas.toFixed(2) : "n.v.t."} | valuta ${r.metrics.currency}`,
      );
    } catch (err) {
      periods[p.key] = { group: p.group, range: p.range, error: err instanceof Error ? err.message : String(err) };
      console.log(`FOUT: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(`\n[ok] Data weggeschreven naar ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
