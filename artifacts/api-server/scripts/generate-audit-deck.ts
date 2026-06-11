/**
 * Generate a filled Google Ads audit deck for one client (T7).
 *
 * Pipeline:
 *   1. Fetch typed `AuditData` from the RUNNING api-server route
 *      `GET /api/clients/:id/audit-data.json` (the server holds the Google Ads
 *      secrets; a fresh tsx process does not, so we must hit the live route).
 *   2. Flatten it with `toTokenMap` into the deck's 36 `[[token]]` literals.
 *   3. Overlay the Saerens deck template onto an ALREADY-REGISTERED target
 *      artifact (scaffold the target first with the artifacts skill), filling
 *      every token and writing `src/data/audit-data.json` as provenance.
 *
 * Usage:
 *   pnpm exec tsx scripts/generate-audit-deck.ts --client <dbId> --slug <targetSlug> \
 *     [--base http://localhost:8080] [--source <templateDir>]
 *
 * `--slug` is the target artifact directory under artifacts/ (e.g. the slug you
 * passed to createArtifact, like "audit-acme-2026"). The template and the two
 * LIVE client decks are denylisted as targets by the engine.
 */
import { fileURLToPath } from "url";
import path from "path";

import type { AuditData } from "../src/lib/audit-deck-data";
import { toTokenMap } from "../src/lib/audit-deck-data";
import { cloneDeck } from "./lib/deck-clone";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");
const DEFAULT_TEMPLATE = path.join(WORKSPACE_ROOT, "artifacts", "saerens-audit-deck-template");

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i += 1;
      } else {
        out[key] = "true";
      }
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const client = args.client;
  const slug = args.slug;
  const base = (args.base ?? "http://localhost:8080").replace(/\/$/, "");
  const sourceDir = args.source
    ? path.resolve(WORKSPACE_ROOT, args.source)
    : DEFAULT_TEMPLATE;

  if (!client || !slug) {
    throw new Error(
      "Usage: tsx scripts/generate-audit-deck.ts --client <dbId> --slug <targetSlug> [--base <url>] [--source <dir>]",
    );
  }

  const targetDir = path.join(WORKSPACE_ROOT, "artifacts", slug);
  const url = `${base}/api/clients/${encodeURIComponent(client)}/audit-data.json`;

  console.log(`[audit-deck] fetching ${url}`);
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`Route ${url} returned ${res.status}: ${bodyText.slice(0, 400)}`);
  }

  let data: AuditData;
  try {
    data = JSON.parse(bodyText) as AuditData;
  } catch {
    throw new Error(`Route ${url} did not return JSON: ${bodyText.slice(0, 200)}`);
  }
  if (!data?.client?.naam || !data?.kpis?.conversies) {
    throw new Error(`Route ${url} returned an unexpected shape (missing client.naam / kpis).`);
  }

  const tokenMap = toTokenMap(data);
  console.log(
    `[audit-deck] client="${data.client.naam}" period=${data.period.vergelijking} tokens=${Object.keys(tokenMap).length}`,
  );

  const result = cloneDeck({
    sourceDir,
    targetDir,
    tokenMap,
    provenance: {
      file: "audit-data.json",
      content: `${JSON.stringify(data, null, 2)}\n`,
    },
  });

  // Mechanical metadata: fill index.html's narrative <title>/OG placeholders.
  const indexHtmlPath = path.join(targetDir, "index.html");
  const fs = await import("fs");
  if (fs.existsSync(indexHtmlPath)) {
    let html = fs.readFileSync(indexHtmlPath, "utf8");
    html = html
      .split("[Klantnaam]")
      .join(data.client.naam)
      .split("[periode]")
      .join(data.period.rangeLong);
    fs.writeFileSync(indexHtmlPath, html);
  }

  console.log(
    `[audit-deck] done: ${result.filesCopied} copied, ${result.filesSubstituted} substituted, ${result.keysConsumed.length} tokens consumed, ${result.slidesWiped} scaffold slides wiped.`,
  );
  console.log(`[audit-deck] target: artifacts/${slug}`);
  console.log(
    `[audit-deck] next: pnpm install (wire @workspace/brand), restart the deck workflow, run validate-slides.`,
  );
}

main().catch((err) => {
  console.error(`[audit-deck] FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
