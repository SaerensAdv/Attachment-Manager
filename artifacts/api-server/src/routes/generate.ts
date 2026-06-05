import { Router, type IRouter } from "express";
import {
  resolveGenerationContext,
  runGeneration,
} from "../lib/generate-engine";

const router: IRouter = Router();

router.post("/generate", async (req, res) => {
  const resolved = await resolveGenerationContext(req.body);
  if (!resolved.ok) {
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  // Stream engine events straight to the client as SSE.
  const sink = (payload: unknown) =>
    res.write(`data: ${JSON.stringify(payload)}\n\n`);

  // Abort the upstream Anthropic requests the moment the client disconnects or
  // hits Stop, so we never keep burning tokens for a response nobody reads.
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
