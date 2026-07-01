/**
 * Render the branded SEO/website report PDF from an already-completed, HELD
 * generation (its approval payload is captured in generations.pending_delivery).
 * This does NOT run the team and does NOT touch Gmail — it only reads the stored
 * payload and renders the PDF to disk.
 *
 * Usage:
 *   pnpm exec tsx scripts/render-seo-pdf.ts --gen <generationId> [--out <path>] [--quarterly]
 */
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { renderReportPdf } from "../src/lib/report-pdf";
import { parseSeoReportDeliveryPayload } from "../src/lib/seo-report-email";
import { getGeneration } from "../src/lib/generations-store";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const genArg = arg("gen");
  const genId = Number(genArg);
  if (!genArg || !Number.isFinite(genId) || genId <= 0) {
    throw new Error(
      "Verplichte parameter --gen <generationId> ontbreekt of is ongeldig. " +
        "Gebruik: pnpm exec tsx scripts/render-seo-pdf.ts --gen <id> [--out <path>] [--quarterly]",
    );
  }
  const cadence: "monthly" | "quarterly" = has("quarterly") ? "quarterly" : "monthly";
  const subtitlePrefix =
    cadence === "quarterly" ? "SEO-kwartaalrapport" : "SEO-maandrapport";

  console.log(`[render] Generatie ${genId} ophalen...`);
  const gen = await getGeneration(genId);
  if (!gen) throw new Error(`Generatie ${genId} niet gevonden.`);
  if (!gen.pendingDelivery)
    throw new Error(`Generatie ${genId} heeft geen held payload (pending_delivery leeg).`);

  const payload = parseSeoReportDeliveryPayload(JSON.parse(gen.pendingDelivery));
  if (!payload) throw new Error("Payload kon niet geparsed worden.");

  console.log(
    `[render] Payload OK — klant="${payload.clientName}", periode="${payload.periodLabel}", metrics=${payload.metrics ? "aanwezig" : "null"}`,
  );

  const pdf = await renderReportPdf(payload.clientReport, {
    clientName: payload.clientName,
    subtitle: `${subtitlePrefix} — ${payload.periodLabel}`,
    dateLabel: payload.dateLabel,
    reportType: "seo",
    seo: payload.metrics,
  });

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(__dirname, "../../..");
  const slug = payload.clientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const outArg = arg("out");
  const outPath = outArg
    ? path.resolve(workspaceRoot, outArg)
    : path.join(
        workspaceRoot,
        ".local",
        "exports",
        `seo-${cadence === "quarterly" ? "kwartaal" : "maand"}rapport-${slug}.pdf`,
      );
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, pdf);
  console.log(`[render] DONE ${outPath} (${pdf.length} bytes)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[render] FOUT:", err instanceof Error ? err.stack : err);
    process.exit(1);
  });
