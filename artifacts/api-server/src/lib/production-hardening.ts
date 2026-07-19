export type EvidenceState = "healthy" | "degraded" | "down" | "unknown";

const isoOrNull = (value: string | undefined): string | null => {
  const text = value?.trim();
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
};

const boundedInt = (value: string | undefined): number | null => {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? Math.min(parsed, 1_000_000) : null;
};

export interface DeploymentEvidence {
  status: EvidenceState;
  message: string;
  mode: "reserved-vm" | "autoscale" | "development" | "unknown";
  persistent: boolean | null;
  restartCount: number | null;
  deploymentIdPresent: boolean;
}

export function deploymentEvidence(env: NodeJS.ProcessEnv = process.env): DeploymentEvidence {
  const rawMode = (env.ATLAS_DEPLOYMENT_MODE ?? env.REPLIT_DEPLOYMENT_TYPE ?? "").trim().toLowerCase();
  const mode = rawMode === "reserved-vm" || rawMode === "reserved_vm" || rawMode === "vm"
    ? "reserved-vm" as const
    : rawMode === "autoscale"
      ? "autoscale" as const
      : env.NODE_ENV === "development" || env.NODE_ENV === "test"
        ? "development" as const
        : "unknown" as const;
  const deploymentIdPresent = Boolean((env.REPLIT_DEPLOYMENT_ID ?? env.DEPLOYMENT_ID)?.trim());
  const restartCount = boundedInt(env.PROCESS_RESTART_COUNT ?? env.REPLIT_DEPLOYMENT_RESTART_COUNT);
  const persistent = mode === "reserved-vm" ? true : mode === "autoscale" ? false : null;
  const status: EvidenceState = mode === "reserved-vm" && deploymentIdPresent
    ? "healthy"
    : mode === "autoscale"
      ? "degraded"
      : mode === "development"
        ? "unknown"
        : "degraded";
  const message = status === "healthy"
    ? "PERSISTENT_DEPLOYMENT_VERIFIED"
    : mode === "autoscale"
      ? "NON_PERSISTENT_DEPLOYMENT"
      : mode === "development"
        ? "DEVELOPMENT_RUNTIME"
        : "DEPLOYMENT_MODE_UNVERIFIED";
  return { status, message, mode, persistent, restartCount, deploymentIdPresent };
}

export interface RecoveryEvidence {
  status: EvidenceState;
  message: string;
  backupAt: string | null;
  restoreRehearsalAt: string | null;
  backupAgeHours: number | null;
  restoreAgeDays: number | null;
}

export function recoveryEvidence(env: NodeJS.ProcessEnv = process.env, now = Date.now()): RecoveryEvidence {
  const backupAt = isoOrNull(env.DATABASE_BACKUP_LAST_SUCCESS_AT);
  const restoreRehearsalAt = isoOrNull(env.DATABASE_RESTORE_REHEARSAL_AT);
  const backupAgeHours = backupAt ? Math.max(0, now - Date.parse(backupAt)) / 3_600_000 : null;
  const restoreAgeDays = restoreRehearsalAt ? Math.max(0, now - Date.parse(restoreRehearsalAt)) / 86_400_000 : null;
  const backupFresh = backupAgeHours !== null && backupAgeHours <= 48;
  const restoreFresh = restoreAgeDays !== null && restoreAgeDays <= 90;
  const status: EvidenceState = backupFresh && restoreFresh
    ? "healthy"
    : backupAt || restoreRehearsalAt
      ? "degraded"
      : "unknown";
  const message = !backupAt
    ? "BACKUP_EVIDENCE_NOT_RECORDED"
    : !backupFresh
      ? "BACKUP_EVIDENCE_STALE"
      : !restoreRehearsalAt
        ? "RESTORE_REHEARSAL_NOT_RECORDED"
        : !restoreFresh
          ? "RESTORE_REHEARSAL_STALE"
          : "RECOVERY_EVIDENCE_VERIFIED";
  return { status, message, backupAt, restoreRehearsalAt, backupAgeHours, restoreAgeDays };
}

export const PRODUCTION_BUDGETS = Object.freeze({
  graphFpsCap: 45,
  graphMaxOverviewNodes: 250,
  graphMaxOverviewEdges: 500,
  graphMaxCollectedTasks: 5_000,
  graphMaxCollectedPages: 5_000,
  systemStatusTargetMs: 2_000,
});
