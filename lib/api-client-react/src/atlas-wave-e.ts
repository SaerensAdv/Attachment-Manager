import { customFetch } from "./custom-fetch";
export type HealthState = "healthy" | "degraded" | "down" | "unknown";
export interface SystemCheck { key: string; status: HealthState; checkedAt: string; latencyMs?: number; message?: string | null; [key: string]: unknown }
export interface AtlasSystemStatus { status: Exclude<HealthState, "unknown">; process: Record<string, unknown>; checks: SystemCheck[] }
export interface QueueSummary { available?: boolean; pending?: number; queued?: number; processing?: number; retrying: number; failed?: number; deadLetters?: number; succeeded?: number; ignored?: number; [key: string]: unknown }
export interface AtlasOperationsStatus { pendingApprovals: number; pendingProposals: number; unresolvedAlerts: number; pushQueue: QueueSummary; scheduler: { status: "healthy" | "degraded" | "unknown"; heartbeatAt: string | null; enabledSchedules: number; nextRunAt: string | null; [key: string]: unknown }; graph: { lastSyncedAt: string | null; syncing: boolean }; webhook: { status: string; registered: boolean; configured?: boolean; lastEventAt: string | null; deadLetters: number; [key: string]: unknown } }
export type CompanySyncState = "never" | "running" | "succeeded" | "partial" | "failed";
export interface CompanySyncStatus { status: CompanySyncState; startedAt: string | null; finishedAt: string | null; companyCount: number; cacheUpserts: number; linkedClientUpdates: number; missingLinkedCompanies: number; lastErrorCode: string | null }
export interface ClickUpCompanyMirror { clickupTaskId: string; name: string; website: string | null; status: string | null; lastSeenAt: string | null; syncedAt: string | null }
export interface ClickUpCompaniesResponse { companies: ClickUpCompanyMirror[]; sync: CompanySyncStatus }
export interface ClickUpPushRecord { id: number; kind: string; idempotencyKey: string; sourceRunId: string | null; clickupObjectId: string | null; clickupUrl: string | null; status: string; attempts: number; lastErrorCode: string | null; correlationId: string | null; createdAt: string; updatedAt: string; nextAttemptAt: string | null; terminalAt: string | null }
export interface ClickUpPushList { records: ClickUpPushRecord[] }
export const ATLAS_APPROVAL_COPY = { action: "Approve and create Gmail draft", success: "Gmail draft created", pending: "Awaiting approval" } as const;
export const getAtlasSystemStatus = (signal?: AbortSignal) => customFetch<AtlasSystemStatus>("/api/system/status", { method: "GET", responseType: "json", signal });
export const getAtlasOperationsStatus = (signal?: AbortSignal) => customFetch<AtlasOperationsStatus>("/api/operations/status", { method: "GET", responseType: "json", signal });
export const getAtlasCompanies = (signal?: AbortSignal) => customFetch<ClickUpCompaniesResponse>("/api/clickup/companies", { method: "GET", responseType: "json", signal });
export const getAtlasCompanySyncStatus = (signal?: AbortSignal) => customFetch<CompanySyncStatus>("/api/clickup/companies/sync-status", { method: "GET", responseType: "json", signal });
export const syncAtlasCompanies = (signal?: AbortSignal) => customFetch<CompanySyncStatus>("/api/clickup/companies/sync", { method: "POST", responseType: "json", signal });
export const getAtlasClickUpPushes = (query: { status?: string; kind?: string; sourceRunId?: string; limit?: number } = {}, signal?: AbortSignal) => { const params = new URLSearchParams(); Object.entries(query).forEach(([key, value]) => { if (value !== undefined) params.set(key, String(value)); }); const suffix = params.size ? `?${params.toString()}` : ""; return customFetch<ClickUpPushList>(`/api/clickup/pushes${suffix}`, { method: "GET", responseType: "json", signal }); };
export const requeueAtlasClickUpPush = (id: number, signal?: AbortSignal) => customFetch<ClickUpPushRecord>(`/api/clickup/pushes/${id}/requeue`, { method: "POST", responseType: "json", signal });
export const requeueAtlasWebhookDeadLetter = (id: number, signal?: AbortSignal) => customFetch<{ status: "queued" }>(`/api/clickup/webhooks/${id}/requeue`, { method: "POST", responseType: "json", signal });
