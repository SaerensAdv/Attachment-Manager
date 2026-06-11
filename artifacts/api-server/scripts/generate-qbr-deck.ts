/**
 * Generate a filled Google Ads QBR (kwartaalrapportage) deck for one client (T6).
 *
 * Pipeline (mirrors generate-audit-deck.ts):
 *   1. Fetch typed `QbrData` from the RUNNING api-server route
 *      `GET /api/clients/:id/qbr-data.json` (the server holds the Google Ads
 *      secrets; a fresh tsx process does not, so we must hit the live route).
 *   2. Flatten it with `toTokenMap` into the deck's 53 `[[token]]` literals.
 *   3. Overlay the plain-source QBR template (deck-templates/saerens-qbr) onto
 *      the shared demo OUTPUT artifact, filling every token and writing
 *      `src/data/qbr-data.json` as provenance.
 *
 * The 7-artifact cap means there is no dedicated QBR artifact: the template is a
 * plain repo-root source tree (uncounted) and the generated deck reuses the
 * audit demo slot, overwritten per run. Targets/doelstellingen are never
 * machine-filled — they stay human `[...]` placeholders in the template.
 *
 * Usage:
 *   pnpm exec tsx scripts/generate-qbr-deck.ts --client <dbId> \
 *     [--slug <targetSlug>] [--base http://localhost:8080] [--source <templateDir>]
 */
import { fileURLToPath } from "url";
import path from "path";

import type { QbrData } from "../src/lib/qbr-deck-data";
import { toTokenMap } from "../src/lib/qbr-deck-data";
import { cloneDeck } from "./lib/deck-clone";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");
const DEFAULT_TEMPLATE = path.join(WORKSPACE_ROOT, "deck-templates", "saerens-qbr");
/** Shared generated-deck OUTPUT slot (overwritten per run; see 7-artifact cap). */
const DEFAULT_SLUG = "audit-car-audio-limburg-demo";

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
  const slug = args.slug ?? DEFAULT_SLUG;
  const base = (args.base ?? "http://localhost:8080").replace(/\/$/, "");
  const sourceDir = args.source
    ? path.resolve(WORKSPACE_ROOT, args.source)
    : DEFAULT_TEMPLATE;

  if (!client) {
    throw new Error(
      "Usage: tsx scripts/generate-qbr-deck.ts --client <dbId> [--slug <targetSlug>] [--base <url>] [--source <dir>]",
    );
  }

  const targetDir = path.join(WORKSPACE_ROOT, "artifacts", slug);
  const url = `${base}/api/clients/${encodeURIComponent(client)}/qbr-data.json`;

  console.log(`[qbr-deck] fetching ${url}`);
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`Route ${url} returned ${res.status}: ${bodyText.slice(0, 400)}`);
  }

  let data: QbrData;
  try {
    data = JSON.parse(bodyText) as QbrData;
  } catch {
    throw new Error(`Route ${url} did not return JSON: ${bodyText.slice(0, 200)}`);
  }
  if (!data?.client?.naam || !data?.kpis?.conversies) {
    throw new Error(`Route ${url} returned an unexpected shape (missing client.naam / kpis).`);
  }

  const tokenMap = toTokenMap(data);
  console.log(
    `[qbr-deck] client="${data.client.naam}" period=${data.period.kwartaal} tokens=${Object.keys(tokenMap).length}`,
  );

  const result = cloneDeck({
    sourceDir,
    targetDir,
    tokenMap,
    provenance: {
      file: "qbr-data.json",
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
      .join(`${data.period.kwartaal} · ${data.period.rangeLong}`);
    fs.writeFileSync(indexHtmlPath, html);
  }

  console.log(
    `[qbr-deck] done: ${result.filesCopied} copied, ${result.filesSubstituted} substituted, ${result.keysConsumed.length} tokens consumed, ${result.slidesWiped} scaffold slides wiped.`,
  );
  console.log(`[qbr-deck] target: artifacts/${slug}`);
  console.log(
    `[qbr-deck] next: pnpm install (wire @workspace/brand), restart the deck workflow, run validate-slides.`,
  );
}

main().catch((err) => {
  console.error(`[qbr-deck] FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
