import { describe, expect, it } from "vitest";
import { atlasOperationsStatusSchema, atlasSystemStatusSchema, clickUpCompaniesResponseSchema, clickUpWebhookAcceptedSchema } from "@workspace/api-zod";

const now = () => new Date().toISOString();
const provenance = { version: 2, gitSha: "abc123", builtAt: now(), docsHash: "docs-hash", counts: { agents: 2, workflows: 1 }, processStartedAt: now(), docsMode: "packaged", deploymentMode: "github-actions", manifestPresent: true, manifestHash: "manifest-hash" };
const compatibility = { frontendSha: "abc123", apiSha: "abc123", status: "match" };

describe("Atlas migration contracts", () => {
  it("accepts truthful system and operations payloads", () => {
    expect(atlasSystemStatusSchema.safeParse({ status: "degraded", process: { status: "healthy" }, provenance, compatibility, checks: [{ key: "database", status: "healthy", checkedAt: now(), latencyMs: 4 }] }).success).toBe(true);
    expect(atlasOperationsStatusSchema.safeParse({ pendingApprovals: 1, pendingProposals: 2, unresolvedAlerts: 3, pushQueue: { pending: 0, retrying: 1 }, scheduler: { status: "healthy", heartbeatAt: now(), enabledSchedules: 2, nextRunAt: null }, graph: { lastSyncedAt: null, syncing: false }, webhook: { status: "active", registered: true, configured: true, lastEventAt: null, deadLetters: 0 } }).success).toBe(true);
  });
  it("rejects invented health, incomplete provenance and negative queue counts", () => {
    expect(atlasSystemStatusSchema.safeParse({ status: "perfect", process: {}, provenance, compatibility, checks: [] }).success).toBe(false);
    expect(atlasSystemStatusSchema.safeParse({ status: "healthy", process: {}, checks: [] }).success).toBe(false);
    expect(atlasOperationsStatusSchema.safeParse({ pendingApprovals: -1 }).success).toBe(false);
  });
  it("locks Companies mirror and signed webhook acknowledgement", () => {
    const sync = { status: "succeeded", startedAt: null, finishedAt: null, companyCount: 1, cacheUpserts: 1, linkedClientUpdates: 0, missingLinkedCompanies: 0, lastErrorCode: null };
    expect(clickUpCompaniesResponseSchema.safeParse({ companies: [{ clickupTaskId: "abc1", name: "Acme", website: null, status: "active", lastSeenAt: null, syncedAt: null }], sync }).success).toBe(true);
    expect(clickUpWebhookAcceptedSchema.safeParse({ accepted: true, queued: 1, duplicates: 0, ignored: false }).success).toBe(true);
  });
});
