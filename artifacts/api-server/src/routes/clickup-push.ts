import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, clientsTable } from "@workspace/db";
import { pushReport } from "../lib/clickup/push-report";
import {
  pushSearchTerms,
  type SearchTermRow,
} from "../lib/clickup/push-search-terms";
import { pushAlert, sweepAlertsToClickUp } from "../lib/clickup/push-alert";
import type { PushOutcome } from "../lib/clickup/types";
import { parseId } from "./clients-shared";

/**
 * Owner-only (behind the global requireAuth gate) manual trigger for the ClickUp
 * report push. It exists so the owner can smoke-test the push mechanics against a
 * real client without waiting for a scheduled monthly run:
 *  - `dryRun: true` (the default) resolves + gates the target and returns a safe
 *    preview, writing NOTHING — not even a push-record row.
 *  - `dryRun: false` performs the real, idempotent push (repeat calls for the
 *    same client+period return `duplicate`, never a second task).
 *
 * When no `clientReport` is supplied a clearly-labelled test body is used, so an
 * accidental real push is obviously a test rather than a client-grade report.
 */
const router: IRouter = Router();

const PERIOD_RE = /^\d{4}-\d{2}$/;

router.post("/clickup/push/report", async (req, res) => {
  const body = (req.body ?? {}) as {
    clientId?: unknown;
    period?: unknown;
    dryRun?: unknown;
    clientReport?: unknown;
    sourceRunId?: unknown;
  };

  const clientId = parseId(String(body.clientId ?? ""));
  if (clientId === null) {
    res.status(400).json({ error: "Ongeldige of ontbrekende clientId." });
    return;
  }
  const period = typeof body.period === "string" ? body.period.trim() : "";
  if (!PERIOD_RE.test(period)) {
    res.status(400).json({ error: "Ongeldige of ontbrekende periode (verwacht YYYY-MM)." });
    return;
  }
  // Default to a dry-run: a real push only happens when explicitly asked for.
  const dryRun = body.dryRun !== false;

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));
  if (!client) {
    res.status(404).json({ error: "Klant niet gevonden." });
    return;
  }

  const clientReport =
    typeof body.clientReport === "string" && body.clientReport.trim()
      ? body.clientReport
      : `# Testrapport — ${client.name}\n\nDit is een **testrapport** dat via de handmatige ClickUp-push route werd aangemaakt voor periode ${period}. Het bevat geen echte cijfers.`;
  const sourceRunId =
    typeof body.sourceRunId === "string" && body.sourceRunId.trim()
      ? body.sourceRunId.trim()
      : `manual:${clientId}:${period}`;

  let outcome: PushOutcome;
  try {
    outcome = await pushReport({
      sourceRunId,
      clientId,
      period,
      companyTaskId: client.clickupCompanyId,
      clientReport,
      clientName: client.name,
      reportUrl: null,
      agent: "Handmatige test",
      approvalRequired: false,
      dryRun,
    });
  } catch (err) {
    res.status(502).json({
      error: "ClickUp-push kon niet worden uitgevoerd.",
      detail: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  // A genuine failure is a 502; skipped/duplicate/pushed are all valid 200s.
  res.status(outcome.status === "failed" ? 502 : 200).json(outcome);
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A clearly-labelled sample analysis, so an accidental real push is obviously a test. */
const SAMPLE_TERMS: SearchTermRow[] = [
  {
    term: "test irrelevante zoekterm",
    impressions: 120,
    clicks: 8,
    cost: 12.5,
    classification: "irrelevant",
    proposedAction: "Toevoegen als negative (exact)",
  },
  {
    term: "test verkeerd gerouteerd",
    impressions: 60,
    clicks: 4,
    cost: 6.25,
    classification: "mis-routed",
    proposedAction: "Verplaatsen / negative in verkeerde campagne",
  },
  {
    term: "test te monitoren zoekterm",
    impressions: 300,
    clicks: 20,
    cost: 45.0,
    classification: "monitor",
    proposedAction: "Monitoren",
  },
];

router.post("/clickup/push/search-terms", async (req, res) => {
  const body = (req.body ?? {}) as {
    customerId?: unknown;
    accountName?: unknown;
    weekStart?: unknown;
    rows?: unknown;
    dryRun?: unknown;
    reportUrl?: unknown;
    sourceRunId?: unknown;
  };

  const customerId =
    typeof body.customerId === "string" ? body.customerId.trim() : "";
  if (!customerId) {
    res.status(400).json({ error: "Ongeldige of ontbrekende customerId." });
    return;
  }
  const weekStart =
    typeof body.weekStart === "string" ? body.weekStart.trim() : "";
  if (!DATE_RE.test(weekStart)) {
    res
      .status(400)
      .json({ error: "Ongeldige of ontbrekende weekStart (verwacht YYYY-MM-DD)." });
    return;
  }
  const accountName =
    typeof body.accountName === "string" && body.accountName.trim()
      ? body.accountName.trim()
      : `Account ${customerId}`;
  // Default to a dry-run: a real push only happens when explicitly asked for.
  const dryRun = body.dryRun !== false;
  const rows = Array.isArray(body.rows) && body.rows.length
    ? (body.rows as SearchTermRow[])
    : SAMPLE_TERMS;
  const reportUrl =
    typeof body.reportUrl === "string" && body.reportUrl.trim()
      ? body.reportUrl.trim()
      : null;
  const sourceRunId =
    typeof body.sourceRunId === "string" && body.sourceRunId.trim()
      ? body.sourceRunId.trim()
      : `manual:${customerId}:${weekStart}`;

  let outcome: PushOutcome;
  try {
    outcome = await pushSearchTerms({
      sourceRunId,
      customerId,
      accountName,
      weekStart,
      rows,
      reportUrl,
      agent: "Handmatige test",
      dryRun,
    });
  } catch (err) {
    res.status(502).json({
      error: "ClickUp-push kon niet worden uitgevoerd.",
      detail: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  res.status(outcome.status === "failed" ? 502 : 200).json(outcome);
});

router.post("/clickup/push/alert", async (req, res) => {
  const body = (req.body ?? {}) as {
    type?: unknown;
    severity?: unknown;
    message?: unknown;
    dedupeKey?: unknown;
    clientId?: unknown;
    clientName?: unknown;
    companyTaskId?: unknown;
    evidence?: unknown;
    recommendedAction?: unknown;
    sourceRunId?: unknown;
    targetTaskId?: unknown;
    windowMs?: unknown;
    dryRun?: unknown;
  };

  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;

  const type = str(body.type) ?? "test-alert";
  const severity = str(body.severity) ?? "warn";
  const message = str(body.message) ?? "Handmatige test-alert.";
  // Default to a dry-run: a real push only happens when explicitly asked for.
  const dryRun = body.dryRun !== false;

  let outcome: PushOutcome;
  try {
    outcome = await pushAlert({
      type,
      severity,
      message,
      dedupeKey: str(body.dedupeKey),
      clientId:
        typeof body.clientId === "number" || typeof body.clientId === "string"
          ? (body.clientId as number | string)
          : null,
      clientName: str(body.clientName) ?? null,
      companyTaskId: str(body.companyTaskId) ?? null,
      evidence: str(body.evidence) ?? null,
      recommendedAction: str(body.recommendedAction) ?? null,
      sourceRunId: str(body.sourceRunId) ?? null,
      targetTaskId: str(body.targetTaskId) ?? null,
      windowMs:
        typeof body.windowMs === "number" && body.windowMs > 0
          ? body.windowMs
          : undefined,
      dryRun,
    });
  } catch (err) {
    res.status(502).json({
      error: "ClickUp-push kon niet worden uitgevoerd.",
      detail: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  res.status(outcome.status === "failed" ? 502 : 200).json(outcome);
});

router.post("/clickup/push/alerts/sweep", async (req, res) => {
  const body = (req.body ?? {}) as {
    limit?: unknown;
    windowMs?: unknown;
    dryRun?: unknown;
  };
  // Default to a dry-run: a real sweep only happens when explicitly asked for.
  const dryRun = body.dryRun !== false;
  try {
    const result = await sweepAlertsToClickUp({
      limit: typeof body.limit === "number" ? body.limit : undefined,
      windowMs:
        typeof body.windowMs === "number" && body.windowMs > 0
          ? body.windowMs
          : undefined,
      dryRun,
    });
    res.status(200).json(result);
  } catch (err) {
    res.status(502).json({
      error: "ClickUp-alert-sweep kon niet worden uitgevoerd.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
