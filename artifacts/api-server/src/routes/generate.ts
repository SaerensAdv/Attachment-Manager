import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { buildGenerationContext } from "../lib/generate-context";
import { getDocFile } from "../lib/docs";

const router: IRouter = Router();

interface GenerateBody {
  agentPath?: unknown;
  clientPath?: unknown;
  workflowPath?: unknown;
  request?: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

/** Ensure a selected path maps to an existing doc of the expected category. */
function isValidDoc(path: string, expectedCategory: string): boolean {
  const doc = getDocFile(path);
  return doc !== null && doc.category === expectedCategory;
}

router.post("/generate", async (req, res) => {
  const body = (req.body ?? {}) as GenerateBody;

  const agentPath = asString(body.agentPath);
  const clientPath = asString(body.clientPath);
  const workflowPath = asString(body.workflowPath);
  const request = asString(body.request);

  if (!agentPath || !clientPath || !workflowPath || !request) {
    res.status(400).json({
      error:
        "agentPath, clientPath, workflowPath en request zijn allemaal verplicht.",
    });
    return;
  }

  if (!isValidDoc(agentPath, "agent")) {
    res.status(400).json({ error: "Onbekende of ongeldige agent." });
    return;
  }
  if (!isValidDoc(clientPath, "client")) {
    res.status(400).json({ error: "Onbekende of ongeldige klant." });
    return;
  }
  if (!isValidDoc(workflowPath, "workflow")) {
    res.status(400).json({ error: "Onbekende of ongeldige workflow." });
    return;
  }

  let systemPrompt: string;
  try {
    ({ systemPrompt } = buildGenerationContext({
      agentPath,
      clientPath,
      workflowPath,
    }));
  } catch (err) {
    res.status(500).json({
      error: "Kon de context niet samenstellen.",
      detail: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  // Abort the upstream Anthropic request as soon as the client disconnects or
  // hits Stop, so we never keep consuming tokens for a response nobody reads.
  const controller = new AbortController();
  let clientGone = false;
  const onClose = () => {
    clientGone = true;
    controller.abort();
  };
  res.on("close", onClose);

  try {
    const stream = anthropic.messages.stream(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: "user", content: request }],
      },
      { signal: controller.signal },
    );

    for await (const event of stream) {
      if (clientGone) break;
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }
    }

    if (!clientGone) {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    }
  } catch (err) {
    if (clientGone || (err instanceof Error && err.name === "AbortError")) {
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  } finally {
    res.off("close", onClose);
  }
});

export default router;
