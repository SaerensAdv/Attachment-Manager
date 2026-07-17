/**
 * Normalized shapes for the bits of the ClickUp v2 API the push layer reads and
 * writes. Only the fields we actually use are typed; everything else on the raw
 * responses is ignored. Kept separate from the client so the flows can import
 * types without pulling in fetch/retry logic.
 */

/** A status defined on a list, as returned by GET /list/{id}. */
export interface ClickUpStatusDef {
  status: string;
  /** "open" | "custom" | "closed" | "done" — used to pick a sensible default. */
  type?: string;
  orderindex?: number;
}

/** A dropdown option of a custom field (its id differs PER LIST). */
export interface ClickUpFieldOption {
  id: string;
  name?: string;
  label?: string;
  orderindex?: number;
}

/** A custom field definition, as returned by GET /list/{id}/field. */
export interface ClickUpFieldDef {
  id: string;
  name: string;
  type: string;
  type_config?: {
    options?: ClickUpFieldOption[];
  };
}

/** GET /list/{id} — the list itself plus the statuses available on it. */
export interface ClickUpListDetail {
  id: string;
  name: string;
  statuses?: ClickUpStatusDef[];
}

/** GET /folder/{id} / GET /space/{id}/folder — a folder and its lists. */
export interface ClickUpFolder {
  id: string;
  name: string;
  lists?: { id: string; name: string }[];
}

/** A task as returned by create/read; only what the push layer needs. */
export interface ClickUpTaskRef {
  id: string;
  url?: string;
  name?: string;
  custom_fields?: {
    id?: string;
    name?: string;
    type?: string;
    value?: unknown;
  }[];
}

/**
 * The normalized outcome of one push flow. Every flow returns this so a route,
 * a scheduler, or a test can branch uniformly:
 * - pushed:    a ClickUp object was created (or resumed) this run.
 * - duplicate: an earlier run already pushed this; nothing was created.
 * - skipped:   nothing was pushed BY DESIGN (e.g. location not configured, or a
 *              dry-run) — carries a human-readable Dutch reason.
 * - failed:    something went wrong; carries a safe code + message.
 */
export type PushOutcome =
  | {
      status: "pushed";
      idempotencyKey: string;
      objectId: string;
      url: string | null;
    }
  | {
      status: "duplicate";
      idempotencyKey: string;
      objectId: string | null;
      url: string | null;
    }
  | {
      status: "skipped";
      reason: string;
      idempotencyKey?: string;
      /** True when skipped specifically because dry-run was requested. */
      dryRun?: boolean;
      /** For dry-run: a safe preview of what WOULD have been pushed. */
      preview?: Record<string, unknown>;
    }
  | {
      status: "failed";
      code: string;
      message: string;
      idempotencyKey?: string;
    };
