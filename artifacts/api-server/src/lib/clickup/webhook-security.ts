import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const CLICKUP_WEBHOOK_EVENT_ALLOWLIST = new Set(["taskUpdated"]);

export interface ClickUpStatusWebhookEvent {
  idempotencyKey: string;
  webhookId: string | null;
  historyId: string | null;
  eventType: string;
  taskId: string;
  workspaceId: string | null;
  actorId: string | null;
  eventAt: Date | null;
  beforeStatus: string | null;
  afterStatus: string | null;
  payload: Record<string, unknown>;
  payloadHash: string;
}

const text = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};

function statusName(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") return text((value as Record<string, unknown>).status);
  return null;
}

export function verifyClickUpSignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const supplied = signature.trim().toLowerCase().replace(/^sha256=/, "");
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(supplied, "hex"));
}

export function parseClickUpStatusEvents(rawBody: Buffer): ClickUpStatusWebhookEvent[] {
  const payload = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
  const eventType = text(payload.event) ?? "unknown";
  if (!CLICKUP_WEBHOOK_EVENT_ALLOWLIST.has(eventType)) return [];
  const taskId = text(payload.task_id);
  if (!taskId) throw new Error("MISSING_TASK_ID");
  const webhookId = text(payload.webhook_id);
  const workspaceId = text(payload.team_id);
  const payloadHash = createHash("sha256").update(rawBody).digest("hex");
  const histories = Array.isArray(payload.history_items) ? payload.history_items : [];
  const out: ClickUpStatusWebhookEvent[] = [];
  histories.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const history = item as Record<string, unknown>;
    if (text(history.field)?.toLowerCase() !== "status") return;
    const historyId = text(history.id);
    const user = history.user && typeof history.user === "object" ? history.user as Record<string, unknown> : null;
    const actorId = text(user?.id) ?? text((payload.user as Record<string, unknown> | undefined)?.id);
    const rawDate = text(history.date) ?? text(payload.date);
    const dateNumber = rawDate ? Number(rawDate) : NaN;
    const eventAt = Number.isFinite(dateNumber) ? new Date(dateNumber < 10_000_000_000 ? dateNumber * 1000 : dateNumber) : null;
    const stablePart = historyId ?? `${payloadHash}:${index}`;
    out.push({
      idempotencyKey: `${webhookId ?? "unknown"}:${stablePart}`,
      webhookId,
      historyId,
      eventType,
      taskId,
      workspaceId,
      actorId,
      eventAt: eventAt && !Number.isNaN(eventAt.getTime()) ? eventAt : null,
      beforeStatus: statusName(history.before),
      afterStatus: statusName(history.after),
      payload,
      payloadHash,
    });
  });
  return out;
}

export interface ClickUpWebhookPolicy {
  workspaceId: string;
  approverIds: Set<string>;
  locationIds: Set<string>;
  approvalStatus: string;
  generationFieldName: string;
  replayWindowMs: number;
}

const csv = (value: string | undefined) => new Set((value ?? "").split(",").map((x) => x.trim()).filter(Boolean));

export function readClickUpWebhookPolicy(env: NodeJS.ProcessEnv = process.env): ClickUpWebhookPolicy | null {
  const workspaceId = (env.CLICKUP_WEBHOOK_WORKSPACE_ID ?? "").trim();
  const approverIds = csv(env.CLICKUP_WEBHOOK_APPROVER_IDS);
  const locationIds = csv(env.CLICKUP_WEBHOOK_LOCATION_IDS);
  if (!workspaceId || approverIds.size === 0 || locationIds.size === 0) return null;
  const minutes = Number(env.CLICKUP_WEBHOOK_REPLAY_WINDOW_MINUTES ?? "30");
  return {
    workspaceId,
    approverIds,
    locationIds,
    approvalStatus: (env.CLICKUP_WEBHOOK_APPROVAL_STATUS ?? "approved").trim().toLowerCase(),
    generationFieldName: (env.CLICKUP_WEBHOOK_GENERATION_FIELD ?? "Atlas Generation ID").trim(),
    replayWindowMs: (Number.isFinite(minutes) && minutes > 0 ? minutes : 30) * 60_000,
  };
}

export function authorizeClickUpEvent(event: ClickUpStatusWebhookEvent, policy: ClickUpWebhookPolicy, now = new Date()): string | null {
  if (event.workspaceId !== policy.workspaceId) return "WORKSPACE_NOT_ALLOWED";
  if (!event.actorId || !policy.approverIds.has(event.actorId)) return "ACTOR_NOT_ALLOWED";
  if (!event.eventAt) return "EVENT_TIME_MISSING";
  const age = Math.abs(now.getTime() - event.eventAt.getTime());
  if (age > policy.replayWindowMs) return "REPLAY_WINDOW_EXCEEDED";
  if ((event.afterStatus ?? "").trim().toLowerCase() !== policy.approvalStatus) return "STATUS_NOT_ALLOWED";
  if ((event.beforeStatus ?? "").trim().toLowerCase() === policy.approvalStatus) return "NO_STATUS_TRANSITION";
  return null;
}
