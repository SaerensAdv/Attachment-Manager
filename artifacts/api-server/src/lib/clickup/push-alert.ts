import { randomUUID } from "node:crypto";
import { logger } from "../logger";
import { listAlerts } from "../alerts-store";
import {
  alertKey,
  claimPush,
  markFailed,
  markSucceeded,
  recordObjectId,
} from "./idempotency";
import {
  addComment,
  createTask,
  getListDetail,
  getListFields,
  resolveDropdownOptionId,
  resolveField,
  resolveStatus,
  setCustomField,
} from "./tasks";
import { internalWorkListId } from "./push-search-terms";
import type { PushOutcome } from "./types";

/**
 * Alert push flow (brief §6.6). Turns ONE operational alert into a reviewable
 * ClickUp object — idempotent per alert-fingerprint+time-window, so the same
 * alert firing repeatedly within the window produces exactly one object.
 *
 * Routing (Axel's decision): alerts land as a TASK in the CENTRAL Internal Work
 * list. An optional `targetTaskId` switches to the spec's alternative — a COMMENT
 * on an existing task (e.g. a client Engagement) — for callers that explicitly
 * want it. We never DM (brief §6.6): only validated task/list locations are used.
 *
 * Same guardrails as the other flows:
 *  - DRY-RUN WRITES NOTHING (not even a push-record row) — returns a safe preview.
 *  - EXACTLY ONE OBJECT via `claimPush` (CAS) + `recordObjectId` (crash-resume
 *    re-uses the same object; a non-idempotent write never runs twice).
 *  - RUNTIME STATUS/FIELD RESOLUTION for the task route; nothing hardcoded.
 *  - DEDUP WINDOW: the idempotency key folds the fingerprint with a floored time
 *    window, so a flapping alert can't flood the board.
 *  - LOGS CARRY IDS ONLY: never the token, never raw context blobs.
 */

/** Default dedup window: the same alert pushes at most once per 24h. */
export const DEFAULT_ALERT_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface PushAlertInput {
  /** Alert type/category, e.g. "run-failed", "budget-90", "clickup-sync". */
  type: string;
  /** Free-form severity, e.g. "error" | "warn" | "info". */
  severity: string;
  /** Short human-readable Dutch summary. */
  message: string;
  /**
   * Stable dedup discriminator. Defaults to `${type}:${client|system}` — pass a
   * more specific key (e.g. the app alert's fingerprint) to dedup precisely.
   */
  dedupeKey?: string;
  /** Client context, when the alert is client-bound (else it is a system alert). */
  clientId?: number | string | null;
  clientName?: string | null;
  /** The client's linked ClickUp company task id, for an optional relation. */
  companyTaskId?: string | null;
  /** Short evidence / measured value (IDs + numbers only — never PII/secrets). */
  evidence?: string | null;
  /** Recommended next action (Dutch). */
  recommendedAction?: string | null;
  /** Replit run or correlation id for traceability. */
  sourceRunId?: string | null;
  /** When the alert was detected (defaults to now) — anchors the dedup window. */
  detectedAt?: Date;
  /** Dedup window in ms (default 24h). Same alert within a window pushes once. */
  windowMs?: number;
  /** When set, COMMENT on this task instead of creating a task in Internal Work. */
  targetTaskId?: string | null;
  /** Ties every request of this push together in the logs. */
  correlationId?: string;
  /** When true, resolve + preview only; write nothing. */
  dryRun?: boolean;
}

/** The dedup fingerprint for an alert (stable across a window). */
function alertFingerprint(input: PushAlertInput): string {
  const explicit = input.dedupeKey?.trim();
  if (explicit) return explicit.slice(0, 500);
  const ctx =
    input.clientId != null
      ? `client:${input.clientId}`
      : input.clientName?.trim()
        ? `client:${input.clientName.trim()}`
        : "system";
  return `${input.type}:${ctx}`.slice(0, 500);
}

/** Floor the detection time onto the dedup window boundary. */
function windowStartFor(detectedAt: Date, windowMs: number): number {
  const t = detectedAt.getTime();
  return Math.floor(t / windowMs) * windowMs;
}

function alertTaskName(input: PushAlertInput): string {
  const ctx =
    input.clientName?.trim() ||
    (input.clientId != null ? `Klant ${input.clientId}` : "Systeem");
  return `[ALERT] ${input.type} — ${ctx}`;
}

