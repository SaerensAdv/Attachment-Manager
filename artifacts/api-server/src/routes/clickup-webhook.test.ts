import { createHmac } from "node:crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enqueue: vi.fn() }));
vi.mock("../lib/clickup/webhook-store", () => ({ enqueueClickUpWebhookEvent: mocks.enqueue }));
import router from "./clickup-webhook";

const payloadText = JSON.stringify({ event: "taskUpdated", webhook_id: "wh-1", task_id: "task-1", team_id: "workspace-1",
  history_items: [{ id: "history-1", field: "status", date: String(Date.now()), user: { id: 1 }, before: { status: "review" }, after: { status: "approved" } }] });
const payload = Buffer.from(payloadText, "utf8");
const sign = (value: Buffer) => createHmac("sha256", "test-secret").update(value).digest("hex");

describe("ClickUp webhook route", () => {
  const app = express().use("/api/webhooks/clickup", express.raw({ type: "application/json" }), router);
  beforeEach(() => { process.env.CLICKUP_WEBHOOK_SECRET = "test-secret"; mocks.enqueue.mockReset(); });
  it("accepts a valid signed event and returns quickly", async () => {
    mocks.enqueue.mockResolvedValue("queued");
    // Supertest serializes Buffer values as JSON when content-type is JSON. Send
    // the exact JSON string instead, so the bytes received by express.raw are
    // identical to the bytes covered by the ClickUp-style HMAC.
    const response = await request(app).post("/api/webhooks/clickup").set("content-type", "application/json").set("x-signature", sign(payload)).send(payloadText);
    expect(response.status).toBe(202); expect(response.body).toMatchObject({ accepted: true, queued: 1, duplicates: 0 });
  });
  it("rejects a tampered body", async () => {
    const response = await request(app).post("/api/webhooks/clickup").set("content-type", "application/json").set("x-signature", sign(payload)).send(`${payloadText} `);
    expect(response.status).toBe(401); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("acknowledges a persistent duplicate without processing twice", async () => {
    mocks.enqueue.mockResolvedValue("duplicate");
    const response = await request(app).post("/api/webhooks/clickup").set("content-type", "application/json").set("x-signature", sign(payload)).send(payloadText);
    expect(response.status).toBe(202); expect(response.body).toMatchObject({ queued: 0, duplicates: 1 });
  });
});
