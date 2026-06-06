import {
  db,
  monitoredTermsTable,
  type MonitoredTerm,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";

/** One monitor-list entry as captured from the team's optimization output. */
export interface MonitoredTermInput {
  term: string;
  campaign?: string | null;
  reason?: string | null;
  suggestedAction?: string | null;
  status?: string | null;
  note?: string | null;
}

const norm = (v: string | null | undefined): string =>
  (v ?? "").trim().toLowerCase();

const matchKey = (term: string, campaign: string | null | undefined): string =>
  `${norm(term)}\u0000${norm(campaign)}`;

const VALID_STATUS = new Set(["monitoring", "resolved", "excluded"]);

/** Coerce a free-text status to the allowed set, defaulting to "monitoring". */
const normStatus = (s: string | null | undefined): string => {
  const v = (s ?? "").trim().toLowerCase();
  return VALID_STATUS.has(v) ? v : "monitoring";
};

/**
 * The terms currently being monitored for a client (status "monitoring"),
 * oldest-by-age first so the run surfaces the most stale ones at the top.
 */
export async function listMonitoredTerms(
  clientId: number,
): Promise<MonitoredTerm[]> {
  return db
    .select()
    .from(monitoredTermsTable)
    .where(
      and(
        eq(monitoredTermsTable.clientId, clientId),
        eq(monitoredTermsTable.status, "monitoring"),
      ),
    )
    .orderBy(desc(monitoredTermsTable.weeksMonitored));
}

/**
 * Upsert this run's monitor list for a client, keyed by term + campaign.
 *
 * An existing match has its age incremented (weeksMonitored + 1), its
 * lastSeenAt stamped, and its reason/action/status/note refreshed from the new
 * read. A new term is inserted at weeksMonitored = 1. Rows are never deleted
 * here: a term leaves the list only by the team marking it "resolved" or
 * "excluded" (carried on the input), so an accidental omission in one run never
 * loses tracking history. Best-effort by design — the caller treats a failure
 * as non-fatal so the generation run is never sunk by monitor bookkeeping.
 */
export async function recordMonitoredTerms(
  clientId: number,
  items: MonitoredTermInput[],
): Promise<{ inserted: number; updated: number }> {
  // Collapse duplicate (term, campaign) entries within a single run before
  // touching the DB — the team can list the same term twice, and without this
  // each copy would be processed independently and could insert a duplicate row
  // (the same term is only counted once per week regardless).
  const deduped = new Map<string, MonitoredTermInput>();
  for (const raw of items) {
    const term = (raw.term ?? "").trim();
    if (!term) continue;
    const key = matchKey(term, raw.campaign);
    const prior = deduped.get(key);
    // Later entries win on provided fields, but never clobber a value with null.
    deduped.set(key, {
      term,
      campaign: raw.campaign ?? prior?.campaign ?? null,
      reason: raw.reason ?? prior?.reason ?? null,
      suggestedAction: raw.suggestedAction ?? prior?.suggestedAction ?? null,
      status: raw.status ?? prior?.status ?? null,
      note: raw.note ?? prior?.note ?? null,
    });
  }
  if (deduped.size === 0) return { inserted: 0, updated: 0 };

  const existing = await db
    .select()
    .from(monitoredTermsTable)
    .where(eq(monitoredTermsTable.clientId, clientId));
  const byKey = new Map<string, MonitoredTerm>();
  for (const row of existing) byKey.set(matchKey(row.term, row.campaign), row);

  const now = new Date();
  let inserted = 0;
  let updated = 0;

  for (const [key, it] of deduped) {
    const prior = byKey.get(key);
    if (prior) {
      const [row] = await db
        .update(monitoredTermsTable)
        .set({
          weeksMonitored: prior.weeksMonitored + 1,
          lastSeenAt: now,
          reason: it.reason ?? prior.reason,
          suggestedAction: it.suggestedAction ?? prior.suggestedAction,
          status: normStatus(it.status ?? prior.status),
          note: it.note ?? prior.note,
        })
        .where(eq(monitoredTermsTable.id, prior.id))
        .returning();
      if (row) byKey.set(key, row);
      updated += 1;
    } else {
      const [row] = await db
        .insert(monitoredTermsTable)
        .values({
          clientId,
          term: it.term,
          campaign: it.campaign ?? null,
          reason: it.reason ?? null,
          suggestedAction: it.suggestedAction ?? null,
          status: normStatus(it.status),
          note: it.note ?? null,
          weeksMonitored: 1,
          firstSeenAt: now,
          lastSeenAt: now,
        })
        .returning();
      // Keep the key map current so a same-key item later in this batch (after
      // dedupe this is rare, but defensive) updates rather than re-inserts.
      if (row) byKey.set(key, row);
      inserted += 1;
    }
  }

  return { inserted, updated };
}
