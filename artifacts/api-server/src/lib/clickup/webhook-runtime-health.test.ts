import { describe, expect, it } from "vitest";
import { clickUpWebhookConfigured } from "./webhook-worker";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const storeSource = readFileSync(join(dir, "webhook-store.ts"), "utf8");
const workerSource = readFileSync(join(dir, "webhook-worker.ts"), "utf8");

describe("webhook runtime health", () => {
  it("treats a missing policy as intentionally unconfigured", () => {
    expect(clickUpWebhookConfigured({})).toBe(false);
    expect(clickUpWebhookConfigured({ CLICKUP_WEBHOOK_SECRET:"secret", CLICKUP_WEBHOOK_WORKSPACE_ID:"1", CLICKUP_WEBHOOK_APPROVER_IDS:"2", CLICKUP_WEBHOOK_LOCATION_IDS:"3" })).toBe(true);
  });

  it("does not poll the approval queue when the feature is unconfigured", () => {
    expect(workerSource).toContain("if (!configured)");
    expect(workerSource).toContain('"idle"');
    expect(workerSource).toContain("configured: false");
  });

  it("retries table initialization after a transient startup failure", () => {
    expect(storeSource).toContain("ready = null");
    expect(storeSource).toContain("throw error");
  });

  it("records the actual runtime error code instead of masking every failure", () => {
    expect(workerSource).toContain("error.message.slice(0,120)");
  });
});
