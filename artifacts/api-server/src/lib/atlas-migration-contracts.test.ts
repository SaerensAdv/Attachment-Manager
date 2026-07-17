import { describe, expect, it } from "vitest";
import { atlasOperationsStatusSchema, atlasSystemStatusSchema, clickUpCompaniesResponseSchema, clickUpWebhookAcceptedSchema } from "@workspace/api-zod";

describe("Atlas migration contracts", () => {
  it("accepts truthful system and operations payloads", () => {
    expect(atlasSystemStatusSchema.safeParse({ status: "degraded", process: { status: "healthy" }, checks: [{ key: "database", status: "healthy", checkedAt: new Date().toISOString(), latencyMs: 4 }] }).success).toBe(true);
    expect(atlasOperationsStatusSchema.safeParse({ pendingApprovals: 1, pendingProposals: 2, unresolvedAlerts: 3, pushQueue: { pending: 0, retrying: 1 }, scheduler: { status: "healthy", heartbeatAt: new Date().toISOString(), enabledSchedules: 2, nextRunAt: null }, graph: { lastSyncedAt: null, syncing: false }, webhook: { status: "active", registered: true, configured: true, lastEventAt: null, deadLetters: 0 } }).success).toBe(true);
  });
  it("rejects invented health and negative queue counts", () => {
    expect(atlasSystemStatusSchema.safeParse({ status: "perfect", process: {}, checks: [] }).success).toBe(false);
    expect(atlasOperationsStatusSchema.safeParse({ pendingApprovals: -1 }).success).toBe(false);
  });
  it("locks Companies mirror and signed webhook acknowledgement", () => {
    const sync = { status: "succeeded", startedAt: null, finishedAt: null, companyCount: 1, cacheUpserts: 1, linkedClientUpdates: 0, missingLinkedCompanies: 0, lastErrorCode: null };
    expect(clickUpCompaniesResponseSchema.safeParse({ companies: [{ clickupTaskId: "abc1", name: "Acme", website: null, status: "active", lastSeenAt: null, syncedAt: null }], sync }).success).toBe(true);
    expect(clickUpWebhookAcceptedSchema.safeParse({ accepted: true, queued: 1, duplicates: 0, ignored: false }).success).toBe(true);
  });
});
