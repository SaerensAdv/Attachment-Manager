import { clickUpRequest, clickUpUploadAttachment } from "./client";
import type { ClickUpResult } from "./errors";
import type {
  ClickUpFieldDef,
  ClickUpListDetail,
  ClickUpStatusDef,
  ClickUpTaskRef,
} from "./types";

/**
 * Task/list operations for the push layer, built on the request core. Split into
 * two groups:
 *  - live-location reads (`getListDetail`, `getListFields`) so a flow can inspect
 *    the ACTUAL statuses/custom fields of a target list at push time;
 *  - pure resolvers (`resolveStatus`, `resolveField`, `resolveDropdownOptionId`)
 *    that map a semantic intent ("the Draft-ish status", "the Record type field",
 *    "the Report option") onto whatever that specific list actually offers.
 *
 * This is the mechanism behind "never hardcode a status/field id": ids differ
 * per list, and only some client locations are fully modelled, so everything is
 * resolved from live metadata and a missing piece becomes a skip-with-reason
 * upstream rather than a wrong write.
 */

// ---- Live-location reads ---------------------------------------------------

/** GET /list/{id} — includes the statuses defined on the list. */
export function getListDetail(
  listId: string,
  correlationId: string,
): Promise<ClickUpResult<ClickUpListDetail>> {
  return clickUpRequest<ClickUpListDetail>(`/list/${listId}`, { correlationId });
}

/** GET /list/{id}/field — the custom fields (with dropdown options) on the list. */
export async function getListFields(
  listId: string,
  correlationId: string,
): Promise<ClickUpResult<ClickUpFieldDef[]>> {
  const res = await clickUpRequest<{ fields?: ClickUpFieldDef[] }>(
    `/list/${listId}/field`,
    { correlationId },
  );
  if (!res.ok) return res;
  return {
    ok: true,
    status: res.status,
    data: Array.isArray(res.data.fields) ? res.data.fields : [],
  };
}

/** GET /task/{id} — used to read a linked Company task (name + custom fields). */
export function getTask(
  taskId: string,
  correlationId: string,
): Promise<ClickUpResult<ClickUpTaskRef>> {
  return clickUpRequest<ClickUpTaskRef>(`/task/${taskId}`, {
    correlationId,
    query: { include_subtasks: false },
  });
}

// ---- Pure resolvers --------------------------------------------------------

/** Find a custom field by (case-insensitive) name, or null. */
export function resolveField(
  fields: ClickUpFieldDef[],
  name: string,
): ClickUpFieldDef | null {
  const target = name.trim().toLowerCase();
  return (
    fields.find((f) => (f.name ?? "").trim().toLowerCase() === target) ?? null
  );
}

/** Find a dropdown option id by (case-insensitive) name/label, or null. */
export function resolveDropdownOptionId(
  field: ClickUpFieldDef | null,
  optionName: string,
): string | null {
  if (!field) return null;
  const target = optionName.trim().toLowerCase();
  for (const o of field.type_config?.options ?? []) {
    const label = (o.name ?? o.label ?? "").trim().toLowerCase();
    if (label === target) return o.id;
  }
  return null;
}

/**
 * Map a list of semantic status intents onto a status that actually exists on a
 * list. Tries each preferred name in order (exact, then substring), and falls
 * back to the first "open" status (else the first status) so a create never
 * fails for want of an exact label. Returns null only for an empty list.
 */
export function resolveStatus(
  statuses: ClickUpStatusDef[],
  preferred: string[],
): string | null {
  const norm = (s: string) => s.trim().toLowerCase();
  for (const want of preferred) {
    const w = norm(want);
    const exact = statuses.find((s) => norm(s.status ?? "") === w);
    if (exact) return exact.status;
    const partial = statuses.find((s) => norm(s.status ?? "").includes(w));
    if (partial) return partial.status;
  }
  const open = statuses.find((s) => s.type === "open") ?? statuses[0];
  return open?.status ?? null;
}

// ---- Writes ----------------------------------------------------------------

export interface CreateTaskInput {
  name: string;
  /** Markdown body; sent as ClickUp `markdown_content`. */
  markdown?: string;
  status?: string;
  /** Inline custom field values ({id, value}); dropdowns take the option id. */
  customFields?: { id: string; value: unknown }[];
}

/** POST /list/{id}/task — create a task (with optional status + custom fields). */
export function createTask(
  listId: string,
  input: CreateTaskInput,
  correlationId: string,
): Promise<ClickUpResult<ClickUpTaskRef>> {
  const body: Record<string, unknown> = { name: input.name };
  if (input.markdown !== undefined) body.markdown_content = input.markdown;
  if (input.status) body.status = input.status;
  if (input.customFields?.length) {
    body.custom_fields = input.customFields.map((f) => ({
      id: f.id,
      value: f.value,
    }));
  }
  return clickUpRequest<ClickUpTaskRef>(`/list/${listId}/task`, {
    correlationId,
    method: "POST",
    body,
  });
}

/** POST /task/{id}/field/{fieldId} — set one custom field after create. */
export function setCustomField(
  taskId: string,
  fieldId: string,
  value: unknown,
  correlationId: string,
): Promise<ClickUpResult<unknown>> {
  return clickUpRequest(`/task/${taskId}/field/${fieldId}`, {
    correlationId,
    method: "POST",
    body: { value },
  });
}

/** POST /task/{id}/comment — add a comment (used by the alert flow). */
export function addComment(
  taskId: string,
  text: string,
  correlationId: string,
): Promise<ClickUpResult<{ id?: string }>> {
  return clickUpRequest<{ id?: string }>(`/task/${taskId}/comment`, {
    correlationId,
    method: "POST",
    body: { comment_text: text },
  });
}

/** POST /task/{id}/attachment — upload a file (e.g. the report PDF, the CSV). */
export function addAttachment(
  taskId: string,
  file: { filename: string; content: Uint8Array; contentType: string },
  correlationId: string,
): Promise<ClickUpResult<{ id?: string; url?: string }>> {
  return clickUpUploadAttachment<{ id?: string; url?: string }>(taskId, file, {
    correlationId,
  });
}
