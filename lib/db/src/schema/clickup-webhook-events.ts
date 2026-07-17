import { bigint, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const clickupWebhookEventsTable = pgTable(
  "clickup_webhook_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    idempotencyKey: text("idempotency_key").notNull(),
    webhookId: text("webhook_id"),
    historyId: text("history_id"),
    eventType: text("event_type").notNull(),
    taskId: text("task_id").notNull(),
    workspaceId: text("workspace_id"),
    actorId: text("actor_id"),
    eventAt: timestamp("event_at", { withTimezone: true }),
    payload: jsonb("payload").notNull(),
    payloadHash: text("payload_hash").notNull(),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    lastError: text("last_error"),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    terminalAt: timestamp("terminal_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("clickup_webhook_events_idempotency_key_uq").on(table.idempotencyKey)],
);

export type ClickUpWebhookEvent = typeof clickupWebhookEventsTable.$inferSelect;
