export interface ApiProblem {
  error: string;
  code: string;
  detail: string | null;
  retryable: boolean;
  correlationId: string | null;
}

export interface ActionResult<T = unknown> {
  ok: boolean;
  action: string;
  code: string;
  message: string;
  changed: boolean;
  verified: boolean;
  target: T | null;
  correlationId: string | null;
}

export function apiProblem(input: {
  error: string;
  code: string;
  detail?: string | null;
  retryable?: boolean;
  correlationId?: string | null;
}): ApiProblem {
  return {
    error: input.error,
    code: input.code,
    detail: input.detail ?? null,
    retryable: input.retryable ?? false,
    correlationId: input.correlationId ?? null,
  };
}

export function actionResult<T>(input: {
  action: string;
  code: string;
  message: string;
  changed: boolean;
  verified: boolean;
  target?: T | null;
  correlationId?: string | null;
}): ActionResult<T> {
  return {
    ok: true,
    action: input.action,
    code: input.code,
    message: input.message,
    changed: input.changed,
    verified: input.verified,
    target: input.target ?? null,
    correlationId: input.correlationId ?? null,
  };
}
