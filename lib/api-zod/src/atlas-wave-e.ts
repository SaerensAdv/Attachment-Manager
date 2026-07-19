import { z } from "zod";
const nullableIso = z.string().datetime().nullable();
export const apiProblemSchema = z.object({ error: z.string(), code: z.string(), detail: z.string().nullable(), retryable: z.boolean(), correlationId: z.string().nullable() });
export const actionResultSchema = z.object({ ok: z.literal(true), action: z.string(), code: z.string(), message: z.string(), changed: z.boolean(), verified: z.boolean(), target: z.unknown().nullable(), correlationId: z.string().nullable() });
export const runtimeProvenanceSchema = z.object({ version: z.number().int(), gitSha: z.string().nullable(), builtAt: nullableIso, docsHash: z.string().nullable(), counts: z.record(z.string(), z.number().int().nonnegative()), processStartedAt: z.string().datetime(), docsMode: z.enum(["packaged", "repository", "missing"]), deploymentMode: z.enum(["replit", "github-actions", "local", "unknown"]), manifestPresent: z.boolean(), manifestHash: z.string().nullable() });
export const buildCompatibilitySchema = z.object({ frontendSha: z.string().nullable(), apiSha: z.string().nullable(), status: z.enum(["match", "mismatch", "unknown"]) });
export const atlasSystemCheckSchema = z.object({ key: z.string(), status: z.enum(["healthy", "degraded", "down", "unknown"]), checkedAt: z.string().datetime(), latencyMs: z.number().nonnegative().optional(), message: z.string().nullable().optional() }).passthrough();
export const atlasSystemStatusSchema = z.object({ status: z.enum(["healthy", "degraded", "down"]), process: z.record(z.string(), z.unknown()), provenance: runtimeProvenanceSchema, compatibility: buildCompatibilitySchema, checks: z.array(atlasSystemCheckSchema) });
export const atlasQueueSummarySchema = z.object({ retrying: z.number().int().nonnegative() }).catchall(z.unknown());
export const atlasOperationsStatusSchema = z.object({
  pendingApprovals: z.number().int().nonnegative(), pendingProposals: z.number().int().nonnegative(), unresolvedAlerts: z.number().int().nonnegative(), pushQueue: atlasQueueSummarySchema,
  scheduler: z.object({ status: z.enum(["healthy", "degraded", "unknown"]), heartbeatAt: nullableIso, enabledSchedules: z.number().int().nonnegative(), nextRunAt: nullableIso }).passthrough(),
  graph: z.object({ lastSyncedAt: nullableIso, syncing: z.boolean() }),
  webhook: z.object({ status: z.string(), registered: z.boolean(), configured: z.boolean().optional(), lastEventAt: nullableIso, deadLetters: z.number().int().nonnegative() }).passthrough(),
});
export const companySyncStatusSchema = z.object({ status: z.enum(["never", "running", "succeeded", "partial", "failed"]), startedAt: nullableIso, finishedAt: nullableIso, companyCount: z.number().int().nonnegative(), cacheUpserts: z.number().int().nonnegative(), linkedClientUpdates: z.number().int().nonnegative(), missingLinkedCompanies: z.number().int().nonnegative(), lastErrorCode: z.string().nullable() });
export const clickUpCompanyMirrorSchema = z.object({ clickupTaskId: z.string().min(1), name: z.string().min(1), website: z.string().nullable(), status: z.string().nullable(), lastSeenAt: nullableIso, syncedAt: nullableIso });
export const clickUpCompaniesResponseSchema = z.object({ companies: z.array(clickUpCompanyMirrorSchema), sync: companySyncStatusSchema });
export const clickUpWebhookAcceptedSchema = z.object({ accepted: z.literal(true), queued: z.number().int().nonnegative(), duplicates: z.number().int().nonnegative(), ignored: z.boolean() });
export type AtlasSystemStatusContract = z.infer<typeof atlasSystemStatusSchema>;
export type AtlasOperationsStatusContract = z.infer<typeof atlasOperationsStatusSchema>;
export type CompanySyncStatusContract = z.infer<typeof companySyncStatusSchema>;
