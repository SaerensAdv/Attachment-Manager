import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { buildGenerationContext } from "../lib/generate-context";
import { getDocFile, type DocFile } from "../lib/docs";
import { loadClientDocs } from "../lib/clients-store";
import { saveGeneration } from "../lib/generations-store";
import {
  getDeliverableKind,
  deliverableMeta,
  buildDeliverablePrompt,
} from "../lib/deliverables";

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
function isValidDoc(
  path: string,
  expectedCategory: string,
  extra: DocFile[] = [],
): boolean {
  const doc = getDocFile(path, extra);
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
  const clientDocs = await loadClientDocs();
  if (!isValidDoc(clientPath, "client", clientDocs)) {
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

  const clientDoc = getDocFile(clientPath, clientDocs);
  const clientName = (clientDoc?.title ?? clientPath).replace(
    /^Client:\s*/i,
    "",
  );
  const clientContent = clientDoc?.content ?? "";
  const workflowDoc = getDocFile(workflowPath);
  const deliverableKind = getDeliverableKind(workflowDoc);

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
        ({ systemPrompt } = await buildGenerationContext({
          agentPath: path,
          clientPath,
          workflowPath,
          extraDocs: clientDocs,
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
          // Per-member cap: each agent contributes one section. 4096 turned out
          // to cut longer sections off mid-sentence in multi-agent runs, so we
          // give each agent more room while still staying responsive.
          max_tokens: 8192,
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

      // Detect a hard token-limit cutoff so the UI can flag a section that was
      // cut off mid-sentence instead of letting it silently look unfinished.
      let truncated = false;
      if (!clientGone) {
        try {
          const finalMsg = await stream.finalMessage();
          truncated = finalMsg.stop_reason === "max_tokens";
        } catch {
          // best-effort; never let detection break a successful run
        }
      }

      if (clientGone) break;

      send({ type: "agent_done", index: i, truncated });
      priorWork += `\n\n## ${memberTitles[i]}\n\n${agentText.trim()}`;
    }

    // Deliverable layer: once the team's combined work is ready, convert it into
    // the concrete end product the workflow declares (e.g. a ready-to-paste
    // Replit prompt). Best-effort — a deliverable failure must never lose the
    // run; we report it and still finish the stream with the markdown result.
    const meta = clientGone ? null : deliverableMeta(deliverableKind, clientName);
    const prompt = meta
      ? buildDeliverablePrompt(deliverableKind, {
          clientName,
          clientContent,
          request,
          teamWork: priorWork,
        })
      : null;
    if (!clientGone && meta && prompt) {
      try {
        send({ type: "deliverable_start", deliverable: meta });
        const dstream = anthropic.messages.stream(
          {
            model: "claude-sonnet-4-6",
            // The deliverable is the final, ready-to-use product the user
            // copies out, and it's a single closing call — give it generous
            // room so it never gets truncated.
            max_tokens: 16000,
            system: prompt.system,
            messages: [{ role: "user", content: prompt.user }],
          },
          { signal: controller.signal },
        );
        for await (const event of dstream) {
          if (clientGone) break;
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            send({ type: "deliverable_delta", content: event.delta.text });
          }
        }
        let deliverableTruncated = false;
        if (!clientGone) {
          try {
            const dfinal = await dstream.finalMessage();
            deliverableTruncated = dfinal.stop_reason === "max_tokens";
          } catch {
            // best-effort truncation detection
          }
        }
        if (!clientGone)
          send({ type: "deliverable_done", truncated: deliverableTruncated });
      } catch (err) {
        if (!clientGone && !(err instanceof Error && err.name === "AbortError")) {
          const message = err instanceof Error ? err.message : String(err);
          send({ type: "deliverable_error", message });
        }
      }
    }

    if (!clientGone) {
      // Persist the finished run to the archive. This must never break a
      // successful generation: on any DB error we log and still finish the
      // stream so the user keeps their result. `archived` tells the client
      // whether persistence actually succeeded, so the UI never claims a run
      // was saved when it wasn't.
      let archived = false;
      try {
        await saveGeneration({
          clientPath,
          clientName,
          workflowPath,
          workflowTitle: (workflowDoc?.title ?? workflowPath).replace(
            /^Workflow:\s*/i,
            "",
          ),
          leadAgentPath: teamPaths[0],
          leadAgentTitle: memberTitles[0],
          teamPaths: JSON.stringify(teamPaths),
          teamTitles: JSON.stringify(memberTitles),
          requestText: request,
          finalMarkdown: priorWork.trim(),
        });
        archived = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Kon generatie niet opslaan in archief:", message);
      }
      send({ done: true, archived });
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
