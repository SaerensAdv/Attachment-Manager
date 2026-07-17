import { randomUUID } from "node:crypto";
import { logger } from "../logger";
import {
  claimPush,
  markFailed,
  markSucceeded,
  recordObjectId,
  searchTermsKey,
} from "./idempotency";
import {
  addAttachment,
  createTask,
  getListDetail,
  getListFields,
  resolveDropdownOptionId,
  resolveField,
  resolveStatus,
} from "./tasks";
import type { PushOutcome } from "./types";

/**
 * Search-terms push flow (brief §6.5). Turns ONE weekly search-terms analysis for
 * a Google Ads account into a reviewable task in the CENTRAL Internal Work list
 * (Axel's decision — search-terms analyses are internal ops work, not client
 * deliverables), with the analysis table in the body and an import-ready CSV
 * attached. Idempotent per account+week, retry-safe, dry-run-capable.
 *
 * The same guardrails as the report flow apply, adapted to a fixed target list:
 *  - LOCATION FIRST: read the fixed list's live statuses/fields before any state
 *    change; a list that cannot be read becomes a failed outcome, never a write.
 *  - DRY-RUN WRITES NOTHING: not even a push-record row — returns a safe preview.
 *  - EXACTLY ONE OBJECT: `claimPush` (CAS) + `recordObjectId` mean a retry or a
 *    crash-resume re-enriches the same task; the non-idempotent CSV attachment is
 *    only added on the fresh-create path.
 *  - RUNTIME STATUS/FIELD RESOLUTION: the review status + any custom fields are
 *    resolved from the live list, never hardcoded.
 *  - PROPOSE-ONLY: this flow never applies negatives live (brief §6.5).
 *  - LOGS CARRY IDS ONLY: never the term list, never the token.
 */

/**
 * The central Internal Work list that holds internal ops tasks. Confirmed with
 * Axel as the target for weekly search-terms analyses. Overridable via env for
 * safety/portability, but defaults to the known list so the feature works out of
 * the box.
 */
export const DEFAULT_INTERNAL_WORK_LIST_ID = "901524400063";

/** The Internal Work list id, honouring an env override. */
export function internalWorkListId(): string {
  const raw = process.env.CLICKUP_INTERNAL_WORK_LIST_ID?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_INTERNAL_WORK_LIST_ID;
}

/** A single analysed search term (one row of the analysis table + CSV). */
export interface SearchTermRow {
  term: string;
  impressions: number;
  clicks: number;
  cost: number;
  /** Minimally: "irrelevant" | "mis-routed" | "monitor" (free-form allowed). */
  classification: string;
  /** The proposed action, e.g. "Toevoegen als negative (exact)" or "Monitoren". */
  proposedAction: string;
}

