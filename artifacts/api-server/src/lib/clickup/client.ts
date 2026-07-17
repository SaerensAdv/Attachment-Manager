import { logger } from "../logger";
import type { ClickUpErrorInfo, ClickUpResult } from "./errors";

/**
 * Low-level request core for the Replit -> ClickUp PUSH layer.
 *
 * Deliberately separate from the read-only `../clickup.ts` seam (that provider
 * has its own error contract + tests and must stay untouched). The ~30 lines of
 * duplicated token-read is the right price for not coupling a write client to a
 * preserved read client.
 *
 * Guarantees:
 * - Per-request timeout via `AbortSignal.timeout` (no hung push blocks a run).
 * - Bounded retries on 429 / 5xx / network / timeout only. The 429 wait is
 *   DRIVEN BY the response (`Retry-After` / `X-RateLimit-Reset`), never a fixed
 *   arbitrary sleep; other retryables use capped exponential backoff + jitter.
 * - A correlation id threads every log line of a single push for tracing.
 * - Structured logs carry method/path/status/attempt ONLY — never the token,
 *   the request body, or any pushed content.
 * - Returns a typed `ClickUpResult<T>` so callers must branch on failure.
 */

const API_BASE = "https://api.clickup.com/api/v2";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 8_000;
const MAX_RETRY_DELAY_MS = 30_000;

/** Read the personal `pk_` token, or return a typed config error. */
export function readPushToken(): { token: string } | { error: ClickUpErrorInfo } {
  const token = (process.env.CLICKUP_API_TOKEN ?? "").trim();
  if (!token) {
    return {
      error: {
        kind: "config",
        code: "MISSING_TOKEN",
        message:
          "CLICKUP_API_TOKEN ontbreekt. Voeg het ClickUp API-token toe om te pushen.",
        retryable: false,
      },
    };
  }
  return { token };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Capped exponential backoff with jitter, for retryables without a header hint. */
function backoffMs(attempt: number): number {
  const exp = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt);
  return Math.round(exp + Math.random() * 0.25 * exp);
}

/** Wait derived from the rate-limit response headers, capped; null if absent. */
function retryAfterMs(res: Response): number | null {
  const ra = res.headers.get("retry-after");
  if (ra) {
    const secs = Number(ra);
    if (Number.isFinite(secs) && secs >= 0) {
      return Math.min(secs * 1000, MAX_RETRY_DELAY_MS);
    }
  }
  const reset = res.headers.get("x-ratelimit-reset");
  if (reset) {
    const epoch = Number(reset);
    if (Number.isFinite(epoch)) {
      const delta = epoch * 1000 - Date.now();
      if (delta > 0) return Math.min(delta, MAX_RETRY_DELAY_MS);
    }
  }
  return null;
}

async function readErrorBody(
  res: Response,
): Promise<{ code?: string; err?: string }> {
  try {
    const b = (await res.json()) as Record<string, unknown>;
    return {
      code: typeof b.ECODE === "string" ? b.ECODE : undefined,
      err: typeof b.err === "string" ? b.err : undefined,
    };
  } catch {
    return {};
  }
}

