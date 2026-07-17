import { randomUUID } from "node:crypto";
import { logger } from "../logger";
import { renderReportPdf } from "../report-pdf";
import type { GoogleAdsMetrics } from "../google-ads";
import { resolveReportingLocation } from "./companies";
import {
  claimPush,
  markFailed,
  markSucceeded,
  recordObjectId,
  reportKey,
} from "./idempotency";
import {
  createTask,
  resolveDropdownOptionId,
  resolveField,
  resolveStatus,
  setCustomField,
  addAttachment,
} from "./tasks";
import type { PushOutcome } from "./types";

/**
 * Report push flow (brief §6.4). Turns a finished monthly-reporting run into ONE
 * reviewable Draft task in the client's Reporting & Billing list — idempotent per
 * client+month, retry-safe, and dry-run-capable.
 *
 * Guardrails baked in here:
 *  - LOCATION FIRST: resolve (and gate) the target before touching state; an
 *    unconfigured client becomes a skip-with-reason, never a wrong write.
 *  - DRY-RUN WRITES NOTHING: not even a push-record row — it returns a safe
 *    preview and returns.
 *  - EXACTLY ONE OBJECT: `claimPush` (CAS) + `recordObjectId` mean a retry or a
 *    crash-resume re-enriches the same task instead of creating a second one; the
 *    non-idempotent PDF attachment is only added on the fresh-create path.
 *  - RUNTIME FIELD/STATUS RESOLUTION: statuses and custom-field/option ids are
 *    resolved from the live list, never hardcoded.
 *  - LOGS CARRY IDS ONLY: never the report body, never the token.
 */

export interface PushReportInput {
  /** The Replit run this report came from (for traceability + idempotency). */
  sourceRunId: string;
  /** App client id — half of the idempotency key. */
  clientId: number | string;
  /** Reporting month as `YYYY-MM` — the other half of the idempotency key. */
  period: string;
  /** The client's linked ClickUp company task id (`clients.clickupCompanyId`). */
  companyTaskId: string | null | undefined;
  /** Client-facing report markdown (becomes the task body + the attached PDF). */
  clientReport: string;
  /** Display name for the task title + PDF cover. */
  clientName: string;
  /** Optional Ads metrics for the PDF cover KPIs. */
  metrics?: GoogleAdsMetrics | null;
  /** Link to the full deliverable in the app (Report URL custom field). */
  reportUrl?: string | null;
  /** Responsible agent/head, for the metadata block. */
  agent?: string | null;
  /** Whether the report still needs human approval (metadata only). */
  approvalRequired?: boolean;
  /** When the report was generated (defaults to now). */
  generatedAt?: Date;
  /** Ties every request of this push together in the logs. */
  correlationId?: string;
  /** When true, resolve + preview only; write nothing. */
  dryRun?: boolean;
}

const PERIOD_RE = /^\d{4}-\d{2}$/;

/** First/last instant (UTC midnight) of a `YYYY-MM` month, as epoch ms. */
function periodBounds(period: string): { start: number; end: number } | null {
  if (!PERIOD_RE.test(period)) return null;
  const [y, m] = period.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  return { start: Date.UTC(y, m - 1, 1), end: Date.UTC(y, m, 0) };
}

/** The Draft task title (brief §6.4): `[YYYY-MM] {client} - Monthly Report`. */
function reportTaskName(period: string, clientName: string): string {
  return `[${period}] ${clientName} - Monthly Report`;
}

function reportBody(input: PushReportInput): string {
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();
  const lines = [
    `## Maandrapport — ${input.clientName}`,
    "",
    `- **Periode:** ${input.period}`,
    `- **Gegenereerd op:** ${generatedAt}`,
    `- **Source run:** ${input.sourceRunId}`,
    `- **Agent:** ${input.agent?.trim() || "Saerens AI-team"}`,
    `- **Goedkeuring vereist:** ${input.approvalRequired ? "ja" : "nee"}`,
  ];
  if (input.reportUrl) lines.push(`- **Volledig deliverable:** ${input.reportUrl}`);
  lines.push("", "---", "", input.clientReport);
  return lines.join("\n");
}

/** PDF filename for the attached report. */
function pdfFilename(clientName: string, period: string): string {
  const slug = clientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `maandrapport-${slug || "klant"}-${period}.pdf`;
}