export interface PushSearchTermsInput {
  /** The Replit run this analysis came from (traceability + idempotency). */
  sourceRunId: string;
  /** Google Ads customer id — half of the idempotency key. */
  customerId: string;
  /** Display name for the account (task title). */
  accountName: string;
  /**
   * The Monday (or first day) of the analysed 7-day window as `YYYY-MM-DD` — the
   * other half of the idempotency key and the human-readable period anchor.
   */
  weekStart: string;
  /** The analysed rows (term/impressions/clicks/cost/classification/action). */
  rows: SearchTermRow[];
  /** Link to the full analysis in the app, if any. */
  reportUrl?: string | null;
  /** Responsible agent/head, for the metadata block. */
  agent?: string | null;
  /** When the analysis was generated (defaults to now). */
  generatedAt?: Date;
  /** Ties every request of this push together in the logs. */
  correlationId?: string;
  /** When true, resolve + preview only; write nothing. */
  dryRun?: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** First/last instant (UTC midnight) of the analysed 7-day window, epoch ms. */
function windowBounds(
  weekStart: string,
): { start: number; end: number } | null {
  if (!DATE_RE.test(weekStart)) return null;
  const start = Date.parse(`${weekStart}T00:00:00.000Z`);
  if (Number.isNaN(start)) return null;
  // Seven full days: the window's last day is the 7th day (start + 6 days).
  const end = start + 6 * 24 * 60 * 60 * 1000;
  return { start, end };
}

/** The task title (mirrors the report style): `[YYYY-MM-DD] {account} - Search Terms`. */
function searchTermsTaskName(weekStart: string, accountName: string): string {
  return `[${weekStart}] ${accountName} - Search Terms`;
}

/** RFC 4180 field escaping: quote when the value holds `,` `"` or a newline. */
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Deterministic ordering so the CSV (and the body table) are STABLE across runs:
 * highest spend first, then most clicks, then term A→Z as the final tiebreaker.
 */
function sortRows(rows: SearchTermRow[]): SearchTermRow[] {
  return [...rows].sort(
    (a, b) =>
      b.cost - a.cost ||
      b.clicks - a.clicks ||
      a.term.localeCompare(b.term, "nl"),
  );
}

/** Build the import-ready, stably-sorted CSV of the analysis (as bytes). */
export function buildSearchTermsCsv(rows: SearchTermRow[]): string {
  const header = [
    "Search term",
    "Impressions",
    "Clicks",
    "Cost",
    "Classification",
    "Proposed action",
  ];
  const lines = [header.map(csvField).join(",")];
  for (const r of sortRows(rows)) {
    lines.push(
      [
        csvField(r.term),
        csvField(String(Math.round(r.impressions))),
        csvField(String(Math.round(r.clicks))),
        csvField(r.cost.toFixed(2)),
        csvField(r.classification),
        csvField(r.proposedAction),
      ].join(","),
    );
  }
  // RFC 4180 line endings so the file imports cleanly into spreadsheets/Editor.
  return lines.join("\r\n") + "\r\n";
}

/** CSV filename for the attached analysis. */
function csvFilename(accountName: string, weekStart: string): string {
  const slug = accountName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `zoektermen-${slug || "account"}-${weekStart}.csv`;
}

function searchTermsBody(input: PushSearchTermsInput): string {
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();
  const rows = sortRows(input.rows);
  const proposed = rows.filter((r) =>
    /^(irrelevant|mis-?routed)$/i.test(r.classification.trim()),
  );
  const lines = [
    `## Zoektermenanalyse — ${input.accountName}`,
    "",
    `- **Account:** ${input.customerId}`,
    `- **Periode:** week vanaf ${input.weekStart} (laatste 7 volledige dagen)`,
    `- **Gegenereerd op:** ${generatedAt}`,
    `- **Source run:** ${input.sourceRunId}`,
    `- **Agent:** ${input.agent?.trim() || "Saerens AI-team"}`,
    `- **Voorgestelde negatives:** ${proposed.length}`,
    "",
    "> Dit is een **voorstel**. Er worden geen negatives live toegepast.",
    "",
  ];
  if (input.reportUrl) {
    lines.push(`- **Volledige analyse:** ${input.reportUrl}`, "");
  }
  lines.push(
    "| Term | Impr. | Clicks | Kost | Classificatie | Voorgestelde actie |",
    "| --- | ---: | ---: | ---: | --- | --- |",
  );
  for (const r of rows) {
    const term = r.term.replace(/\|/g, "\\|");
    const action = r.proposedAction.replace(/\|/g, "\\|");
    const cls = r.classification.replace(/\|/g, "\\|");
    lines.push(
      `| ${term} | ${Math.round(r.impressions)} | ${Math.round(r.clicks)} | € ${r.cost.toFixed(2)} | ${cls} | ${action} |`,
    );
  }
  lines.push("", "_De volledige, import-klare CSV is als bijlage toegevoegd._");
  return lines.join("\n");
}

export async function pushSearchTerms(
  input: PushSearchTermsInput,
): Promise<PushOutcome> {
  const correlationId = input.correlationId ?? randomUUID();
  const key = searchTermsKey(input.customerId, input.weekStart);
  const log = (msg: string, extra: Record<string, unknown> = {}) =>
    logger.info(
      { scope: "clickup:push", kind: "search_terms", correlationId, key, ...extra },
      msg,
    );

  const bounds = windowBounds(input.weekStart);
  if (!bounds) {
    return {
      status: "failed",
      code: "BAD_PERIOD",
      message: `Ongeldige weekstart "${input.weekStart}" (verwacht YYYY-MM-DD).`,
      idempotencyKey: key,
    };
  }

  // 1) Read the fixed target list's LIVE metadata (statuses + custom fields)
  //    before any state change. A list we cannot read is a failed outcome.
  const listId = internalWorkListId();
  const detail = await getListDetail(listId, correlationId);
  if (!detail.ok) {
    return {
      status: "failed",
      code: detail.error.code,
      message: detail.error.message,
      idempotencyKey: key,
    };
  }
  const fieldsRes = await getListFields(listId, correlationId);
  const fields = fieldsRes.ok ? fieldsRes.data : [];
  const statuses = detail.data.statuses ?? [];
  const listName = detail.data.name;

  const status =
    resolveStatus(statuses, [
      "ready for review",
      "review",
      "to review",
      "open",
      "to do",
    ]) ?? undefined;

  // Optional custom fields — set only when the list actually offers them.
  const recordTypeField = resolveField(fields, "Record type");
  const periodStartField = resolveField(fields, "Period start");
  const periodEndField = resolveField(fields, "Period end");
  const reportUrlField = resolveField(fields, "Report URL");

  const inlineFields: { id: string; value: unknown }[] = [];
  const recordOpt =
    resolveDropdownOptionId(recordTypeField, "Search terms") ??
    resolveDropdownOptionId(recordTypeField, "Analysis");
  if (recordTypeField && recordOpt)
    inlineFields.push({ id: recordTypeField.id, value: recordOpt });
  if (periodStartField)
    inlineFields.push({ id: periodStartField.id, value: bounds.start });
  if (periodEndField)
    inlineFields.push({ id: periodEndField.id, value: bounds.end });
  if (input.reportUrl && reportUrlField)
    inlineFields.push({ id: reportUrlField.id, value: input.reportUrl });

  const name = searchTermsTaskName(input.weekStart, input.accountName);

  // 2) Dry-run: return a safe preview WITHOUT writing anything (not even a row).
  if (input.dryRun) {
    log("search-terms push dry-run", { listId, rows: input.rows.length });
    return {
      status: "skipped",
      reason: "dry-run: niets naar ClickUp geschreven",
      idempotencyKey: key,
      dryRun: true,
      preview: {
        listId,
        listName,
        name,
        status: status ?? null,
        customerId: input.customerId,
        weekStart: input.weekStart,
        rows: input.rows.length,
        reportUrl: input.reportUrl ?? null,
        fieldsSet: inlineFields.map((f) => {
          if (f.id === recordTypeField?.id) return "Record type";
          if (f.id === periodStartField?.id) return "Period start";
          if (f.id === periodEndField?.id) return "Period end";
          if (f.id === reportUrlField?.id) return "Report URL";
          return f.id;
        }),
      },
    };
  }

  // 3) Claim the push slot (exactly-once).
  const claim = await claimPush({
    kind: "search_terms",
    idempotencyKey: key,
    sourceRunId: input.sourceRunId,
  });
  if (claim.state === "already-succeeded") {
    log("search-terms push duplicate (already succeeded)", {
      objectId: claim.record.clickupObjectId,
    });
    return {
      status: "duplicate",
      idempotencyKey: key,
      objectId: claim.record.clickupObjectId,
      url: claim.record.clickupUrl,
    };
  }
  if (claim.state === "in-progress") {
    return {
      status: "skipped",
      reason: "push is al bezig in een andere run",
      idempotencyKey: key,
    };
  }

  // 4) Create (or resume) the task. A row that already carries an object id is a
  // crash-resume: re-enrich the SAME task, never create a second one.
  let objectId = claim.record.clickupObjectId ?? null;
  let url = claim.record.clickupUrl ?? null;
  const freshCreate = !objectId;

  if (!objectId) {
    const created = await createTask(
      listId,
      { name, markdown: searchTermsBody(input), status, customFields: inlineFields },
      correlationId,
    );
    if (!created.ok) {
      await markFailed(key, created.error.code);
      log("search-terms push failed (create)", { code: created.error.code });
      return {
        status: "failed",
        code: created.error.code,
        message: created.error.message,
        idempotencyKey: key,
      };
    }
    objectId = created.data.id;
    url = created.data.url ?? null;
    await recordObjectId(key, objectId, url);
  }

  // 5) Attach the CSV only on the fresh-create path — an attachment is NOT
  // idempotent, so a resume must not add a duplicate copy.
  if (freshCreate) {
    try {
      const csv = buildSearchTermsCsv(input.rows);
      const att = await addAttachment(
        objectId,
        {
          filename: csvFilename(input.accountName, input.weekStart),
          content: new TextEncoder().encode(csv),
          contentType: "text/csv;charset=utf-8",
        },
        correlationId,
      );
      if (!att.ok) {
        logger.warn(
          { scope: "clickup:push", kind: "search_terms", correlationId, key, code: att.error.code },
          "search-terms push: CSV-bijlage niet toegevoegd (task blijft geldig)",
        );
      }
    } catch (err) {
      logger.warn(
        {
          scope: "clickup:push",
          kind: "search_terms",
          correlationId,
          key,
          err: err instanceof Error ? err.message.slice(0, 200) : "unknown",
        },
        "search-terms push: CSV-bouw mislukt (task blijft geldig)",
      );
    }
  }

  await markSucceeded(key, { objectId, url });
  log("search-terms pushed", { objectId, freshCreate });
  return { status: "pushed", idempotencyKey: key, objectId, url };
}
