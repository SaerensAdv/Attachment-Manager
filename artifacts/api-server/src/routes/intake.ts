import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { getDocFile } from "../lib/docs";
import { loadClientDocs } from "../lib/clients-store";
import {
  buildIntakePrompt,
  parseIntakeJson,
  type IntakeField,
} from "../lib/intake-request";

const router: IRouter = Router();

interface IntakeBody {
  agentPath?: unknown;
  workflowPath?: unknown;
  clientPath?: unknown;
  request?: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

router.post("/intake", async (req, res) => {
  const body = (req.body ?? {}) as IntakeBody;
  const agentPath = asString(body.agentPath);
  const workflowPath = asString(body.workflowPath);
  const clientPath = asString(body.clientPath);
  const request = asString(body.request);

  if (!agentPath || !request) {
    res
      .status(400)
      .json({ error: "agentPath en request zijn verplicht." });
    return;
  }

  const clientDocs = await loadClientDocs();

  const agent = getDocFile(agentPath);
  if (!agent || agent.category !== "agent") {
    res.status(400).json({ error: "Onbekende of ongeldige agent." });
    return;
  }
  // The client is OPTIONAL (internal/agency-general work). Validate only when a
  // client is provided; a present-but-invalid client is still an error.
  if (clientPath) {
    const client = getDocFile(clientPath, clientDocs);
    if (!client || client.category !== "client") {
      res.status(400).json({ error: "Onbekende of ongeldige klant." });
      return;
    }
  }
  if (workflowPath) {
    const workflow = getDocFile(workflowPath);
    if (!workflow || workflow.category !== "workflow") {
      res.status(400).json({ error: "Onbekende of ongeldige workflow." });
      return;
    }
  }

  const system = buildIntakePrompt({
    agentPath,
    workflowPath,
    clientPath: clientPath ?? "",
    extraDocs: clientDocs,
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
      error: "De intake-analyse is mislukt. Probeer het opnieuw.",
      detail: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseIntakeJson(raw);
  } catch {
    res.status(502).json({ error: "Kon het intake-antwoord niet interpreteren." });
    return;
  }

  const fields: IntakeField[] = Array.isArray(parsed.fields)
    ? parsed.fields
        .map((f): IntakeField | null => {
          if (typeof f !== "object" || f === null) return null;
          const obj = f as Record<string, unknown>;
          const key = asString(obj.key);
          const label = asString(obj.label);
          if (!key || !label) return null;
          return {
            key,
            label,
            hint: asString(obj.hint) ?? "",
            example: asString(obj.example) ?? "",
          };
        })
        .filter((x): x is IntakeField => x !== null)
        .slice(0, 5)
    : [];

  res.json({ fields });
});

export default router;
