import { Cron } from "croner";
import { logger } from "./logger";
import { resolveGenerationContext, runGeneration } from "./generate-engine";
import { claim, listDue, markRun } from "./schedules-store";
import { startInboundPoller } from "./email-inbound";
import { recordAlert } from "./alerts-store";
import type { Schedule as ScheduleRow } from "@workspace/db";

const TICK_INTERVAL_MS = 60_000;

/**
 * Compute the next fire time for a cron expression in a given timezone. Returns
 * null when the expression is invalid or has no future occurrence.
 */
export function computeNextRun(
  cronExpr: string,
  timezone: string,
  from: Date = new Date(),
): Date | null {
  try {
    const cron = new Cron(cronExpr, { timezone });
    return cron.nextRun(from);
  } catch {
    return null;
  }
}

/** Whether a cron expression is parseable (used to validate user input). */
export function isValidCron(cronExpr: string, timezone: string): boolean {
  try {
    // Constructing throws on an invalid pattern or timezone.
    new Cron(cronExpr, { timezone });
    return true;
  } catch {
    return false;
  }
}

/** Run one schedule's generation to completion and record the outcome. */
async function fire(schedule: ScheduleRow): Promise<void> {
  let additional: string[] = [];
  try {
    const parsed = JSON.parse(schedule.additionalAgentPaths);
    if (Array.isArray(parsed)) {
      additional = parsed.filter((p): p is string => typeof p === "string");
    }
  } catch {
    additional = [];
  }

  const resolved = await resolveGenerationContext({
    agentPath: schedule.agentPath,
    additionalAgentPaths: additional,
    clientPath: schedule.clientPath,
    workflowPath: schedule.workflowPath,
    request: schedule.request,
  });

  if (!resolved.ok) {
    logger.warn(
      { scheduleId: schedule.id, error: resolved.error },
      "Scheduled run could not resolve its context",
    );
    void recordAlert({
      source: "scheduler",
      severity: "error",
      message: `Geplande run kon zijn context niet opbouwen (planning #${schedule.id}).`,
      context: {
        key: `schedule:${schedule.id}`,
        scheduleId: schedule.id,
        error: String(resolved.error ?? "onbekende fout").slice(0, 500),
      },
    });
    await markRun(schedule.id, { lastGenerationId: null, lastStatus: "failed" });
    return;
  }

  const controller = new AbortController();
  const result = await runGeneration(resolved.ctx, {
    sink: () => {},
    signal: controller.signal,
    triggerSource: "scheduled",
  });

  await markRun(schedule.id, {
    lastGenerationId: result.generationId ?? null,
    lastStatus: result.status,
  });

  logger.info(
    {
      scheduleId: schedule.id,
      generationId: result.generationId,
      status: result.status,
    },
    "Scheduled run finished",
  );
}

let ticking = false;

/**
 * One scheduler tick: find due schedules, atomically claim each (advancing its
 * nextRunAt so it can't be processed twice), then run them sequentially. The
 * `ticking` guard means a long-running batch simply skips overlapping ticks
 * rather than piling up.
 */
async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const now = new Date();
    const due = await listDue(now);
    for (const schedule of due) {
      if (!schedule.nextRunAt) continue;
      const next = computeNextRun(schedule.cronExpr, schedule.timezone, now);
      const won = await claim(schedule.id, schedule.nextRunAt, next);
      if (!won) continue;
      try {
        await fire(schedule);
      } catch (err) {
        logger.error(
          { err, scheduleId: schedule.id },
          "Scheduled run threw unexpectedly",
        );
        void recordAlert({
          source: "scheduler",
          severity: "error",
          message: `Geplande run mislukte (planning #${schedule.id}).`,
          context: {
            key: `schedule:${schedule.id}`,
            scheduleId: schedule.id,
            error: (err instanceof Error ? err.message : String(err)).slice(
              0,
              500,
            ),
          },
        });
        await markRun(schedule.id, {
          lastGenerationId: null,
          lastStatus: "failed",
        }).catch(() => {});
      }
    }
  } catch (err) {
    logger.error({ err }, "Scheduler tick failed");
    void recordAlert({
      source: "scheduler",
      severity: "error",
      message: "Planner-tik mislukte (geplande runs zijn mogelijk overgeslagen).",
      context: {
        key: "scheduler-tick",
        error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      },
    });
  } finally {
    ticking = false;
  }
}

/** Start the periodic scheduler. Safe to call once at boot. */
export function startScheduler(): void {
  logger.info({ intervalMs: TICK_INTERVAL_MS }, "Scheduler started");
  // A short initial delay lets the server settle before the first sweep.
  setTimeout(() => void tick(), 5_000);
  setInterval(() => void tick(), TICK_INTERVAL_MS);
  // The inbound-email poller (Phase 2) runs as a sibling loop with its own guard.
  startInboundPoller();
}
