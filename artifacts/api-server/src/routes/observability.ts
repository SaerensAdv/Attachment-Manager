import { Router, type IRouter } from "express";
import { pool, type Schedule } from "@workspace/db";
import { getActiveGraph, isSyncing, loadActiveIntoMemory } from "../lib/graph/snapshot-store";
import { listPendingApprovals } from "../lib/generations-store";
import { listPendingProposals } from "../lib/proposals-store";
import { listAlerts } from "../lib/alerts-store";
import { listSchedules } from "../lib/schedules-store";
import { getSchedulerStatus } from "../lib/scheduler";
import { listPushRecords, pushQueueSummary, requeuePushRecord } from "../lib/clickup/idempotency";
import { clickUpWebhookSummary, requeueClickUpWebhookDeadLetter } from "../lib/clickup/webhook-store";
import { readClickUpWebhookPolicy } from "../lib/clickup/webhook-security";
import { processStatus } from "../lib/runtime-observability";
import { compareBuilds, getRuntimeProvenance } from "../lib/runtime-provenance";
import { actionResult, apiProblem } from "../lib/http-contract";
import { diagnoseGraph } from "../lib/graph/diagnostics";
import { getGraphDiagnosticEvidence } from "../lib/graph/diagnostic-state";
import { checkRuntimeStores, classifyHeartbeat, readWorkerHeartbeats, type WorkerHeartbeat } from "../lib/worker-heartbeats";

const router: IRouter = Router();
const iso = (date: Date | null | undefined) => date ? date.toISOString() : null;
const noHeartbeats = (): WorkerHeartbeat[] => [];

router.get("/system/status", async (req, res) => {
  const checks: Record<string, unknown>[] = [];
  const dbStart = Date.now();
  try { await pool.query("SELECT 1"); checks.push({ key: "database", status: "healthy", checkedAt: new Date().toISOString(), latencyMs: Date.now()-dbStart }); }
  catch { checks.push({ key: "database", status: "down", checkedAt: new Date().toISOString(), message: "DATABASE_UNAVAILABLE" }); }

  const existingActive = getActiveGraph();
  const [active, heartbeats, stores] = await Promise.all([
    existingActive ? Promise.resolve(existingActive) : loadActiveIntoMemory(),
    readWorkerHeartbeats().catch(noHeartbeats),
    checkRuntimeStores().catch(() => null),
  ]);
  const graphEvidence = getGraphDiagnosticEvidence();
  const graphDiagnostics = graphEvidence?.active ?? (active ? diagnoseGraph(active.graph, getRuntimeProvenance()) : null);
  const graphStatus = !active ? "degraded" : graphEvidence?.state === "failed" || graphDiagnostics?.invariantFailures.length ? "down" : graphEvidence?.state === "degraded" ? "degraded" : "healthy";
  checks.push({ key: "graph", status: graphStatus, checkedAt: new Date().toISOString(), message: !active ? "NO_ACTIVE_SNAPSHOT" : graphEvidence?.sourceErrors.length ? `GRAPH_SOURCE_ERRORS:${graphEvidence.sourceErrors.length}` : graphDiagnostics?.invariantFailures.length ? graphDiagnostics.invariantFailures.join(",") : "GRAPH_VERIFIED", lastSyncedAt: active?.meta.lastSyncedAt ?? null, syncing: isSyncing(), lensCounts: graphDiagnostics?.nodesByLens ?? null, parity: graphEvidence?.parity ?? null });

  const schedulerHeartbeat = heartbeats.find((heartbeat) => heartbeat.name === "scheduler");
  const webhookHeartbeat = heartbeats.find((heartbeat) => heartbeat.name === "clickup-webhook");
  const schedulerDurable = classifyHeartbeat(schedulerHeartbeat);
  const webhookDurable = classifyHeartbeat(webhookHeartbeat, Date.now(), 60_000);
  checks.push({ key: "scheduler_worker", status: schedulerDurable.status, checkedAt: new Date().toISOString(), message: schedulerDurable.message, heartbeatAt: schedulerHeartbeat?.heartbeatAt ?? null, heartbeatAgeMs: schedulerDurable.ageMs, lastSuccessAt: schedulerHeartbeat?.lastSuccessAt ?? null, lastErrorAt: schedulerHeartbeat?.lastErrorAt ?? null });
  checks.push({ key: "webhook_worker", status: webhookDurable.status, checkedAt: new Date().toISOString(), message: webhookDurable.message, heartbeatAt: webhookHeartbeat?.heartbeatAt ?? null, heartbeatAgeMs: webhookDurable.ageMs, lastSuccessAt: webhookHeartbeat?.lastSuccessAt ?? null, lastErrorAt: webhookHeartbeat?.lastErrorAt ?? null });
  checks.push({ key: "runtime_stores", status: stores?.status ?? "unknown", checkedAt: stores?.checkedAt ?? new Date().toISOString(), message: stores ? stores.missingRequired.length ? `MISSING_REQUIRED_STORES:${stores.missingRequired.join(",")}` : stores.status === "degraded" ? "OPTIONAL_STORES_NOT_READY" : "RUNTIME_STORES_READY" : "STORE_READINESS_UNAVAILABLE", required: stores?.required ?? null, optional: stores?.optional ?? null });

  checks.push({ key: "clickup", status: process.env.CLICKUP_API_TOKEN?.trim() ? "healthy" : "unknown", checkedAt: new Date().toISOString(), message: process.env.CLICKUP_API_TOKEN?.trim() ? "CONFIGURED" : "NOT_CONFIGURED" });
  const webhookConfigured = Boolean(process.env.CLICKUP_WEBHOOK_SECRET?.trim() && readClickUpWebhookPolicy());
  checks.push({ key: "clickup_webhook", status: webhookConfigured ? "healthy" : "unknown", checkedAt: new Date().toISOString(), message: webhookConfigured ? "CONFIGURED" : "NOT_CONFIGURED" });
  checks.push({ key: "anthropic", status: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY?.trim() ? "healthy" : "unknown", checkedAt: new Date().toISOString(), message: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY?.trim() ? "CONFIGURED" : "NOT_CONFIGURED" });
  const provenance = getRuntimeProvenance(); const compatibility = compareBuilds(req.get("x-atlas-frontend-sha"), provenance.gitSha);
  checks.push({ key: "build_compatibility", status: compatibility.status === "mismatch" ? "down" : compatibility.status === "match" ? "healthy" : "unknown", checkedAt: new Date().toISOString(), message: compatibility.status === "mismatch" ? "FRONTEND_API_VERSION_MISMATCH" : compatibility.status === "match" ? "BUILDS_MATCH" : "BUILD_IDENTITY_INCOMPLETE" });
  const overall = checks.some((check) => check.status === "down") ? "down" : checks.some((check) => check.status === "degraded" || check.status === "unknown") ? "degraded" : "healthy";
  res.setHeader("x-atlas-api-sha", provenance.gitSha ?? "unknown");
  res.json({ status: overall, process: processStatus(), provenance, compatibility, checks });
});

