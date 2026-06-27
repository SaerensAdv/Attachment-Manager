import { Router, type IRouter } from "express";
import {
  listAlerts,
  resolveAlert as resolveAlertRow,
  type SystemAlert,
} from "../lib/alerts-store";

const router: IRouter = Router();

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Shape an alert for the API (dates as ISO strings to match the OpenAPI spec). */
export function serializeAlert(a: SystemAlert): {
  id: number;
  source: string;
  severity: string;
  message: string;
  context: Record<string, unknown> | null;
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
} {
  return {
    id: a.id,
    source: a.source,
    severity: a.severity,
    message: a.message,
    context: a.context,
    occurrences: a.occurrences,
    firstSeenAt: a.firstSeenAt.toISOString(),
    lastSeenAt: a.lastSeenAt.toISOString(),
    resolvedAt: a.resolvedAt ? a.resolvedAt.toISOString() : null,
  };
}

router.get("/alerts", async (req, res) => {
  const unresolvedOnly =
    req.query.unresolvedOnly === "true" || req.query.unresolvedOnly === "1";
  const alerts = await listAlerts({ unresolvedOnly });
  res.json({ alerts: alerts.map(serializeAlert) });
});

router.post("/alerts/:id/resolve", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const resolved = await resolveAlertRow(id);
  if (!resolved) {
    res.status(404).json({ error: "Melding niet gevonden of al opgelost." });
    return;
  }
  res.json(serializeAlert(resolved));
});

export default router;
