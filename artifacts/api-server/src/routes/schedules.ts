import { Router, type IRouter } from "express";
import { type Schedule } from "@workspace/db";
import { resolveGenerationContext, runGeneration } from "../lib/generate-engine";
import { computeNextRun, isValidCron } from "../lib/scheduler";
import {
  createSchedule,
  deleteSchedule,
  getSchedule,
  listSchedules,
  markRun,
  updateSchedule,
} from "../lib/schedules-store";

const router: IRouter = Router();

const MAX_NAME_LEN = 200;
const MAX_REQUEST_LEN = 5_000;
const DEFAULT_TIMEZONE = "Europe/Brussels";

function asTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Shape a DB row for the API response (timestamps as ISO strings). */
function serialize(s: Schedule) {
  return {
    ...s,
    additionalAgentPaths: ((): string[] => {
      try {
        const parsed = JSON.parse(s.additionalAgentPaths);
        return Array.isArray(parsed)
          ? parsed.filter((p): p is string => typeof p === "string")
          : [];
      } catch {
        return [];
      }
    })(),
    nextRunAt: s.nextRunAt ? s.nextRunAt.toISOString() : null,
    lastRunAt: s.lastRunAt ? s.lastRunAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
  };
}

interface RunDefinition {
  agentPath: string;
  agentTitle: string;
  additionalAgentPaths: string[];
  clientPath: string;
  clientName: string;
  workflowPath: string;
  workflowTitle: string;
  request: string;
}

/**
 * Validate the run-defining fields (client/workflow/agent/request) by resolving
 * them through the same engine the live command bar uses, and return the
 * canonical titles to store. Keeps schedules in lock-step with what the engine
 * considers a valid, runnable line-up.
 */
async function resolveRunDefinition(
  body: Record<string, unknown>,
): Promise<RunDefinition | { error: string }> {
  const resolved = await resolveGenerationContext({
    agentPath: body.agentPath,
    additionalAgentPaths: body.additionalAgentPaths,
    clientPath: body.clientPath,
    workflowPath: body.workflowPath,
    request: body.request,
  });
  if (!resolved.ok) return { error: resolved.error };
  const { ctx } = resolved;
  return {
    agentPath: ctx.teamPaths[0],
    agentTitle: ctx.memberTitles[0] ?? ctx.teamPaths[0],
    additionalAgentPaths: ctx.teamPaths.slice(1),
    clientPath: ctx.clientPath,
    clientName: ctx.clientName,
    workflowPath: ctx.workflowPath,
    workflowTitle: ctx.workflowTitle,
    request: ctx.request,
  };
}

router.get("/schedules", async (_req, res): Promise<void> => {
  const rows = await listSchedules();
  res.json({ schedules: rows.map(serialize) });
});

router.post("/schedules", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const name = asTrimmed(body.name);
  if (!name) {
    res.status(400).json({ error: "Naam is verplicht." });
    return;
  }
  if (name.length > MAX_NAME_LEN) {
    res.status(400).json({ error: `Naam is te lang (max ${MAX_NAME_LEN}).` });
    return;
  }

  const request = asTrimmed(body.request);
  if (request && request.length > MAX_REQUEST_LEN) {
    res
      .status(400)
      .json({ error: `Opdracht is te lang (max ${MAX_REQUEST_LEN}).` });
    return;
  }

  const cronExpr = asTrimmed(body.cronExpr);
  if (!cronExpr) {
    res.status(400).json({ error: "Een cron-expressie is verplicht." });
    return;
  }
  const timezone = asTrimmed(body.timezone) ?? DEFAULT_TIMEZONE;
  if (!isValidCron(cronExpr, timezone)) {
    res
      .status(400)
      .json({ error: "Ongeldige cron-expressie of tijdzone." });
    return;
  }

  const def = await resolveRunDefinition(body);
  if ("error" in def) {
    res.status(400).json({ error: def.error });
    return;
  }

  const nextRunAt = computeNextRun(cronExpr, timezone);
  const enabled = body.enabled === false ? false : true;

  const created = await createSchedule({
    name,
    cronExpr,
    timezone,
    agentPath: def.agentPath,
    agentTitle: def.agentTitle,
    additionalAgentPaths: JSON.stringify(def.additionalAgentPaths),
    clientPath: def.clientPath,
    clientName: def.clientName,
    workflowPath: def.workflowPath,
    workflowTitle: def.workflowTitle,
    request: def.request,
    enabled,
    nextRunAt: enabled ? nextRunAt : null,
  });

  res.status(201).json(serialize(created));
});

