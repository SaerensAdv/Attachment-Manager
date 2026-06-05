import { Router, type IRouter } from "express";
import {
  resolveGenerationContext,
  runGeneration,
} from "../lib/generate-engine";

const router: IRouter = Router();

/**
 * Trigger a generation that nobody is watching live (e.g. an n8n flow or a
 * scheduler). The team runs server-side to completion and the result is
 * archived with triggerSource="autonomous", so it shows up in the History
 * audit trail and the team KPIs exactly like an interactive run.
 *
 * This endpoint is callable from outside, so it is gated behind a shared
 * secret: the caller must send `x-trigger-secret` matching the
 * AUTONOMOUS_TRIGGER_SECRET env var. When that var is unset the endpoint is
 * disabled (503), so an open generation endpoint is never exposed by accident.
 */
router.post("/generate/autonomous", async (req, res): Promise<void> => {
  const expected = process.env.AUTONOMOUS_TRIGGER_SECRET;
  if (!expected) {
    res.status(503).json({
      error:
        "Autonome runs zijn uitgeschakeld: stel AUTONOMOUS_TRIGGER_SECRET in om ze te activeren.",
    });
    return;
  }
  const provided = req.header("x-trigger-secret");
  if (provided !== expected) {
    res.status(401).json({ error: "Ongeldige of ontbrekende trigger-secret." });
    return;
  }

  const resolved = await resolveGenerationContext(req.body);
  if (!resolved.ok) {
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }

  // No live client: a no-op sink (events are dropped) and a never-aborting
  // signal. The engine still records the full audit trail + KPIs.
  const controller = new AbortController();
  const result = await runGeneration(resolved.ctx, {
    sink: () => {},
    signal: controller.signal,
    triggerSource: "autonomous",
  });

  res.json({
    id: result.generationId,
    status: result.status,
    archived: result.archived,
    error: result.error ?? null,
  });
});

export default router;
