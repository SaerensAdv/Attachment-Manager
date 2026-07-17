import { Router, type IRouter } from "express";
import {
  resolveGenerationContext,
  runGeneration,
} from "../lib/generate-engine";
import { createGenerationEventEnvelope } from "../lib/generation-events";

const router: IRouter = Router();

router.post("/generate", async (req, res) => {
  const resolved = await resolveGenerationContext(req.body);
  if (!resolved.ok) {
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }

  const envelope = createGenerationEventEnvelope();
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Correlation-Id", envelope.correlationId);
  res.flushHeaders?.();

  const sink = (payload: Parameters<typeof envelope.wrap>[0]) =>
    res.write(`data: ${JSON.stringify(envelope.wrap(payload))}\n\n`);

  const controller = new AbortController();
  const onClose = () => controller.abort();
  res.on("close", onClose);

  try {
    await runGeneration(resolved.ctx, {
      sink,
      signal: controller.signal,
      triggerSource: "user",
    });
  } finally {
    res.off("close", onClose);
    if (!res.writableEnded) res.end();
  }
});

export default router;