router.patch("/schedules/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const existing = await getSchedule(id);
  if (!existing) {
    res.status(404).json({ error: "Planning niet gevonden." });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const patch: Partial<typeof existing> = {};

  if (body.name !== undefined) {
    const name = asTrimmed(body.name);
    if (!name || name.length > MAX_NAME_LEN) {
      res.status(400).json({ error: "Ongeldige naam." });
      return;
    }
    patch.name = name;
  }

  // Run-defining fields: if any is present, re-resolve the whole definition
  // (merged over the existing row) so titles stay canonical.
  if (body.request !== undefined) {
    const r = asTrimmed(body.request);
    if (!r || r.length > MAX_REQUEST_LEN) {
      res
        .status(400)
        .json({ error: `Ongeldige opdracht (max ${MAX_REQUEST_LEN}).` });
      return;
    }
  }

  const runFieldsTouched =
    body.agentPath !== undefined ||
    body.additionalAgentPaths !== undefined ||
    body.clientPath !== undefined ||
    body.workflowPath !== undefined ||
    body.request !== undefined;
  if (runFieldsTouched) {
    const def = await resolveRunDefinition({
      agentPath: body.agentPath ?? existing.agentPath,
      additionalAgentPaths:
        body.additionalAgentPaths ?? JSON.parse(existing.additionalAgentPaths),
      clientPath: body.clientPath ?? existing.clientPath,
      workflowPath: body.workflowPath ?? existing.workflowPath,
      request: body.request ?? existing.request,
    });
    if ("error" in def) {
      res.status(400).json({ error: def.error });
      return;
    }
    patch.agentPath = def.agentPath;
    patch.agentTitle = def.agentTitle;
    patch.additionalAgentPaths = JSON.stringify(def.additionalAgentPaths);
    patch.clientPath = def.clientPath;
    patch.clientName = def.clientName;
    patch.workflowPath = def.workflowPath;
    patch.workflowTitle = def.workflowTitle;
    patch.request = def.request;
  }

  const cronExpr =
    body.cronExpr !== undefined ? asTrimmed(body.cronExpr) : existing.cronExpr;
  const timezone =
    body.timezone !== undefined
      ? asTrimmed(body.timezone) ?? DEFAULT_TIMEZONE
      : existing.timezone;
  const cronChanged =
    cronExpr !== existing.cronExpr || timezone !== existing.timezone;
  if (cronChanged) {
    if (!cronExpr || !isValidCron(cronExpr, timezone)) {
      res
        .status(400)
        .json({ error: "Ongeldige cron-expressie of tijdzone." });
      return;
    }
    patch.cronExpr = cronExpr;
    patch.timezone = timezone;
  }

  let enabled = existing.enabled;
  if (body.enabled !== undefined) {
    enabled = body.enabled === true;
    patch.enabled = enabled;
  }

  // Recompute nextRunAt when the timing changed, when (re-)enabling, or when an
  // enabled schedule has no scheduled next run yet. Disabled schedules keep no
  // next run (they're skipped by the tick regardless).
  const enabling = enabled && !existing.enabled;
  if (!enabled) {
    patch.nextRunAt = null;
  } else if (cronChanged || enabling || existing.nextRunAt === null) {
    patch.nextRunAt = computeNextRun(
      cronExpr ?? existing.cronExpr,
      timezone,
    );
  }

  const updated = await updateSchedule(id, patch);
  res.json(serialize(updated!));
});

router.delete("/schedules/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const ok = await deleteSchedule(id);
  if (!ok) {
    res.status(404).json({ error: "Planning niet gevonden." });
    return;
  }
  res.status(204).end();
});

/**
 * Fire a schedule immediately, regardless of its cron timing. Runs the engine
 * with triggerSource="scheduled" so the result lands in the audit trail and
 * KPIs, and records the outcome on the schedule. Does not shift nextRunAt.
 */
router.post("/schedules/:id/run-now", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const schedule = await getSchedule(id);
  if (!schedule) {
    res.status(404).json({ error: "Planning niet gevonden." });
    return;
  }

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
    await markRun(id, { lastGenerationId: null, lastStatus: "failed" });
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }

  const controller = new AbortController();
  try {
    const result = await runGeneration(resolved.ctx, {
      sink: () => {},
      signal: controller.signal,
      triggerSource: "scheduled",
    });

    await markRun(id, {
      lastGenerationId: result.generationId ?? null,
      lastStatus: result.status,
    });

    res.json({
      id: result.generationId,
      status: result.status,
      archived: result.archived,
      error: result.error ?? null,
    });
  } catch (err) {
    // Never leave a run-now without bookkeeping: record the failure so the UI
    // reflects it, then return a controlled error.
    await markRun(id, { lastGenerationId: null, lastStatus: "failed" }).catch(
      () => {},
    );
    res.status(500).json({
      error: "De run is onverwacht mislukt.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
