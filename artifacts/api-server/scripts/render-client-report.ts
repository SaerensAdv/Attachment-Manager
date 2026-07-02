/**
 * Render a branded Saerens Google Ads client report PDF (same output as the app)
 * from an authored markdown body + a pulled-data JSON file. Read-only: it does
 * not touch Google, the DB or Gmail.
 *
 * Usage:
 *   pnpm exec tsx scripts/render-client-report.ts \
 *     --data /tmp/report-data-<cid>.json --period <periodKey> \
 *     --md <markdown file> --client "<naam>" --subtitle "Maandrapport — juni 2026" \
 *     --cadence <monthly|quarterly> --out <pdf path>
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";

import { renderReportPdf } from "../src/lib/report-pdf";
import type { GoogleAdsMetrics } from "../src/lib/google-ads";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

async function main() {
  const dataPath = arg("data");
  const periodKey = arg("period");
  const mdPath = arg("md");
  const client = arg("client");
  const subtitle = arg("subtitle");
  const cadence = (arg("cadence") ?? "monthly") as "monthly" | "quarterly";
  const out = arg("out");

  for (const [k, v] of Object.entries({ data: dataPath, period: periodKey, md: mdPath, client, subtitle, out })) {
    if (!v) throw new Error(`--${k} ontbreekt.`);
  }

  const data = JSON.parse(readFileSync(dataPath!, "utf8"));
  const period = data.periods?.[periodKey!];
  if (!period || !period.metrics) {
    throw new Error(`Periode "${periodKey}" niet gevonden of zonder metrics in ${dataPath}.`);
  }
  const metrics = period.metrics as GoogleAdsMetrics;
  // Opt-in: if the pulled data carries a phone-call breakdown for this period,
  // reframe the cover + charts around calls (see AdsCallMetrics in report-pdf).
  const callMetrics = (period.callMetrics ?? null) as
    | { total: number; perCampaign?: { name: string; calls: number }[] }
    | null;
  const markdown = readFileSync(mdPath!, "utf8");

  const dateLabel = new Intl.DateTimeFormat("nl-BE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const pdf = await renderReportPdf(markdown, {
    clientName: client!,
    subtitle: subtitle!,
    dateLabel,
    reportType: "ads",
    metrics,
    callMetrics,
    adsCadence: cadence,
  });

  mkdirSync(path.dirname(out!), { recursive: true });
  writeFileSync(out!, pdf);
  console.log(`[ok] PDF geschreven naar ${out} (${(pdf.length / 1024).toFixed(0)} kB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