export async function pushReport(input: PushReportInput): Promise<PushOutcome> {
  const correlationId = input.correlationId ?? randomUUID();
  const key = reportKey(input.clientId, input.period);
  const log = (msg: string, extra: Record<string, unknown> = {}) =>
    logger.info(
      { scope: "clickup:push", kind: "report", correlationId, key, ...extra },
      msg,
    );

  const bounds = periodBounds(input.period);
  if (!bounds) {
    return {
      status: "failed",
      code: "BAD_PERIOD",
      message: `Ongeldige periode "${input.period}" (verwacht YYYY-MM).`,
      idempotencyKey: key,
    };
  }

  // 1) Resolve + gate the target location (read-only) before any state change.
  const loc = await resolveReportingLocation({
    companyTaskId: input.companyTaskId,
    correlationId,
  });
  if (loc.status === "skipped") {
    log("report push skipped", { reason: loc.reason });
    return { status: "skipped", reason: loc.reason, idempotencyKey: key };
  }
  if (loc.status === "failed") {
    return {
      status: "failed",
      code: loc.error.code,
      message: loc.error.message,
      idempotencyKey: key,
    };
  }
  const location = loc.location;

  // Resolve the status + custom-field values from the LIVE list metadata.
  const status =
    resolveStatus(location.statuses, [
      "drafting",
      "draft",
      "collecting data",
      "scheduled",
      "to do",
    ]) ?? undefined;

  const recordTypeField = resolveField(location.fields, "Record type");
  const reportTypeField = resolveField(location.fields, "Report type");
  const periodStartField = resolveField(location.fields, "Period start");
  const periodEndField = resolveField(location.fields, "Period end");
  const reportUrlField = resolveField(location.fields, "Report URL");
  const companyField = resolveField(location.fields, "Company");

  const inlineFields: { id: string; value: unknown }[] = [];
  const recordOpt = resolveDropdownOptionId(recordTypeField, "Report");
  if (recordTypeField && recordOpt)
    inlineFields.push({ id: recordTypeField.id, value: recordOpt });
  const monthlyOpt = resolveDropdownOptionId(reportTypeField, "Monthly");
  if (reportTypeField && monthlyOpt)
    inlineFields.push({ id: reportTypeField.id, value: monthlyOpt });
  if (periodStartField)
    inlineFields.push({ id: periodStartField.id, value: bounds.start });
  if (periodEndField)
    inlineFields.push({ id: periodEndField.id, value: bounds.end });
  if (input.reportUrl && reportUrlField)
    inlineFields.push({ id: reportUrlField.id, value: input.reportUrl });

  const name = reportTaskName(input.period, input.clientName);

  // 2) Dry-run: return a safe preview WITHOUT writing anything (not even a row).
  if (input.dryRun) {
    log("report push dry-run", { listId: location.listId });
    return {
      status: "skipped",
      reason: "dry-run: niets naar ClickUp geschreven",
      idempotencyKey: key,
      dryRun: true,
      preview: {
        listId: location.listId,
        listName: location.listName,
        companyTaskId: location.companyTaskId,
        name,
        status: status ?? null,
        period: input.period,
        reportUrl: input.reportUrl ?? null,
        fieldsSet: inlineFields
          .map((f) => {
            if (f.id === recordTypeField?.id) return "Record type=Report";
            if (f.id === reportTypeField?.id) return "Report type=Monthly";
            if (f.id === periodStartField?.id) return "Period start";
            if (f.id === periodEndField?.id) return "Period end";
            if (f.id === reportUrlField?.id) return "Report URL";
            return f.id;
          })
          .concat(companyField ? ["Company"] : []),
      },
    };
  }

  // 3) Claim the push slot (exactly-once).
  const claim = await claimPush({
    kind: "report",
    idempotencyKey: key,
    sourceRunId: input.sourceRunId,
  });
  if (claim.state === "already-succeeded") {
    log("report push duplicate (already succeeded)", {
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
      location.listId,
      { name, markdown: reportBody(input), status, customFields: inlineFields },
      correlationId,
    );
    if (!created.ok) {
      await markFailed(key, created.error.code);
      log("report push failed (create)", { code: created.error.code });
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

  // 5) Best-effort enrichment. The task exists + links back already, so a failure
  // here is logged (ids only) but does not fail the push (partial-failure).
  if (companyField && location.companyTaskId) {
    const rel = await setCustomField(
      objectId,
      companyField.id,
      { add: [location.companyTaskId] },
      correlationId,
    );
    if (!rel.ok) {
      logger.warn(
        { scope: "clickup:push", kind: "report", correlationId, key, code: rel.error.code },
        "report push: Company-relatie niet gezet (task blijft geldig)",
      );
    }
  }

  // Attach the PDF only on the fresh-create path — an attachment is NOT
  // idempotent, so a resume must not add a duplicate copy.
  if (freshCreate) {
    try {
      const pdf = await renderReportPdf(input.clientReport, {
        clientName: input.clientName,
        subtitle: `Maandrapport — ${input.period}`,
        dateLabel: (input.generatedAt ?? new Date()).toLocaleDateString("nl-BE"),
        reportType: "ads",
        metrics: input.metrics ?? null,
      });
      const att = await addAttachment(
        objectId,
        {
          filename: pdfFilename(input.clientName, input.period),
          content: new Uint8Array(pdf),
          contentType: "application/pdf",
        },
        correlationId,
      );
      if (!att.ok) {
        logger.warn(
          { scope: "clickup:push", kind: "report", correlationId, key, code: att.error.code },
          "report push: PDF-bijlage niet toegevoegd (task blijft geldig)",
        );
      }
    } catch (err) {
      logger.warn(
        {
          scope: "clickup:push",
          kind: "report",
          correlationId,
          key,
          err: err instanceof Error ? err.message.slice(0, 200) : "unknown",
        },
        "report push: PDF-render mislukt (task blijft geldig)",
      );
    }
  }

  await markSucceeded(key, { objectId, url });
  log("report pushed", { objectId, freshCreate });
  return { status: "pushed", idempotencyKey: key, objectId, url };
}