router.get("/operations/status", async (_req, res) => {
  const [approvals, proposals, alerts, schedules, pushes, webhooks, heartbeats] = await Promise.all([
    listPendingApprovals().catch(() => []), listPendingProposals().catch(() => []), listAlerts({ unresolvedOnly: true }).catch(() => []),
    listSchedules().catch((): Schedule[] => []), pushQueueSummary(), clickUpWebhookSummary().catch(() => null), readWorkerHeartbeats().catch(noHeartbeats),
  ]);
  const enabled = schedules.filter((schedule) => schedule.enabled); const next = enabled.map((schedule) => schedule.nextRunAt).filter((date): date is Date => Boolean(date)).sort((a,b) => a.getTime()-b.getTime())[0] ?? null;
  const schedulerHeartbeat = heartbeats.find((heartbeat) => heartbeat.name === "scheduler"); const webhookHeartbeat = heartbeats.find((heartbeat) => heartbeat.name === "clickup-webhook");
  const graph = getActiveGraph();
  res.json({ pendingApprovals: approvals.length, pendingProposals: proposals.length, unresolvedAlerts: alerts.length, pushQueue: pushes,
    scheduler: { ...getSchedulerStatus(), enabledSchedules: enabled.length, nextRunAt: iso(next), durable: classifyHeartbeat(schedulerHeartbeat), durableHeartbeatAt: schedulerHeartbeat?.heartbeatAt ?? null },
    graph: { lastSyncedAt: graph?.meta.lastSyncedAt ?? null, syncing: isSyncing() },
    webhook: { status: webhooks ? "active" : "unavailable", registered: Boolean(process.env.CLICKUP_WEBHOOK_ID?.trim()), configured: Boolean(process.env.CLICKUP_WEBHOOK_SECRET?.trim() && readClickUpWebhookPolicy()), durable: classifyHeartbeat(webhookHeartbeat, Date.now(), 60_000), durableHeartbeatAt: webhookHeartbeat?.heartbeatAt ?? null, ...(webhooks ?? { lastEventAt: null, deadLetters: 0 }) } });
});

router.get("/clickup/pushes", async (req, res) => { const records = await listPushRecords({ status: typeof req.query.status === "string" ? req.query.status : undefined, kind: typeof req.query.kind === "string" ? req.query.kind : undefined, sourceRunId: typeof req.query.sourceRunId === "string" ? req.query.sourceRunId : undefined, limit: typeof req.query.limit === "string" ? Number(req.query.limit) : undefined }); res.json({ records: records.map((record) => ({ ...record, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(), nextAttemptAt: iso(record.nextAttemptAt), terminalAt: iso(record.terminalAt) })) }); });
router.post("/clickup/pushes/:id/requeue", async (req, res) => { const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) { res.status(400).json(apiProblem({ error: "Invalid push id.", code: "INVALID_PUSH_ID" })); return; } const record = await requeuePushRecord(id); if (!record) { res.status(409).json(apiProblem({ error: "Push is not retryable or no longer exists.", code: "PUSH_NOT_RETRYABLE" })); return; } const serialized = { ...record, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(), nextAttemptAt: iso(record.nextAttemptAt), terminalAt: iso(record.terminalAt), note: "Queued for retry." }; res.json({ ...serialized, actionResult: actionResult({ action: "clickup.push.requeue", code: "PUSH_REQUEUED", message: "Push queued for retry.", changed: true, verified: true, target: { id } }) }); });
router.post("/clickup/webhooks/:id/requeue", async (req, res) => { const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) { res.status(400).json(apiProblem({ error: "Invalid webhook event id.", code: "INVALID_WEBHOOK_ID" })); return; } if (!await requeueClickUpWebhookDeadLetter(id)) { res.status(409).json(apiProblem({ error: "Webhook event is not a dead letter or no longer exists.", code: "WEBHOOK_NOT_RETRYABLE" })); return; } res.json({ status: "queued", actionResult: actionResult({ action: "clickup.webhook.requeue", code: "WEBHOOK_REQUEUED", message: "Webhook event queued for retry.", changed: true, verified: true, target: { id } }) }); });
export default router;
