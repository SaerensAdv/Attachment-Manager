import { pool } from "@workspace/db";
import type { ClickUpStatusWebhookEvent } from "./webhook-security";

let ready: Promise<void> | null = null;
export function ensureClickUpWebhookTable(): Promise<void> {
  ready ??= pool.query(`
    CREATE TABLE IF NOT EXISTS clickup_webhook_events (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      idempotency_key text NOT NULL UNIQUE,
      webhook_id text,
      history_id text,
      event_type text NOT NULL,
      task_id text NOT NULL,
      workspace_id text,
      actor_id text,
      event_at timestamptz,
      payload jsonb NOT NULL,
      payload_hash text NOT NULL,
      status text NOT NULL DEFAULT 'queued',
      attempts integer NOT NULL DEFAULT 0,
      next_attempt_at timestamptz NOT NULL DEFAULT now(),
      last_error text,
      received_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      terminal_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS clickup_webhook_events_queue_idx
      ON clickup_webhook_events (status, next_attempt_at);
  `).then(() => undefined);
  return ready;
}

export async function enqueueClickUpWebhookEvent(event: ClickUpStatusWebhookEvent): Promise<"queued" | "duplicate"> {
  await ensureClickUpWebhookTable();
  const result = await pool.query(
    `INSERT INTO clickup_webhook_events
      (idempotency_key, webhook_id, history_id, event_type, task_id, workspace_id, actor_id, event_at, payload, payload_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
     ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
    [event.idempotencyKey, event.webhookId, event.historyId, event.eventType, event.taskId, event.workspaceId, event.actorId, event.eventAt, JSON.stringify(event.payload), event.payloadHash],
  );
  return result.rowCount ? "queued" : "duplicate";
}

export interface ClaimedWebhookEvent {
  id: number;
  idempotencyKey: string;
  eventType: string;
  taskId: string;
  workspaceId: string | null;
  actorId: string | null;
  eventAt: Date | null;
  attempts: number;
  payload: Record<string, unknown>;
  payloadHash: string;
}

export async function claimNextClickUpWebhookEvent(): Promise<ClaimedWebhookEvent | null> {
  await ensureClickUpWebhookTable();
  const result = await pool.query(`
    UPDATE clickup_webhook_events SET status='processing', attempts=attempts+1, updated_at=now()
    WHERE id = (
      SELECT id FROM clickup_webhook_events
      WHERE status IN ('queued','retrying') AND next_attempt_at <= now()
      ORDER BY received_at ASC FOR UPDATE SKIP LOCKED LIMIT 1
    )
    RETURNING id, idempotency_key, event_type, task_id, workspace_id, actor_id, event_at, attempts, payload, payload_hash
  `);
  const row = result.rows[0];
  return row ? {
    id: Number(row.id), idempotencyKey: row.idempotency_key, eventType: row.event_type,
    taskId: row.task_id, workspaceId: row.workspace_id, actorId: row.actor_id,
    eventAt: row.event_at ? new Date(row.event_at) : null, attempts: row.attempts,
    payload: row.payload, payloadHash: row.payload_hash,
  } : null;
}

export async function finishClickUpWebhookEvent(id: number, status: "succeeded" | "ignored", note: string | null = null): Promise<void> {
  await pool.query(`UPDATE clickup_webhook_events SET status=$2, last_error=$3, terminal_at=now(), updated_at=now() WHERE id=$1`, [id, status, note]);
}

export async function failClickUpWebhookEvent(id: number, attempts: number, message: string, retryable: boolean): Promise<"retrying" | "dead_letter"> {
  const dead = !retryable || attempts >= 5;
  const delaySeconds = Math.min(300, 2 ** Math.max(0, attempts - 1) * 5);
  await pool.query(
    `UPDATE clickup_webhook_events SET status=$2, last_error=$3,
      next_attempt_at=CASE WHEN $2='retrying' THEN now()+($4 * interval '1 second') ELSE next_attempt_at END,
      terminal_at=CASE WHEN $2='dead_letter' THEN now() ELSE NULL END, updated_at=now() WHERE id=$1`,
    [id, dead ? "dead_letter" : "retrying", message.slice(0, 500), delaySeconds],
  );
  return dead ? "dead_letter" : "retrying";
}

export async function clickUpWebhookSummary(): Promise<{ queued: number; processing: number; retrying: number; deadLetters: number; succeeded: number; ignored: number; lastEventAt: string | null }> {
  await ensureClickUpWebhookTable();
  const result = await pool.query(`SELECT
    count(*) FILTER (WHERE status='queued')::int queued,
    count(*) FILTER (WHERE status='processing')::int processing,
    count(*) FILTER (WHERE status='retrying')::int retrying,
    count(*) FILTER (WHERE status='dead_letter')::int dead_letters,
    count(*) FILTER (WHERE status='succeeded')::int succeeded,
    count(*) FILTER (WHERE status='ignored')::int ignored,
    max(received_at) last_event_at FROM clickup_webhook_events`);
  const row = result.rows[0];
  return { queued: row.queued, processing: row.processing, retrying: row.retrying, deadLetters: row.dead_letters, succeeded: row.succeeded, ignored: row.ignored, lastEventAt: row.last_event_at ? new Date(row.last_event_at).toISOString() : null };
}

export async function requeueClickUpWebhookDeadLetter(id: number): Promise<boolean> {
  await ensureClickUpWebhookTable();
  const result = await pool.query(`UPDATE clickup_webhook_events SET status='queued', attempts=0, next_attempt_at=now(), last_error=NULL, terminal_at=NULL, updated_at=now() WHERE id=$1 AND status='dead_letter' RETURNING id`, [id]);
  return Boolean(result.rowCount);
}
