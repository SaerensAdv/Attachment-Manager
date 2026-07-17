import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { authorizeClickUpEvent, parseClickUpStatusEvents, verifyClickUpSignature, type ClickUpWebhookPolicy } from "./webhook-security";

const now = new Date("2026-07-17T20:00:00.000Z");
const body = (overrides: Record<string, unknown> = {}) => Buffer.from(JSON.stringify({
  event: "taskUpdated", webhook_id: "wh-1", task_id: "task-1", team_id: "workspace-1",
  history_items: [{ id: "history-1", field: "status", date: String(now.getTime()), user: { id: 176458280 }, before: { status: "review" }, after: { status: "approved" } }],
  ...overrides,
}));
const policy: ClickUpWebhookPolicy = {
  workspaceId: "workspace-1", approverIds: new Set(["176458280"]), locationIds: new Set(["list-1"]),
  approvalStatus: "approved", generationFieldName: "Atlas Generation ID", replayWindowMs: 30 * 60_000,
};

describe("ClickUp webhook security", () => {
  it("verifies the exact raw body with constant-shape HMAC", () => {
    const raw = body(); const signature = createHmac("sha256", "secret").update(raw).digest("hex");
    expect(verifyClickUpSignature(raw, signature, "secret")).toBe(true);
    expect(verifyClickUpSignature(Buffer.concat([raw, Buffer.from(" ")]), signature, "secret")).toBe(false);
    expect(verifyClickUpSignature(raw, "bad", "secret")).toBe(false);
  });

  it("creates a stable history-based idempotency key", () => {
    const [event] = parseClickUpStatusEvents(body());
    expect(event.idempotencyKey).toBe("wh-1:history-1");
    expect(event.taskId).toBe("task-1");
    expect(event.afterStatus).toBe("approved");
  });

  it("ignores non-allowlisted event types and non-status histories", () => {
    expect(parseClickUpStatusEvents(body({ event: "taskCommentPosted" }))).toEqual([]);
    expect(parseClickUpStatusEvents(body({ history_items: [{ id: "x", field: "priority" }] }))).toEqual([]);
  });

  it("allows only the configured workspace, actor, transition and replay window", () => {
    const [event] = parseClickUpStatusEvents(body());
    expect(authorizeClickUpEvent(event, policy, now)).toBeNull();
    expect(authorizeClickUpEvent({ ...event, workspaceId: "other" }, policy, now)).toBe("WORKSPACE_NOT_ALLOWED");
    expect(authorizeClickUpEvent({ ...event, actorId: "999" }, policy, now)).toBe("ACTOR_NOT_ALLOWED");
    expect(authorizeClickUpEvent({ ...event, afterStatus: "done" }, policy, now)).toBe("STATUS_NOT_ALLOWED");
    expect(authorizeClickUpEvent({ ...event, beforeStatus: "approved" }, policy, now)).toBe("NO_STATUS_TRANSITION");
    expect(authorizeClickUpEvent({ ...event, eventAt: new Date(now.getTime() - 31 * 60_000) }, policy, now)).toBe("REPLAY_WINDOW_EXCEEDED");
  });
});
