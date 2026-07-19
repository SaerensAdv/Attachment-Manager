import { describe, expect, it } from "vitest";
import { deploymentEvidence, recoveryEvidence, PRODUCTION_BUDGETS } from "./production-hardening";

describe("production hardening evidence", () => {
  it("only calls a deployment persistent when Reserved VM evidence exists", () => {
    expect(deploymentEvidence({ NODE_ENV: "production", ATLAS_DEPLOYMENT_MODE: "reserved-vm", REPLIT_DEPLOYMENT_ID: "dep-1", PROCESS_RESTART_COUNT: "2" })).toMatchObject({ status: "healthy", persistent: true, restartCount: 2 });
    expect(deploymentEvidence({ NODE_ENV: "production", ATLAS_DEPLOYMENT_MODE: "autoscale" })).toMatchObject({ status: "degraded", persistent: false });
    expect(deploymentEvidence({ NODE_ENV: "production" }).status).toBe("degraded");
  });

  it("requires both a fresh backup and a recent restore rehearsal", () => {
    const now = Date.parse("2026-07-19T14:00:00Z");
    const healthy = recoveryEvidence({ DATABASE_BACKUP_LAST_SUCCESS_AT: "2026-07-19T02:00:00Z", DATABASE_RESTORE_REHEARSAL_AT: "2026-07-01T10:00:00Z" }, now);
    expect(healthy.status).toBe("healthy");
    expect(recoveryEvidence({ DATABASE_BACKUP_LAST_SUCCESS_AT: "2026-07-19T02:00:00Z" }, now)).toMatchObject({ status: "degraded", message: "RESTORE_REHEARSAL_NOT_RECORDED" });
    expect(recoveryEvidence({}, now)).toMatchObject({ status: "unknown", message: "BACKUP_EVIDENCE_NOT_RECORDED" });
  });

  it("locks the final graph performance contract", () => {
    expect(PRODUCTION_BUDGETS.graphFpsCap).toBe(45);
    expect(PRODUCTION_BUDGETS.graphMaxOverviewNodes).toBe(250);
    expect(PRODUCTION_BUDGETS.graphMaxOverviewEdges).toBe(500);
  });
});
