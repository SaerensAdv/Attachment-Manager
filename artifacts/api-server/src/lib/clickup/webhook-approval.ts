import { getTask } from "./tasks";
import type { ClickUpWebhookPolicy } from "./webhook-security";
import { claimGenerationApprovalForSend, revertGenerationApprovalToPending, setGenerationApproval, appendGenerationStep } from "../generations-store";
import { draftMonthlyReport, parseReportDeliveryPayload } from "../monthly-report-email";
import { draftEmailReply, parseEmailReplyPayload, pendingDeliveryKind } from "../email-reply";
import { draftSeoReport, parseSeoReportDeliveryPayload } from "../seo-report-email";

export class WebhookProcessingError extends Error {
  constructor(message: string, public readonly retryable: boolean) { super(message); }
}

function generationIdFromTask(task: { custom_fields?: { name?: string; value?: unknown }[] }, fieldName: string): number | null {
  const field = task.custom_fields?.find((item) => (item.name ?? "").trim().toLowerCase() === fieldName.toLowerCase());
  const value = field?.value;
  const raw = typeof value === "number" || typeof value === "string" ? String(value) : "";
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function resolveAuthorizedGeneration(taskId: string, policy: ClickUpWebhookPolicy, correlationId: string): Promise<number> {
  const result = await getTask(taskId, correlationId);
  if (!result.ok) throw new WebhookProcessingError(`TASK_LOOKUP_${result.error.code}`, result.error.retryable);
  const listId = result.data.list?.id ? String(result.data.list.id) : null;
  if (!listId || !policy.locationIds.has(listId)) throw new WebhookProcessingError("LOCATION_NOT_ALLOWED", false);
  const generationId = generationIdFromTask(result.data, policy.generationFieldName);
  if (!generationId) throw new WebhookProcessingError("GENERATION_LINK_MISSING", false);
  return generationId;
}

export async function createApprovedGmailDraft(generationId: number): Promise<void> {
  const row = await claimGenerationApprovalForSend(generationId);
  if (!row?.pendingDelivery) throw new WebhookProcessingError("GENERATION_NOT_PENDING", false);
  let raw: unknown;
  try { raw = JSON.parse(row.pendingDelivery); } catch { raw = null; }
  const kind = pendingDeliveryKind(raw);
  const report = kind === "monthly-report" ? parseReportDeliveryPayload(raw) : null;
  const reply = kind === "email-reply" ? parseEmailReplyPayload(raw) : null;
  const seoReport = kind === "seo-report" ? parseSeoReportDeliveryPayload(raw) : null;
  if (!report && !reply && !seoReport) {
    await revertGenerationApprovalToPending(generationId);
    throw new WebhookProcessingError("PENDING_DELIVERY_UNREADABLE", false);
  }
  try {
    if (reply) await draftEmailReply(reply);
    else if (seoReport) await draftSeoReport(seoReport);
    else if (report) await draftMonthlyReport(report);
  } catch (error) {
    await revertGenerationApprovalToPending(generationId).catch(() => undefined);
    throw new WebhookProcessingError(`GMAIL_DRAFT_FAILED:${error instanceof Error ? error.message : String(error)}`, true);
  }
  await setGenerationApproval(generationId, { status: "approved", clearPending: true });
  await appendGenerationStep(generationId, {
    agentPath: row.workflowPath, agentTitle: "ClickUp-goedkeuring, concept klaargezet in Gmail",
    role: "deliverable", status: "completed", durationMs: null, inputTokens: null,
    outputTokens: null, charCount: null, errorMessage: null, handoffBrief: null,
  });
}
