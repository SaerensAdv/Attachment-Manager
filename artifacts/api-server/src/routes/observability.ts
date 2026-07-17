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

const router: IRouter = Router();
const iso = (date: Date | null | undefined) => date ? date.toISOString() : null;

router.get("/system/status", async (_req, res) => {
  const checks: Record<string, unknown>[] = [];
  const dbStart = Date.now();
  try { await pool.query("SELECT 1"); checks.push({ key: "database", status: "healthy", checkedAt: new Date().toISOString(), latencyMs: Date.now()-dbStart }); }
  catch { checks.push({ key: "database", status: "down", checkedAt: new Date().toISOString(), message: "DATABASE_UNAVAILABLE" }); }
  const active = getActiveGraph() ?? (await loadActiveIntoMemory());
  checks.push({ key: "graph", status: active ? "healthy" : "degraded", checkedAt: new Date().toISOString(), message: active ? null : "NO_ACTIVE_SNAPSHOT", lastSyncedAt: active?.meta.lastSyncedAt ?? null, syncing: isSyncing() });
  checks.push({ key: "scheduler", ...getSchedulerStatus(), checkedAt: new Date().toISOString() });
  checks.push({ key: "clickup", status: process.env.CLICKUP_API_TOKEN?.trim() ? "healthy" : "unknown", checkedAt: new Date().toISOString(), message: process.env.CLICKUP_API_TOKEN?.trim() ? "CONFIGURED" : "NOT_CONFIGURED" });
  const webhookConfigured = Boolean(process.env.CLICKUP_WEBHOOK_SECRET?.trim() && readClickUpWebhookPolicy());
  checks.push({ key: "clickup_webhook", status: webhookConfigured ? "healthy" : "unknown", checkedAt: new Date().toISOString(), message: webhookConfigured ? "CONFIGURED" : "NOT_CONFIGURED" });
  checks.push({ key: "anthropic", status: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY?.trim() ? "healthy" : "unknown", checkedAt: new Date().toISOString(), message: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY?.trim() ? "CONFIGURED" : "NOT_CONFIGURED" });
  const overall = checks.some((c) => c.status === "down") ? "down" : checks.some((c) => c.status === "degraded" || c.status === "unknown") ? "degraded" : "healthy";
  res.json({ status: overall, process: processStatus(), checks });
});

router.get("/operations/status", async (_req, res) => {
  const [approvals, proposals, alerts, schedules, pushes, webhooks] = await Promise.all([
    listPendingApprovals().catch(() => []), listPendingProposals().catch(() => []), listAlerts({ unresolvedOnly: true }).catch(() => []),
    listSchedules().catch((): Schedule[] => []), pushQueueSummary(), clickUpWebhookSummary().catch(() => null),
  ]);
  const enabled = schedules.filter((s) => s.enabled);
  const next = enabled.map((s) => s.nextRunAt).filter((d): d is Date => Boolean(d)).sort((a,b) => a.getTime()-b.getTime())[0] ?? null;
  const graph = getActiveGraph();
  res.json({ pendingApprovals: approvals.length, pendingProposals: proposals.length, unresolvedAlerts: alerts.length,
    pushQueue: pushes, scheduler: { ...getSchedulerStatus(), enabledSchedules: enabled.length, nextRunAt: iso(next) },
    graph: { lastSyncedAt: graph?.meta.lastSyncedAt ?? null, syncing: isSyncing() },
    webhook: { status: webhooks ? "active" : "unavailable", registered: Boolean(process.env.CLICKUP_WEBHOOK_ID?.trim()),
      configured: Boolean(process.env.CLICKUP_WEBHOOK_SECRET?.trim() && readClickUpWebhookPolicy()), ...(webhooks ?? { lastEventAt: null, deadLetters: 0 }) } });
});

router.get("/clickup/pushes", async (req, res) => {
  const records = await listPushRecords({ status: typeof req.query.status === "string" ? req.query.status : undefined,
    kind: typeof req.query.kind === "string" ? req.query.kind : undefined, sourceRunId: typeof req.query.sourceRunId === "string" ? req.query.sourceRunId : undefined,
    limit: typeof req.query.limit === "string" ? Number(req.query.limit) : undefined });
  res.json({ records: records.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), nextAttemptAt: iso(r.nextAttemptAt), terminalAt: iso(r.terminalAt) })) });
});
router.post("/clickup/pushes/:id/requeue", async (req, res) => {
  const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Ongeldige id." }); return; }
  const record = await requeuePushRecord(id); if (!record) { res.status(409).json({ error: "Push is niet retrybaar of bestaat niet." }); return; }
  res.json({ ...record, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(), nextAttemptAt: iso(record.nextAttemptAt), terminalAt: iso(record.terminalAt), note: "Opnieuw klaargezet." });
});
router.post("/clickup/webhooks/:id/requeue", async (req, res) => {
  const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Ongeldige id." }); return; }
  if (!await requeueClickUpWebhookDeadLetter(id)) { res.status(409).json({ error: "Webhook-event is geen dead letter of bestaat niet." }); return; }
  res.json({ status: "queued" });
});
export default router;
