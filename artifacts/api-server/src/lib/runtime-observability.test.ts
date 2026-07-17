import { describe, expect, it } from "vitest";
import {
  markSchedulerStarted,
  markSchedulerTickFailed,
  markSchedulerTickFinished,
  markSchedulerTickStarted,
  schedulerStatus,
} from "./runtime-observability";

describe("scheduler heartbeat", () => {
  it("reports healthy after a recent completed tick", () => {
    const base = new Date("2026-07-17T20:00:00Z");
    markSchedulerStarted(base);
    markSchedulerTickStarted(new Date(base.getTime() + 1000));
    markSchedulerTickFinished(new Date(base.getTime() + 2000));
    expect(schedulerStatus(new Date(base.getTime() + 60_000)).status).toBe("healthy");
    expect(schedulerStatus(new Date(base.getTime() + 60_000)).running).toBe(false);
  });

  it("retains safe failure metadata", () => {
    const at = new Date("2026-07-17T20:10:00Z");
    markSchedulerTickFailed("SCHEDULER_TICK_FAILED", at);
    const status = schedulerStatus(at);
    expect(status.lastErrorCode).toBe("SCHEDULER_TICK_FAILED");
    expect(status.lastErrorAt).toBe(at.toISOString());
  });
});
