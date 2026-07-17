import { createHmac } from "node:crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueue = vi.fn();
vi.mock("../lib/clickup/webhook-store", () => ({ enqueueClickUpWebhookEvent: enqueue }));
import router from "./clickup-webhook";

const payload = Buffer.from(JSON.stringify({ event: "taskUpdated", webhook_id: "wh-1", task_id: "task-1", team_id: "workspace-1",
  history_items: [{ id: "history-1", field: "status", date: String(Date.now()), user: { id: 1 }, before: { status: "review" }, after: { status: "approved" } }] }));
const sign = (value: Buffer) => createHmac("sha256", "test-secret").update(value).digest("hex");

describe("ClickUp webhook route", () => {
  const app = express().use("/api/webhooks/clickup", express.raw({ type: "application/json" }), router);
  beforeEach(() => { process.env.CLICKUP_WEBHOOK_SECRET = "test-secret"; enqueue.mockReset(); });

  it("accepts a valid signed event and returns quickly", async () => {
    enqueue.mockResolvedValue("queued");
    const response = await request(app).post("/api/webhooks/clickup").set("content-type", "application/json").set("x-signature", sign(payload)).send(payload);
    expect(response.status).toBe(202); expect(response.body).toMatchObject({ accepted: true, queued: 1, duplicates: 0 });
  });

  it("rejects a tampered body", async () => {
    const response = await request(app).post("/api/webhooks/clickup").set("content-type", "application/json").set("x-signature", sign(payload)).send(Buffer.concat([payload, Buffer.from(" ")]));
    expect(response.status).toBe(401); expect(enqueue).not.toHaveBeenCalled();
  });

  it("acknowledges a persistent duplicate without processing twice", async () => {
    enqueue.mockResolvedValue("duplicate");
    const response = await request(app).post("/api/webhooks/clickup").set("content-type", "application/json").set("x-signature", sign(payload)).send(payload);
    expect(response.status).toBe(202); expect(response.body).toMatchObject({ queued: 0, duplicates: 1 });
  });
});
