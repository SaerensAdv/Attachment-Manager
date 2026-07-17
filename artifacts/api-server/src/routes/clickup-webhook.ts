import { Router, type IRouter } from "express";
import { enqueueClickUpWebhookEvent } from "../lib/clickup/webhook-store";
import { parseClickUpStatusEvents, verifyClickUpSignature } from "../lib/clickup/webhook-security";

const router: IRouter = Router();
router.post("/", async (req, res) => {
  const secret = (process.env.CLICKUP_WEBHOOK_SECRET ?? "").trim();
  if (!secret) { res.status(503).json({ error: "WEBHOOK_NOT_CONFIGURED" }); return; }
  if (!Buffer.isBuffer(req.body)) { res.status(415).json({ error: "RAW_BODY_REQUIRED" }); return; }
  const signature = typeof req.headers["x-signature"] === "string" ? req.headers["x-signature"] : undefined;
  if (!verifyClickUpSignature(req.body, signature, secret)) { res.status(401).json({ error: "INVALID_SIGNATURE" }); return; }
  let events;
  try { events = parseClickUpStatusEvents(req.body); }
  catch { res.status(400).json({ error: "INVALID_PAYLOAD" }); return; }
  let queued = 0; let duplicates = 0;
  for (const event of events) {
    const outcome = await enqueueClickUpWebhookEvent(event);
    if (outcome === "queued") queued += 1; else duplicates += 1;
  }
  res.status(202).json({ accepted: true, queued, duplicates, ignored: events.length === 0 });
});
export default router;
