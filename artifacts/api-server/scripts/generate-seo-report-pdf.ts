/**
 * One-off: generate the recurring SEO/website report PDF for a single client,
 * WITHOUT touching Gmail. Runs the real generation pipeline in-process (same
 * team + SEO data snapshot + client-facing sanitising the production feature
 * uses), captures the HELD approval payload (which is never sent — Gmail only
 * happens on explicit approval), renders the branded PDF from it, and writes it
 * to disk.
 *
 * It leaves NO residue: the throwaway generation run is deleted afterwards and
 * the client's report-recipient field (only set so the hold path runs) is
 * restored to its original value. Nothing is ever e-mailed.
 *
 * Usage:
 *   pnpm exec tsx scripts/generate-seo-report-pdf.ts --client <dbId> [--quarterly] [--out <path>]
 */
import { writeFileSync, mkdirSync, appendFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { eq } from "drizzle-orm";

import { db, clientsTable, generationStepsTable } from "@workspace/db";
import { resolveGenerationContext, runGeneration } from "../src/lib/generate-engine";
import { renderReportPdf } from "../src/lib/report-pdf";
import { parseSeoReportDeliveryPayload } from "../src/lib/seo-report-email";
import { getGeneration, deleteGeneration } from "../src/lib/generations-store";
import { getClientRow } from "../src/lib/clients-store";
import { ownerEmail } from "../src/lib/email-identity";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const clientId = Number(arg("client") ?? "18");
  const cadence: "monthly" | "quarterly" = has("quarterly") ? "quarterly" : "monthly";
  const workflowPath =
    cadence === "quarterly"
      ? "workflows/seo-quarterly-reporting.md"
      : "workflows/seo-monthly-reporting.md";
  const subtitlePrefix =
    cadence === "quarterly" ? "SEO-kwartaalrapport" : "SEO-maandrapport";

  const client = await getClientRow(clientId);
  if (!client) throw new Error(`Klant ${clientId} niet gevonden.`);
  console.log(`[seo-pdf] Klant: ${client.name} (id ${clientId}), cadans: ${cadence}`);

  // The hold path requires a report-recipient. Set a benign one (owner mailbox
  // if configured, else an internal placeholder) purely so the run reaches the
  // approval hold; it is NEVER sent, and we restore the field afterwards.
  const originalReportEmail = client.reportEmail ?? null;
  const tempRecipient = ownerEmail() ?? "intern@saerens.agency";
  await db.update(clientsTable).set({ reportEmail: tempRecipient }).where(eq(clientsTable.id, clientId));

  let generationId: number | null = null;
  try {
    const resolved = await resolveGenerationContext({
      agentPath: "agents/reporting-specialist.md",
      additionalAgentPaths: ["agents/seo-specialist.md"],
      clientPath: `clients/db/${clientId}.md`,
      workflowPath,
      request:
        `Stel het ${cadence === "quarterly" ? "kwartaal" : "maandelijkse"} SEO-/websiterapport op voor ${client.name} ` +
        `op basis van de meest recente Search Console-, technische crawl-, PageSpeed- en Bing-data. ` +
        `Schrijf een helder, klantgericht Nederlands rapport met resultaten, opvallende wijzigingen en concrete volgende stappen.`,
    });
    if (!resolved.ok) throw new Error(`Context ongeldig: ${resolved.error}`);

    const controller = new AbortController(); // never aborted
    const logFile = process.env.SEO_PDF_LOG ?? "/tmp/seo-pdf.log";
    const sink = (e: unknown) => {
      const ev = e as { type?: string; message?: string; index?: number };
      // Synchronous append so progress survives even if the process is killed.
      // Skip high-frequency token deltas to keep the log readable.
      if (ev?.type === "delta" || ev?.type === "token") return;
      try {
        appendFileSync(
          logFile,
          `[seo-pdf] ${new Date().toISOString()} event ${ev?.type ?? "?"}` +
            `${typeof ev?.index === "number" ? " #" + ev.index : ""}` +
            `${ev?.message ? ": " + ev.message : ""}\n`,
        );
      } catch {
        /* logging is best-effort */
      }
    };

    console.log("[seo-pdf] Team-run gestart (dit duurt enkele minuten)...");
    const result = await runGeneration(resolved.ctx, {
      sink,
      signal: controller.signal,
      triggerSource: "user",
    });
    generationId = result.generationId;
    console.log(`[seo-pdf] Run klaar: id=${result.generationId} status=${result.status}`);

    const gen = generationId ? await getGeneration(generationId) : null;
    const payload = gen?.pendingDelivery
      ? parseSeoReportDeliveryPayload(JSON.parse(gen.pendingDelivery))
      : null;

    if (!payload) {
      console.log(
        "[seo-pdf] GEEN held payload — run leverde geen klantgericht rapport op.",
      );
      if (gen?.finalMarkdown) {
        console.log("[seo-pdf] finalMarkdown (eerste 800 tekens):");
        console.log(gen.finalMarkdown.slice(0, 800));
      }
      throw new Error("Geen SEO-rapport payload om PDF van te renderen.");
    }

    console.log(
      `[seo-pdf] Payload OK — periode="${payload.periodLabel}", metrics=${payload.metrics ? "aanwezig" : "null"}`,
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
    console.log(`[seo-pdf] DONE ${outPath} (${pdf.length} bytes)`);
  } finally {
    // Clean up: remove the throwaway run (steps + row) and restore the field.
    if (generationId) {
      try {
        await db
          .delete(generationStepsTable)
          .where(eq(generationStepsTable.generationId, generationId));
        await deleteGeneration(generationId);
        console.log(`[seo-pdf] Test-run ${generationId} verwijderd.`);
      } catch (e) {
        console.log(`[seo-pdf] Kon test-run niet verwijderen: ${String(e)}`);
      }
    }
    await db
      .update(clientsTable)
      .set({ reportEmail: originalReportEmail })
      .where(eq(clientsTable.id, clientId));
    console.log("[seo-pdf] Rapport-ontvanger hersteld.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seo-pdf] FOUT:", err instanceof Error ? err.stack : err);
    process.exit(1);
  });
