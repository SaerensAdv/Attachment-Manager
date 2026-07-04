/**
 * Re-apply the client-facing sanitizer to an already-HELD SEO report whose
 * payload was captured by an older build (before the cover-title / blockquote-
 * meta / sign-off strips existed). Operates ONLY on the stored client report so
 * it never re-derives from final_markdown (which would ignore a Humanizer
 * rewrite). Idempotent: writes back only when the text actually changes.
 *
 * Usage:
 *   pnpm exec tsx scripts/sanitize-held-report.ts --gen <id> [--dry]
 */
import { and, eq } from "drizzle-orm";
import { db, generationsTable } from "@workspace/db";

import { getGeneration } from "../src/lib/generations-store";
import { toClientFacingReport } from "../src/lib/generation-text";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const genId = Number(arg("gen"));
  if (!Number.isFinite(genId) || genId <= 0)
    throw new Error("Verplichte parameter --gen <id> ontbreekt of is ongeldig.");
  const dry = has("dry");

  const gen = await getGeneration(genId);
  if (!gen) throw new Error(`Generatie ${genId} niet gevonden.`);
  if (gen.approvalStatus !== "pending")
    throw new Error(
      `Generatie ${genId} staat niet meer op 'pending' (status=${String(gen.approvalStatus)}); niets te saneren.`,
    );
  if (!gen.pendingDelivery)
    throw new Error(`Generatie ${genId} heeft geen held payload.`);

  const originalPd = gen.pendingDelivery;
  const payload = JSON.parse(gen.pendingDelivery) as Record<string, unknown>;
  if (payload.kind !== "seo-report")
    throw new Error(`Generatie ${genId} is geen seo-report payload (kind=${String(payload.kind)}).`);
  if (typeof payload.clientReport !== "string")
    throw new Error(`Generatie ${genId} heeft geen clientReport tekst.`);

  const before = payload.clientReport;
  const after = toClientFacingReport(before);
  if (after === before) {
    console.log(`[sanitize] gen ${genId}: geen wijziging nodig (${before.length} tekens).`);
    return;
  }
  console.log(
    `[sanitize] gen ${genId} (${String(payload.clientName)}): ${before.length} -> ${after.length} tekens (${before.length - after.length} verwijderd).`,
  );
  if (dry) {
    console.log("[sanitize] --dry: niet weggeschreven.");
    return;
  }
  payload.clientReport = after;
  // Compare-and-set: only write if the row is STILL pending and the payload is
  // byte-for-byte the one we sanitized. Axel may approve concurrently in the
  // app (which clears pending_delivery); a plain id-only update would resurrect
  // a payload on an already-approved row.
  const updated = await db
    .update(generationsTable)
    .set({ pendingDelivery: JSON.stringify(payload) })
    .where(
      and(
        eq(generationsTable.id, genId),
        eq(generationsTable.approvalStatus, "pending"),
        eq(generationsTable.pendingDelivery, originalPd),
      ),
    )
    .returning({ id: generationsTable.id });
  if (updated.length === 0) {
    console.warn(
      `[sanitize] gen ${genId}: status of payload is tussentijds gewijzigd (waarschijnlijk goedgekeurd); niets weggeschreven.`,
    );
    return;
  }
  console.log(`[sanitize] gen ${genId}: held payload bijgewerkt.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[sanitize] FOUT:", err instanceof Error ? err.stack : err);
    process.exit(1);
  });
