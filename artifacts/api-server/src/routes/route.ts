import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { getDocFile, getDocGraph } from "../lib/docs";
import { loadClientDocs } from "../lib/clients-store";
import {
  buildRoutingPrompt,
  parseRoutingJson,
  type RoutingChoice,
} from "../lib/route-request";

const router: IRouter = Router();

interface RouteBody {
  clientPath?: unknown;
  request?: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

router.post("/route", async (req, res) => {
  const body = (req.body ?? {}) as RouteBody;
  const clientPath = asString(body.clientPath);
  const request = asString(body.request);

  if (!clientPath || !request) {
    res.status(400).json({ error: "clientPath en request zijn verplicht." });
    return;
  }

  const clientDocs = await loadClientDocs();
  const client = getDocFile(clientPath, clientDocs);
  if (!client || client.category !== "client") {
    res.status(400).json({ error: "Onbekende of ongeldige klant." });
    return;
  }

  const graph = getDocGraph();
  const workflows = graph.nodes.filter((n) => n.category === "workflow");
  const agents = graph.nodes.filter(
    (n) => n.category === "agent" && n.path !== "agents/orchestrator.md",
  );

  const system = buildRoutingPrompt({
    clientTitle: client.title,
    workflows,
    agents,
  });

  let raw: string;
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: request }],
    });
    raw = message.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
  } catch (err) {
    res.status(502).json({
      error: "De routering is mislukt. Probeer het opnieuw.",
      detail: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseRoutingJson(raw);
  } catch {
    res
      .status(502)
      .json({ error: "Kon het routeringsantwoord niet interpreteren." });
    return;
  }

  const resolve = (
    value: unknown,
    category: string,
  ): RoutingChoice | null => {
    if (typeof value !== "string") return null;
    // The orchestrator routes work; it is never a valid specialist executor.
    if (category === "agent" && value === "agents/orchestrator.md") return null;
    const doc = getDocFile(value);
    return doc && doc.category === category
      ? { path: doc.path, title: doc.title }
      : null;
  };

  const needsClarification = parsed.needsClarification === true;
  const workflow = resolve(parsed.workflowPath, "workflow");
  const agent = resolve(parsed.agentPath, "agent");

  const additionalAgents = Array.isArray(parsed.additionalAgentPaths)
    ? (parsed.additionalAgentPaths
        .map((p) => resolve(p, "agent"))
        .filter((x): x is RoutingChoice => x !== null)
        .filter((x) => x.path !== agent?.path))
    : [];

  // If the model didn't ask for clarification but also failed to name a valid
  // agent, fall back to asking the user rather than guessing.
  if (!needsClarification && !agent) {
    res.json({
      needsClarification: true,
      clarification:
        "Ik kon niet met zekerheid bepalen welke specialist dit moet doen. Kun je de opdracht iets concreter omschrijven?",
      taskType: null,
      reasoning: null,
      workflow: null,
      agent: null,
      additionalAgents: [],
    });
    return;
  }

  res.json({
    needsClarification,
    clarification: needsClarification
      ? asString(parsed.clarification) ??
        "Kun je de opdracht iets concreter omschrijven?"
      : null,
    taskType: typeof parsed.taskType === "string" ? parsed.taskType : null,
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : null,
    workflow,
    agent,
    additionalAgents,
  });
});

export default router;
