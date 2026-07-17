import { z } from "zod";

const nullableIso = z.string().datetime().nullable();
export const atlasSystemCheckSchema = z.object({ key: z.string(), status: z.enum(["healthy", "degraded", "down", "unknown"]), checkedAt: z.string().datetime(), latencyMs: z.number().nonnegative().optional(), message: z.string().nullable().optional() }).passthrough();
export const atlasSystemStatusSchema = z.object({ status: z.enum(["healthy", "degraded", "down"]), process: z.record(z.string(), z.unknown()), checks: z.array(atlasSystemCheckSchema) });
export const atlasQueueSummarySchema = z.object({ retrying: z.number().int().nonnegative() }).catchall(z.unknown());
export const atlasOperationsStatusSchema = z.object({
  pendingApprovals: z.number().int().nonnegative(), pendingProposals: z.number().int().nonnegative(), unresolvedAlerts: z.number().int().nonnegative(),
  pushQueue: atlasQueueSummarySchema,
  scheduler: z.object({ heartbeatAt: nullableIso, healthy: z.boolean(), enabledSchedules: z.number().int().nonnegative(), nextRunAt: nullableIso }).passthrough(),
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