export interface ClickUpRequestOptions {
  correlationId: string;
  method?: string;
  /** JSON body; omit for GET. */
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Override the API base (e.g. the v3 base for Docs). Defaults to the v2 base. */
  apiBase?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

function buildUrl(
  path: string,
  query?: ClickUpRequestOptions["query"],
  apiBase: string = API_BASE,
): string {
  const url = new URL(`${apiBase}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

/**
 * Execute a request with the shared retry/backoff/timeout policy. `initFactory`
 * produces a FRESH `RequestInit` each attempt so a consumed body (e.g. a
 * multipart stream) can be safely re-sent on retry.
 */
async function sendWithRetry<T>(
  url: string,
  displayPath: string,
  initFactory: () => RequestInit,
  opts: { method: string; correlationId: string; timeoutMs: number; maxRetries: number },
): Promise<ClickUpResult<T>> {
  const { method, correlationId, timeoutMs, maxRetries } = opts;
  let lastError: ClickUpErrorInfo | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        ...initFactory(),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const isTimeout =
        err instanceof Error &&
        (err.name === "TimeoutError" || err.name === "AbortError");
      lastError = {
        kind: isTimeout ? "timeout" : "network",
        code: isTimeout ? "TIMEOUT" : "NETWORK",
        message: isTimeout
          ? "ClickUp reageerde niet binnen de timeout."
          : "Kon ClickUp niet bereiken.",
        retryable: true,
      };
      if (attempt < maxRetries) {
        const delay = backoffMs(attempt);
        logger.warn(
          { scope: "clickup:push", correlationId, method, path: displayPath, attempt, delayMs: delay, code: lastError.code },
          "ClickUp-request faalde, opnieuw proberen",
        );
        await sleep(delay);
        continue;
      }
      break;
    }

    if (res.ok) {
      let data: T;
      try {
        data = (await res.json()) as T;
      } catch {
        data = undefined as unknown as T;
      }
      return { ok: true, status: res.status, data };
    }

    const status = res.status;
    const retryable = status === 429 || status >= 500;
    const { code, err } = await readErrorBody(res);
    lastError = {
      kind: "http",
      status,
      code: code ?? `HTTP_${status}`,
      message: err ? `ClickUp-fout: ${err}` : `ClickUp-fout: HTTP ${status}`,
      retryable,
    };

    if (retryable && attempt < maxRetries) {
      const delay = (status === 429 ? retryAfterMs(res) : null) ?? backoffMs(attempt);
      logger.warn(
        { scope: "clickup:push", correlationId, method, path: displayPath, attempt, status, delayMs: delay, code: lastError.code },
        "ClickUp-request throttled/faalde, opnieuw proberen",
      );
      await sleep(delay);
      continue;
    }

    logger.warn(
      { scope: "clickup:push", correlationId, method, path: displayPath, status, code: lastError.code },
      "ClickUp-request definitief gefaald",
    );
    return { ok: false, error: lastError };
  }

  return {
    ok: false,
    error:
      lastError ?? {
        kind: "network",
        code: "UNKNOWN",
        message: "Onbekende ClickUp-fout.",
        retryable: true,
      },
  };
}

/** A JSON request (GET/POST/PUT). Reads the token; returns a typed result. */
export async function clickUpRequest<T = unknown>(
  path: string,
  opts: ClickUpRequestOptions,
): Promise<ClickUpResult<T>> {
  const auth = readPushToken();
  if ("error" in auth) return { ok: false, error: auth.error };

  const method = (opts.method ?? (opts.body ? "POST" : "GET")).toUpperCase();
  const url = buildUrl(path, opts.query, opts.apiBase);
  const bodyJson = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;

  return sendWithRetry<T>(
    url,
    path,
    () => ({
      method,
      headers: {
        Authorization: auth.token,
        "Content-Type": "application/json",
      },
      body: bodyJson,
    }),
    {
      method,
      correlationId: opts.correlationId,
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxRetries: opts.maxRetries ?? DEFAULT_MAX_RETRIES,
    },
  );
}

/**
 * Upload a file attachment to a task (POST /task/{id}/attachment). Uses
 * multipart/form-data; the Content-Type (with boundary) is set by fetch from the
 * FormData, so it must NOT be set manually.
 */
export async function clickUpUploadAttachment<T = unknown>(
  taskId: string,
  file: { filename: string; content: Uint8Array; contentType: string },
  opts: { correlationId: string; timeoutMs?: number; maxRetries?: number },
): Promise<ClickUpResult<T>> {
  const auth = readPushToken();
  if ("error" in auth) return { ok: false, error: auth.error };

  const path = `/task/${taskId}/attachment`;
  const url = buildUrl(path);

  return sendWithRetry<T>(
    url,
    path,
    () => {
      const bytes = new Uint8Array(file.content.byteLength);
      bytes.set(file.content);
      const form = new FormData();
      form.append(
        "attachment",
        new Blob([bytes], { type: file.contentType }),
        file.filename,
      );
      return { method: "POST", headers: { Authorization: auth.token }, body: form };
    },
    {
      method: "POST",
      correlationId: opts.correlationId,
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxRetries: opts.maxRetries ?? DEFAULT_MAX_RETRIES,
    },
  );
}
