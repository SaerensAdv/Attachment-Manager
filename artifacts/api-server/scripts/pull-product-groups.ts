/**
 * READ-ONLY throwaway: pull a product-level breakdown of the Shopping campaigns
 * for the manual reporting exercise. Aggregates shopping_performance_view by
 * product category, brand and product title for the two report periods, and
 * writes the structured data to a JSON file for the narrative + PDF.
 *
 * Usage:
 *   pnpm exec tsx scripts/pull-product-groups.ts --customer <id> [--out <path>]
 */
import { writeFileSync } from "fs";
import {
  fetchShoppingProductBreakdown,
  type GoogleAdsCustomRange,
} from "../src/lib/google-ads";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

const PERIODS: { key: string; range: GoogleAdsCustomRange }[] = [
  { key: "maand_juni2026", range: { start: "2026-06-01", end: "2026-06-30", label: "juni 2026", short: "jun 2026" } },
  { key: "kw_q2_2026", range: { start: "2026-04-01", end: "2026-06-30", label: "Q2 2026 (apr–jun)", short: "Q2 2026" } },
];

function line(label: string, m: { cost: number; conversions: number; conversionsValue: number; roas: number | null }, cur: string): string {
  return `  ${label.slice(0, 40).padEnd(42)} kost €${m.cost.toFixed(2).padStart(9)} · conv ${m.conversions.toFixed(1).padStart(6)} · waarde €${m.conversionsValue.toFixed(0).padStart(7)} · ROAS ${m.roas !== null ? m.roas.toFixed(2) : "n.v.t."} ${cur === "EUR" ? "" : cur}`;
}

async function main() {
  const customer = arg("customer");
  if (!customer) throw new Error("--customer <id> ontbreekt.");
  const out = arg("out") ?? `/tmp/product-groups-${customer.replace(/\D/g, "")}.json`;

  const results: Record<string, unknown> = { customer, pulledAt: new Date().toISOString(), periods: {} };
  const periods = results.periods as Record<string, unknown>;

  for (const p of PERIODS) {
    process.stdout.write(`\n=== ${p.range.label} (${p.range.start} t.e.m. ${p.range.end}) ===\n`);
    const b = await fetchShoppingProductBreakdown(customer, p.range);
    periods[p.key] = { range: p.range, breakdown: b };
    console.log(`-- Per productcategorie (top ${b.byProductType.length}) --`);
    for (const m of b.byProductType) console.log(line(m.key, m, b.currency));
    console.log(`-- Per merk (top ${b.byBrand.length}) --`);
    for (const m of b.byBrand) console.log(line(m.key, m, b.currency));
    console.log(`-- Top producten (top ${b.topProducts.length}) --`);
    for (const m of b.topProducts) console.log(line(m.key, m, b.currency));
    if (b.warnings.length) {
      console.log("-- Waarschuwingen --");
      for (const w of b.warnings) console.log(`  ! ${w}`);
    }
  }

  writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(`\n[ok] Data weggeschreven naar ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
