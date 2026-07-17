/**
 * Typed error + result model for the Replit -> ClickUp PUSH layer (Fase 3).
 *
 * The low-level client returns a discriminated `ClickUpResult<T>` instead of
 * throwing, so every caller must consciously branch on success/failure and a
 * retryable error can be distinguished from a permanent one. `kind` classifies
 * the failure so routes can map it (config -> 400 operator problem, everything
 * else -> a best-effort skip/failed push record), and `retryable` is decided
 * once, here, rather than re-derived at each call site.
 */

export type ClickUpErrorKind = "config" | "network" | "timeout" | "http";

export interface ClickUpErrorInfo {
  kind: ClickUpErrorKind;
  /** Short machine code, e.g. "MISSING_TOKEN", "HTTP_429", "OAUTH_027", "TIMEOUT". */
  code: string;
  /** Human-readable, SAFE message — never contains the token or pushed content. */
  message: string;
  /** HTTP status when kind === "http". */
  status?: number;
  /** Whether a retry could plausibly succeed (429 / 5xx / network / timeout). */
  retryable: boolean;
}

export type ClickUpResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; error: ClickUpErrorInfo };

/**
 * Thrown only at boundaries that prefer exceptions over results (e.g. a route
 * pre-check). The push flows themselves consume `ClickUpResult` and never rely
 * on this being thrown.
 */
export class ClickUpPushError extends Error {
  readonly info: ClickUpErrorInfo;
  constructor(info: ClickUpErrorInfo) {
    super(info.message);
    this.name = "ClickUpPushError";
    this.info = info;
  }
}

/** True when a result failed because the operator hasn't configured the token. */
export function isConfigError(error: ClickUpErrorInfo): boolean {
  return error.kind === "config";
}
