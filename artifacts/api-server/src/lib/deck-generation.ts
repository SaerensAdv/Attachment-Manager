/**
 * Self-service deck generation (T6/T7 made user-triggerable).
 *
 * The deck generator scripts (scripts/generate-{audit,qbr}-deck.ts) fetch typed
 * live data from the JSON routes and clone a template into the shared demo
 * OUTPUT slot. This module exposes the SAME pipeline as plain functions so the
 * api-server can run it in-process from a button click — no shell, no HTTP
 * self-call.
 *
 *   - `buildAuditDataForRow` / `buildQbrDataForRow` are the single source of the
 *     live-fetch + nl-BE-format logic; the JSON routes call them too.
 *   - `generateDeckForRow` flattens that data into the deck's `[[token]]`
 *     literals and overlays the template onto the shared demo slot, so the
 *     rendered deck stays fully STATIC (frozen at the reported numbers).
 *
 * A missing customer ID throws `GoogleAdsConfigError` (mapped to 400 by callers)
 * so the user gets the same actionable message as elsewhere.
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  buildAuditData,
  toTokenMap as auditToTokenMap,
  type AuditData,
} from "./audit-deck-data";
import { brusselsParts } from "./brussels";
import { cloneDeck } from "./deck-clone";
import { fetchGoogleAdsReport, GoogleAdsConfigError } from "./google-ads";
import {
  buildQbrData,
  lastFullQuarter,
  previousQuarter,
  sameQuarterLastYear,
  toTokenMap as qbrToTokenMap,
  type QbrData,
} from "./qbr-deck-data";

/** Only the client fields the deck pipeline needs (decoupled from the table). */
export interface DeckClientRow {
  name: string;
  googleAdsCustomerId: string | null;
}

export type DeckKind = "audit" | "qbr";

const MISSING_CUSTOMER_ID =
  "Deze klant heeft nog geen Google Ads customer ID. Vul het in en bewaar eerst.";

/**
 * Build the typed `AuditData` (current year-to-date vs the same range a year
 * earlier, anchored on Europe/Brussels) from live Google Ads metrics.
 */
export async function buildAuditDataForRow(
  row: DeckClientRow,
): Promise<AuditData> {
  const customerId = (row.googleAdsCustomerId ?? "").replace(/\D/g, "");
  if (!customerId) {
    throw new GoogleAdsConfigError(MISSING_CUSTOMER_ID);
  }

  const now = brusselsParts(new Date());
  const pad = (n: number) => String(n).padStart(2, "0");
  // A 29 Feb anchor has no prior-year counterpart in a common year — clamp it.
  const endDay = now.month === 2 && now.day === 29 ? 28 : now.day;
  const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
  const bStart = iso(now.year, 1, 1);
  const bEnd = iso(now.year, now.month, now.day);
  const aStart = iso(now.year - 1, 1, 1);
  const aEnd = iso(now.year - 1, now.month, endDay);

  const [reportA, reportB] = await Promise.all([
    fetchGoogleAdsReport(row.googleAdsCustomerId ?? "", {
      custom: { start: aStart, end: aEnd, label: `${aStart} – ${aEnd}` },
    }),
    fetchGoogleAdsReport(row.googleAdsCustomerId ?? "", {
      custom: { start: bStart, end: bEnd, label: `${bStart} – ${bEnd}` },
    }),
  ]);

  return buildAuditData({
    client: {
      naam: row.name,
      accountId: row.googleAdsCustomerId ?? customerId,
    },
    periodA: {
      start: new Date(Date.UTC(now.year - 1, 0, 1)),
      end: new Date(Date.UTC(now.year - 1, now.month - 1, endDay)),
    },
    periodB: {
      start: new Date(Date.UTC(now.year, 0, 1)),
      end: new Date(Date.UTC(now.year, now.month - 1, now.day)),
    },
    fetchedAt: new Date(Date.UTC(now.year, now.month - 1, now.day)),
    metricsA: reportA.metrics,
    metricsB: reportB.metrics,
  });
}

/**
 * Build the typed `QbrData` (last full quarter + its QoQ and YoY baselines,
 * anchored on Europe/Brussels) from live Google Ads metrics.
 */
export async function buildQbrDataForRow(row: DeckClientRow): Promise<QbrData> {
  const customerId = (row.googleAdsCustomerId ?? "").replace(/\D/g, "");
  if (!customerId) {
    throw new GoogleAdsConfigError(MISSING_CUSTOMER_ID);
  }

  const now = brusselsParts(new Date());
  const anchor = new Date(Date.UTC(now.year, now.month - 1, now.day));
  const quarter = lastFullQuarter(anchor);
  const prevQuarter = previousQuarter(quarter);
  const yoyQuarter = sameQuarterLastYear(quarter);
  const isoDay = (d: Date) => d.toISOString().slice(0, 10);
  const range = (q: { start: Date; end: Date; label: string }) => ({
    start: isoDay(q.start),
    end: isoDay(q.end),
    label: `${isoDay(q.start)} – ${isoDay(q.end)}`,
  });

  const cid = row.googleAdsCustomerId ?? "";
  const [reportQ, reportPrevQ, reportYoyQ] = await Promise.all([
    fetchGoogleAdsReport(cid, { custom: range(quarter) }),
    fetchGoogleAdsReport(cid, { custom: range(prevQuarter) }),
    fetchGoogleAdsReport(cid, { custom: range(yoyQuarter) }),
  ]);

  return buildQbrData({
    client: { naam: row.name, accountId: row.googleAdsCustomerId ?? customerId },
    quarter,
    prevQuarter,
    yoyQuarter,
    fetchedAt: anchor,
    metricsQ: reportQ.metrics,
    metricsPrevQ: reportPrevQ.metrics,
    metricsYoyQ: reportYoyQ.metrics,
  });
}

