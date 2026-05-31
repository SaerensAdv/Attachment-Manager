import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { buildGenerationContext } from "../lib/generate-context";
import { getDocFile } from "../lib/docs";

const router: IRouter = Router();

interface GenerateBody {
  agentPath?: unknown;
  additionalAgentPaths?: unknown;
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

  // Build the ordered team: lead agent first, then any additional members.
  // De-duplicate, drop the orchestrator (it routes, never executes), and keep
  // only valid agent docs.
  const rawTeam = [
    agentPath,
    ...(Array.isArray(body.additionalAgentPaths)
      ? body.additionalAgentPaths.filter(
          (p): p is string => typeof p === "string",
        )
      : []),
  ];
  const seen = new Set<string>();
  const teamPaths: string[] = [];
  for (const p of rawTeam) {
    if (seen.has(p)) continue;
    seen.add(p);
    if (p === "agents/orchestrator.md") continue;
    if (isValidDoc(p, "agent")) teamPaths.push(p);
  }

  if (teamPaths.length === 0) {
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

  const memberTitles = teamPaths.map(
    (p) => getDocFile(p)?.title ?? "Teamlid",
  );

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (payload: unknown) =>
    res.write(`data: ${JSON.stringify(payload)}\n\n`);

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
    let priorWork = "";

    for (let i = 0; i < teamPaths.length; i++) {
      if (clientGone) break;

      const path = teamPaths[i];
      const isFinal = i === teamPaths.length - 1;

      let systemPrompt: string;
      try {
        ({ systemPrompt } = buildGenerationContext({
          agentPath: path,
          clientPath,
          workflowPath,
          team: {
            members: memberTitles,
            position: i,
            priorWork,
            isFinal,
          },
        }));
      } catch (err) {
        send({
          error:
            "Kon de context niet samenstellen: " +
            (err instanceof Error ? err.message : String(err)),
        });
        res.end();
        return;
      }

      send({
        type: "agent_start",
        index: i,
        total: teamPaths.length,
        agent: { path, title: memberTitles[i] },
        role: i === 0 ? "lead" : "member",
      });

      const stream = anthropic.messages.stream(
        {
          model: "claude-sonnet-4-6",
          // Per-member cap: each agent contributes one section, so a smaller
          // budget keeps a multi-agent chain responsive end-to-end.
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: "user", content: request }],
        },
        { signal: controller.signal },
      );

      let agentText = "";
      for await (const event of stream) {
        if (clientGone) break;
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          agentText += event.delta.text;
          send({ content: event.delta.text, index: i });
        }
      }

      if (clientGone) break;

      send({ type: "agent_done", index: i });
      priorWork += `\n\n## ${memberTitles[i]}\n\n${agentText.trim()}`;
    }

    if (!clientGone) {
      send({ done: true });
      res.end();
    }
  } catch (err) {
    if (clientGone || (err instanceof Error && err.name === "AbortError")) {
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    send({ error: message });
    res.end();
  } finally {
    res.off("close", onClose);
  }
});

export default router;