function alertBody(input: PushAlertInput): string {
  const detectedAt = (input.detectedAt ?? new Date()).toISOString();
  const context =
    input.clientName?.trim() ||
    (input.clientId != null ? `Klant ${input.clientId}` : "Systeem (geen klant)");
  const lines = [
    `## Alert — ${input.type}`,
    "",
    `- **Type:** ${input.type}`,
    `- **Severity:** ${input.severity}`,
    `- **Context:** ${context}`,
    `- **Gedetecteerd op:** ${detectedAt}`,
  ];
  if (input.evidence?.trim())
    lines.push(`- **Bewijs / meetwaarde:** ${input.evidence.trim()}`);
  if (input.recommendedAction?.trim())
    lines.push(`- **Aanbevolen actie:** ${input.recommendedAction.trim()}`);
  if (input.sourceRunId?.trim())
    lines.push(`- **Source run / correlatie:** ${input.sourceRunId.trim()}`);
  lines.push("", "---", "", input.message);
  return lines.join("\n");
}

export async function pushAlert(input: PushAlertInput): Promise<PushOutcome> {
  const correlationId = input.correlationId ?? randomUUID();
  const windowMs =
    input.windowMs && input.windowMs > 0 ? input.windowMs : DEFAULT_ALERT_WINDOW_MS;
  const detectedAt = input.detectedAt ?? new Date();
  const fingerprint = alertFingerprint(input);
  const key = alertKey(fingerprint, windowStartFor(detectedAt, windowMs));
  const log = (msg: string, extra: Record<string, unknown> = {}) =>
    logger.info(
      { scope: "clickup:push", kind: "alert", correlationId, key, ...extra },
      msg,
    );

  const targetTaskId = input.targetTaskId?.trim() || null;

  // ---- Route A: comment on an existing task (client Engagement / ops task) ----
  if (targetTaskId) {
    if (input.dryRun) {
      log("alert push dry-run (comment)", { targetTaskId });
      return {
        status: "skipped",
        reason: "dry-run: niets naar ClickUp geschreven",
        idempotencyKey: key,
        dryRun: true,
        preview: {
          route: "comment",
          targetTaskId,
          name: alertTaskName(input),
          type: input.type,
          severity: input.severity,
        },
      };
    }

    const claim = await claimPush({
      kind: "alert",
      idempotencyKey: key,
      sourceRunId: input.sourceRunId ?? null,
    });
    if (claim.state === "already-succeeded") {
      log("alert push duplicate (already succeeded)", {
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
        reason: "alert wordt al verwerkt in een andere run",
        idempotencyKey: key,
      };
    }

    // Crash-resume: a row already carrying an object id has posted the comment.
    if (claim.record.clickupObjectId) {
      await markSucceeded(key, {
        objectId: claim.record.clickupObjectId,
        url: claim.record.clickupUrl ?? null,
      });
      return {
        status: "pushed",
        idempotencyKey: key,
        objectId: claim.record.clickupObjectId,
        url: claim.record.clickupUrl ?? null,
      };
    }

    const posted = await addComment(targetTaskId, alertBody(input), correlationId);
    if (!posted.ok) {
      await markFailed(key, posted.error.code);
      log("alert push failed (comment)", { code: posted.error.code });
      return {
        status: "failed",
        code: posted.error.code,
        message: posted.error.message,
        idempotencyKey: key,
      };
    }
    const objectId = posted.data.id ?? targetTaskId;
    await recordObjectId(key, objectId, null);
    await markSucceeded(key, { objectId, url: null });
    log("alert pushed (comment)", { objectId, targetTaskId });
    return { status: "pushed", idempotencyKey: key, objectId, url: null };
  }

  // ---- Route B: create a task in the central Internal Work list --------------
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
    resolveStatus(statuses, ["open", "to do", "new", "backlog"]) ?? undefined;

  const recordTypeField = resolveField(fields, "Record type");
  const companyField = resolveField(fields, "Company");
  const inlineFields: { id: string; value: unknown }[] = [];
  const alertOpt =
    resolveDropdownOptionId(recordTypeField, "Alert") ??
    resolveDropdownOptionId(recordTypeField, "Alerts");
  if (recordTypeField && alertOpt)
    inlineFields.push({ id: recordTypeField.id, value: alertOpt });

  const name = alertTaskName(input);

  if (input.dryRun) {
    log("alert push dry-run (task)", { listId });
    return {
      status: "skipped",
      reason: "dry-run: niets naar ClickUp geschreven",
      idempotencyKey: key,
      dryRun: true,
      preview: {
        route: "task",
        listId,
        listName,
        name,
        status: status ?? null,
        type: input.type,
        severity: input.severity,
        fieldsSet: inlineFields.map((f) =>
          f.id === recordTypeField?.id ? "Record type" : f.id,
        ),
      },
    };
  }

  const claim = await claimPush({
    kind: "alert",
    idempotencyKey: key,
    sourceRunId: input.sourceRunId ?? null,
  });
  if (claim.state === "already-succeeded") {
    log("alert push duplicate (already succeeded)", {
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
      reason: "alert wordt al verwerkt in een andere run",
      idempotencyKey: key,
    };
  }

  let objectId = claim.record.clickupObjectId ?? null;
  let url = claim.record.clickupUrl ?? null;
  const freshCreate = !objectId;

  if (!objectId) {
    const created = await createTask(
      listId,
      { name, markdown: alertBody(input), status, customFields: inlineFields },
      correlationId,
    );
    if (!created.ok) {
      await markFailed(key, created.error.code);
      log("alert push failed (create)", { code: created.error.code });
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

  // Best-effort: link the client Company relation when we can. Set on every run
  // (including crash-resume) — `add` is idempotent, so a resumed task never
  // silently loses its client link.
  if (companyField && input.companyTaskId) {
    const rel = await setCustomField(
      objectId,
      companyField.id,
      { add: [input.companyTaskId] },
      correlationId,
    );
    if (!rel.ok) {
      logger.warn(
        { scope: "clickup:push", kind: "alert", correlationId, key, code: rel.error.code },
        "alert push: Company-relatie niet gezet (task blijft geldig)",
      );
    }
  }

  await markSucceeded(key, { objectId, url });
  log("alert pushed (task)", { objectId, freshCreate });
  return { status: "pushed", idempotencyKey: key, objectId, url };
}

// ---- Sweeper ---------------------------------------------------------------

export interface SweepAlertsResult {
  scanned: number;
  pushed: number;
  duplicate: number;
  skipped: number;
  failed: number;
  results: { alertId: number; outcome: PushOutcome }[];
}

/**
 * Read the app's OPEN system alerts and push each to ClickUp (brief §6.6 trigger
 * side). Best-effort and self-contained: the app alert stays open (ClickUp is a
 * review surface, not the resolver), and each push is idempotent per
 * fingerprint+window so re-sweeping never duplicates. Never throws — a per-alert
 * failure is captured in `results` and the sweep continues.
 */
export async function sweepAlertsToClickUp(opts?: {
  limit?: number;
  windowMs?: number;
  dryRun?: boolean;
  correlationId?: string;
}): Promise<SweepAlertsResult> {
  const correlationId = opts?.correlationId ?? randomUUID();
  const alerts = await listAlerts({
    unresolvedOnly: true,
    limit: Math.min(Math.max(opts?.limit ?? 50, 1), 200),
  });

  const result: SweepAlertsResult = {
    scanned: alerts.length,
    pushed: 0,
    duplicate: 0,
    skipped: 0,
    failed: 0,
    results: [],
  };

  for (const a of alerts) {
    const ctx = a.context ?? {};
    const clientId =
      typeof ctx.clientId === "number" || typeof ctx.clientId === "string"
        ? (ctx.clientId as number | string)
        : null;
    const clientName =
      typeof ctx.clientName === "string" ? ctx.clientName : null;
    const companyTaskId =
      typeof ctx.companyTaskId === "string" ? ctx.companyTaskId : null;
    const evidence =
      typeof ctx.evidence === "string"
        ? ctx.evidence
        : `occurrences=${a.occurrences}`;
    const recommendedAction =
      typeof ctx.recommendedAction === "string" ? ctx.recommendedAction : null;
    const sourceRunId =
      typeof ctx.runId === "string"
        ? ctx.runId
        : typeof ctx.sourceRunId === "string"
          ? ctx.sourceRunId
          : `alert:${a.id}`;

    let outcome: PushOutcome;
    try {
      outcome = await pushAlert({
        type: a.source,
        severity: a.severity,
        message: a.message,
        dedupeKey: a.fingerprint ?? `${a.source}:${a.id}`,
        clientId,
        clientName,
        companyTaskId,
        evidence,
        recommendedAction,
        sourceRunId,
        detectedAt: a.lastSeenAt,
        windowMs: opts?.windowMs,
        correlationId,
        dryRun: opts?.dryRun,
      });
    } catch (err) {
      outcome = {
        status: "failed",
        code: "SWEEP_EXCEPTION",
        message: err instanceof Error ? err.message.slice(0, 200) : "unknown",
      };
    }
    result.results.push({ alertId: a.id, outcome });
    if (outcome.status === "pushed") result.pushed += 1;
    else if (outcome.status === "duplicate") result.duplicate += 1;
    else if (outcome.status === "skipped") result.skipped += 1;
    else result.failed += 1;
  }

  logger.info(
    {
      scope: "clickup:push",
      kind: "alert",
      correlationId,
      scanned: result.scanned,
      pushed: result.pushed,
      duplicate: result.duplicate,
      skipped: result.skipped,
      failed: result.failed,
    },
    "alert sweep afgerond",
  );
  return result;
}