/**
 * Resolve the monorepo root by walking up to the `pnpm-workspace.yaml` marker.
 * Depth-independent, so it works both under tsx (src/lib) and the bundled dev
 * server (dist/), where a fixed number of `..` segments would over-resolve.
 */
function findWorkspaceRoot(): string {
  const starts = [
    path.dirname(fileURLToPath(import.meta.url)),
    process.cwd(),
  ];
  for (const start of starts) {
    let dir = start;
    for (;;) {
      if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  // Last resort: assume cwd is a package dir two levels under the root.
  return path.resolve(process.cwd(), "../..");
}

const WORKSPACE_ROOT = findWorkspaceRoot();

/** Shared generated-deck OUTPUT slot (overwritten per run; see 7-artifact cap). */
const DEMO_SLUG = "audit-car-audio-limburg-demo";
const DEMO_PREVIEW_PATH = `/${DEMO_SLUG}/`;

const TEMPLATE_DIR: Record<DeckKind, string> = {
  audit: path.join(WORKSPACE_ROOT, "artifacts", "saerens-audit-deck-template"),
  qbr: path.join(WORKSPACE_ROOT, "deck-templates", "saerens-qbr"),
};

export interface GenerateDeckResult {
  kind: DeckKind;
  slug: string;
  previewPath: string;
  client: string;
  period: string;
}

/** Mechanical metadata: fill index.html's narrative <title>/OG placeholders. */
function fillIndexHtml(targetDir: string, naam: string, periode: string): void {
  const indexHtmlPath = path.join(targetDir, "index.html");
  if (!existsSync(indexHtmlPath)) return;
  const html = readFileSync(indexHtmlPath, "utf8")
    .split("[Klantnaam]")
    .join(naam)
    .split("[periode]")
    .join(periode);
  writeFileSync(indexHtmlPath, html);
}

/**
 * Per-target serialization. The demo slot is a single shared OUTPUT directory;
 * two concurrent generations would interleave file writes and corrupt it. The
 * UI already disables the buttons while one runs, but this guards against
 * multiple tabs / racing callers as well.
 */
const generationLocks = new Map<string, Promise<unknown>>();

function withTargetLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = generationLocks.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  // Keep the chain alive but swallow errors so one failure doesn't poison the
  // next caller's turn; each caller still receives its own result/rejection.
  generationLocks.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

/**
 * Generate a filled, STATIC deck for one client into the shared demo slot.
 * Mirrors the generator scripts exactly; the demo slot is overwritten per run
 * and the durable deliverable is the PPTX/PDF export.
 */
export function generateDeckForRow(args: {
  kind: DeckKind;
  row: DeckClientRow;
}): Promise<GenerateDeckResult> {
  return withTargetLock(DEMO_SLUG, () => generateDeckForRowInner(args));
}

async function generateDeckForRowInner(args: {
  kind: DeckKind;
  row: DeckClientRow;
}): Promise<GenerateDeckResult> {
  const { kind, row } = args;
  const targetDir = path.join(WORKSPACE_ROOT, "artifacts", DEMO_SLUG);

  if (kind === "audit") {
    const data = await buildAuditDataForRow(row);
    cloneDeck({
      sourceDir: TEMPLATE_DIR.audit,
      targetDir,
      tokenMap: auditToTokenMap(data),
      provenance: {
        file: "audit-data.json",
        content: `${JSON.stringify(data, null, 2)}\n`,
      },
    });
    fillIndexHtml(targetDir, data.client.naam, data.period.rangeLong);
    return {
      kind,
      slug: DEMO_SLUG,
      previewPath: DEMO_PREVIEW_PATH,
      client: data.client.naam,
      period: data.period.rangeLong,
    };
  }

  const data = await buildQbrDataForRow(row);
  const periode = `${data.period.kwartaal} · ${data.period.rangeLong}`;
  cloneDeck({
    sourceDir: TEMPLATE_DIR.qbr,
    targetDir,
    tokenMap: qbrToTokenMap(data),
    provenance: {
      file: "qbr-data.json",
      content: `${JSON.stringify(data, null, 2)}\n`,
    },
  });
  fillIndexHtml(targetDir, data.client.naam, periode);
  return {
    kind,
    slug: DEMO_SLUG,
    previewPath: DEMO_PREVIEW_PATH,
    client: data.client.naam,
    period: periode,
  };
}
