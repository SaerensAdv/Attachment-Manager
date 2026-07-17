/** Normalized shapes for the ClickUp v2 API used by the integration layer. */
export interface ClickUpStatusDef { status: string; type?: string; orderindex?: number; }
export interface ClickUpFieldOption { id: string; name?: string; label?: string; orderindex?: number; }
export interface ClickUpFieldDef { id: string; name: string; type: string; type_config?: { options?: ClickUpFieldOption[] }; }
export interface ClickUpListDetail { id: string; name: string; statuses?: ClickUpStatusDef[]; }
export interface ClickUpFolder { id: string; name: string; lists?: { id: string; name: string }[]; }
export interface ClickUpTaskRef {
  id: string; url?: string; name?: string; list?: { id?: string; name?: string };
  custom_fields?: { id?: string; name?: string; type?: string; value?: unknown }[];
}
export type PushOutcome =
  | { status: "pushed"; idempotencyKey: string; objectId: string; url: string | null }
  | { status: "duplicate"; idempotencyKey: string; objectId: string | null; url: string | null }
  | { status: "skipped"; reason: string; idempotencyKey?: string; dryRun?: boolean; preview?: Record<string, unknown> }
  | { status: "failed"; code: string; message: string; idempotencyKey?: string };
