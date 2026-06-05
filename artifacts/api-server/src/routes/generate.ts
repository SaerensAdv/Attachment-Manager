import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { buildGenerationContext } from "../lib/generate-context";
import { getDocFile, type DocFile } from "../lib/docs";
import { loadClientDocs } from "../lib/clients-store";
import { saveGeneration, saveGenerationSteps } from "../lib/generations-store";
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

  // Accumulated team output, declared out here so the catch handler can still
  // persist a partial run if the stream fails partway through.
  let priorWork = "";
  let persisted = false;
  // Run outcome — flipped to "partial" whenever the run is stopped or fails
  // part-way but some work was already produced and is worth keeping.
  let runStatus = "completed";
  // Per-step audit trail, filled as each agent (and the deliverable) runs. Saved
  // alongside the generation so KPIs and a "what happened" timeline can be built.
  interface StepRecord {
    agentPath: string;
    agentTitle: string;
    stepOrder: number;
    role: string;
    status: string;
    durationMs: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    charCount: number | null;
    errorMessage: string | null;
  }
  const steps: StepRecord[] = [];

  const persistRun = async (): Promise<boolean> => {
    if (persisted) return true;
    const markdown = priorWork.trim();
    // Archive the run when there's either produced markdown OR at least one
    // recorded step. The step condition is what makes failed/aborted runs (and
    // future autonomous runs) reviewable: even a run that broke before any
    // markdown was written still leaves a generation row + audit trail.
    if (!markdown && steps.length === 0) return false;
    try {
      const totalTokens = steps.reduce(
        (a, s) => a + (s.inputTokens ?? 0) + (s.outputTokens ?? 0),
        0,
      );
      const durationMs = steps.reduce((a, s) => a + (s.durationMs ?? 0), 0);
      const row = await saveGeneration({
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
        finalMarkdown: markdown,
        triggerSource: "user",
        status: runStatus,
        durationMs: durationMs || null,
        totalTokens: totalTokens || null,
      });
      // Best-effort: a failure to write the step trail must never lose the run
      // itself, which is already safely stored above.
      try {
        await saveGenerationSteps(
          steps.map((s) => ({ ...s, generationId: row.id })),
        );
      } catch (stepErr) {
        console.error(
          "Kon stappen niet opslaan:",
          stepErr instanceof Error ? stepErr.message : String(stepErr),
        );
      }
      persisted = true;
      return true;
    } catch (err) {
      console.error(
        "Kon generatie niet opslaan in archief:",
        err instanceof Error ? err.message : String(err),
      );
      return false;
    }
  };

  try {
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
        // Record the failed step so the audit trail shows where the run broke.
        steps.push({
          agentPath: path,
          agentTitle: memberTitles[i],
          stepOrder: i,
          role: i === 0 ? "lead" : "member",
          status: "failed",
          durationMs: null,
          inputTokens: null,
          outputTokens: null,
          charCount: null,
          errorMessage: (err instanceof Error
            ? err.message
            : String(err)
          ).slice(0, 500),
        });
        runStatus = "partial";
        // Crash-safety: any team members that already ran produced `priorWork`.
        // Persist that partial run before bailing so it isn't silently lost
        // (persistRun is idempotent and best-effort).
        await persistRun();
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

      const startedAt = Date.now();
      let agentText = "";
      // Detect a hard token-limit cutoff so the UI can flag a section that was
      // cut off mid-sentence instead of letting it silently look unfinished.
      // Token usage is captured here too — the one place the final message is
      // known — so KPIs reflect real cost.
      let truncated = false;
      let inputTokens: number | null = null;
      let outputTokens: number | null = null;

      try {
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

        if (!clientGone) {
          const finalMsg = await stream.finalMessage();
          truncated = finalMsg.stop_reason === "max_tokens";
          inputTokens = finalMsg.usage?.input_tokens ?? null;
          outputTokens = finalMsg.usage?.output_tokens ?? null;
        }
      } catch (streamErr) {
        const isAbort =
          streamErr instanceof Error && streamErr.name === "AbortError";
        if (!isAbort && !clientGone) {
          // A real mid-step stream failure: record exactly where the run broke
          // (with any partial output kept) so the audit trail is faithful at the
          // failure point, then let the outer handler archive + report it.
          steps.push({
            agentPath: path,
            agentTitle: memberTitles[i],
            stepOrder: i,
            role: i === 0 ? "lead" : "member",
            status: "failed",
            durationMs: Date.now() - startedAt,
            inputTokens,
            outputTokens,
            charCount: agentText.length || null,
            errorMessage: (streamErr instanceof Error
              ? streamErr.message
              : String(streamErr)
            ).slice(0, 500),
          });
          runStatus = "partial";
          if (agentText.trim()) {
            priorWork += `\n\n## ${memberTitles[i]}\n\n${agentText.trim()}`;
          }
          throw streamErr;
        }
        // Abort / client disconnect: fall through to the clientGone path, which
        // records the step as "aborted" and archives the partial run.
      }

      // Record this agent's step for the audit trail + KPIs, including a run
      // the user stopped (status "aborted") so the trail reflects what happened.
      steps.push({
        agentPath: path,
        agentTitle: memberTitles[i],
        stepOrder: i,
        role: i === 0 ? "lead" : "member",
        status: clientGone ? "aborted" : truncated ? "truncated" : "completed",
        durationMs: Date.now() - startedAt,
        inputTokens,
        outputTokens,
        charCount: agentText.length,
        errorMessage: null,
      });

      if (clientGone) {
        runStatus = "partial";
        break;
      }

      // A truncated (token-cutoff) agent section means this run did not finish
      // cleanly, so keep run-level status consistent with its step trail instead
      // of reporting "completed" over a section that was cut off mid-sentence.
      if (truncated) runStatus = "partial";

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
      const delStartedAt = Date.now();
      let delChars = 0;
      let delIn: number | null = null;
      let delOut: number | null = null;
      let delStatus = "completed";
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
            delChars += event.delta.text.length;
            send({ type: "deliverable_delta", content: event.delta.text });
          }
        }
        let deliverableTruncated = false;
        if (!clientGone) {
          try {
            const dfinal = await dstream.finalMessage();
            deliverableTruncated = dfinal.stop_reason === "max_tokens";
            delIn = dfinal.usage?.input_tokens ?? null;
            delOut = dfinal.usage?.output_tokens ?? null;
          } catch {
            // best-effort truncation detection
          }
        }
        delStatus = clientGone
          ? "aborted"
          : deliverableTruncated
            ? "truncated"
            : "completed";
        if (!clientGone)
          send({ type: "deliverable_done", truncated: deliverableTruncated });
      } catch (err) {
        delStatus = "failed";
        if (!clientGone && !(err instanceof Error && err.name === "AbortError")) {
          const message = err instanceof Error ? err.message : String(err);
          send({ type: "deliverable_error", message });
        }
      }
      // Record the deliverable as a closing step. Its agentPath is the workflow
      // (not an agent), so it shows in the run timeline without skewing any
      // single agent's KPIs.
      steps.push({
        agentPath: workflowPath,
        agentTitle: meta.title ?? "Eindproduct",
        stepOrder: teamPaths.length,
        role: "deliverable",
        status: delStatus,
        durationMs: Date.now() - delStartedAt,
        inputTokens: delIn,
        outputTokens: delOut,
        charCount: delChars || null,
        errorMessage: null,
      });
      // A failed/aborted/truncated closing product means the run did not finish
      // cleanly, so reflect that at the run level instead of reporting it
      // "completed" while it contains a broken final step.
      if (delStatus !== "completed") runStatus = "partial";
    }

    if (!clientGone) {
      // Persist the finished run to the archive. `persistRun` is best-effort and
      // idempotent: on any DB error it logs and returns false, so a save failure
      // never breaks a successful generation. `archived` tells the client whether
      // persistence actually succeeded, so the UI never claims a run was saved
      // when it wasn't.
      const archived = await persistRun();
      send({ done: true, archived });
      res.end();
    } else {
      // The client disconnected or stopped the run mid-flight. There's no one to
      // stream to anymore, but the partial trail still matters: archive it so the
      // aborted run (and what each agent managed to do) is reviewable afterward.
      await persistRun();
    }
  } catch (err) {
    if (clientGone || (err instanceof Error && err.name === "AbortError")) {
      // Aborted/disconnected: still archive the partial run + audit trail so it
      // can be inspected later (e.g. autonomous runs nobody was watching).
      await persistRun();
      return;
    }
    // Save whatever the team produced before the failure, so a crash partway
    // through a long run doesn't discard the work already generated.
    runStatus = "partial";
    await persistRun();
    const message = err instanceof Error ? err.message : String(err);
    send({ error: message });
    res.end();
  } finally {
    res.off("close", onClose);
  }
});

export default router;
