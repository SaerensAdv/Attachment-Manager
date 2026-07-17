import { randomUUID } from "node:crypto";

const startedAt = new Date();
let schedulerStartedAt: Date | null = null;
let schedulerHeartbeatAt: Date | null = null;
let schedulerTickStartedAt: Date | null = null;
let schedulerTickFinishedAt: Date | null = null;
let schedulerLastErrorAt: Date | null = null;
let schedulerLastErrorCode: string | null = null;
let schedulerRunning = false;

export function newCorrelationId(scope: string): string {
  return `${scope}:${randomUUID()}`;
}

export function markSchedulerStarted(at = new Date()): void {
  schedulerStartedAt = at;
  schedulerHeartbeatAt = at;
}

export function markSchedulerTickStarted(at = new Date()): void {
  schedulerHeartbeatAt = at;
  schedulerTickStartedAt = at;
  schedulerRunning = true;
}

export function markSchedulerTickFinished(at = new Date()): void {
  schedulerHeartbeatAt = at;
  schedulerTickFinishedAt = at;
  schedulerRunning = false;
}

export function markSchedulerTickFailed(code: string, at = new Date()): void {
  schedulerHeartbeatAt = at;
  schedulerLastErrorAt = at;
  schedulerLastErrorCode = code.slice(0, 120);
  schedulerRunning = false;
}

export function schedulerStatus(now = new Date()) {
  const heartbeatAgeMs = schedulerHeartbeatAt
    ? Math.max(0, now.getTime() - schedulerHeartbeatAt.getTime())
    : null;
  const healthy = heartbeatAgeMs !== null && heartbeatAgeMs < 3 * 60_000;
  return {
    status: healthy ? "healthy" as const : schedulerStartedAt ? "degraded" as const : "unknown" as const,
    startedAt: schedulerStartedAt?.toISOString() ?? null,
    heartbeatAt: schedulerHeartbeatAt?.toISOString() ?? null,
    heartbeatAgeMs,
    tickStartedAt: schedulerTickStartedAt?.toISOString() ?? null,
    tickFinishedAt: schedulerTickFinishedAt?.toISOString() ?? null,
    running: schedulerRunning,
    lastErrorAt: schedulerLastErrorAt?.toISOString() ?? null,
    lastErrorCode: schedulerLastErrorCode,
  };
}

export function processStatus() {
  return {
    status: "healthy" as const,
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    node: process.version,
  };
}
