import { getDocFile, type DocNode } from "./docs";

export interface RoutingChoice {
  path: string;
  title: string;
}

/** The JSON shape we ask the routing model to return. */
export const ROUTING_SCHEMA_HINT = `{
  "needsClarification": boolean,
  "clarification": string | null,
  "taskType": string | null,
  "reasoning": string,
  "workflowPath": string | null,
  "agentPath": string | null,
  "additionalAgentPaths": string[]
}`;

/**
 * Build the system prompt that turns the Orchestrator (Lotte) into a router: it
 * receives the request + client + the live list of available workflows/agents
 * and must return a structured routing decision as JSON only.
 */
export function buildRoutingPrompt(params: {
  clientTitle: string;
  workflows: DocNode[];
  agents: DocNode[];
}): string {
  const { clientTitle, workflows, agents } = params;
  const orchestrator = getDocFile("agents/orchestrator.md");

  const fmt = (n: DocNode) =>
    `- ${n.path} — "${n.title}"${n.summary ? ` — ${n.summary}` : ""}`;

  return [
    "Je bent Lotte, de Orchestrator van het AI-team van Saerens Advertising (een Belgisch Google Ads-bureau).",
    "Je taak: lees de opdracht van de gebruiker en bepaal welke workflow en welke primaire specialist-agent de opdracht moeten uitvoeren.",
    `De opdracht betreft de klant: ${clientTitle}.`,
    "",
    "## Routing-gids van de Orchestrator",
    orchestrator ? orchestrator.content.trim() : "(niet beschikbaar)",
    "",
    "## Beschikbare workflows",
    "Kies 'workflowPath' exact uit deze lijst (of null als echt geen enkele past):",
    workflows.length > 0 ? workflows.map(fmt).join("\n") : "(geen)",
    "",
    "## Beschikbare agents",
    "Kies 'agentPath' exact uit deze lijst:",
    agents.length > 0 ? agents.map(fmt).join("\n") : "(geen)",
    "",
    "## Regels",
    "- Kies de meest geschikte primaire agent en, indien van toepassing, een passende workflow.",
    "- 'additionalAgentPaths': andere agents die mogelijk ook betrokken zijn bij deze opdracht, in logische volgorde (paden uit de agent-lijst). Leeg laten indien geen.",
    "- BELANGRIJK over verduidelijking: 'needsClarification' mag ENKEL true zijn wanneer je niet kunt bepalen welk soort werk dit is of welke specialist/workflow erbij hoort (de AARD van de opdracht is onduidelijk).",
    "- Ontbrekende inhoudelijke gegevens (cijfers, namen, USP's, landingspagina, datums, budgetten) zijn GEEN reden voor verduidelijking. De gekozen specialist schrijft sowieso een volledige eerste versie en markeert ontbrekende data zelf met [AAN TE VULLEN: …]. Zet in dat geval 'needsClarification' op false en kies gewoon de juiste agent en workflow.",
    "- Vraag dus nooit om data of context als je het type werk wél herkent — route gewoon door.",
    "- 'reasoning': één korte zin in het Nederlands die je keuze motiveert.",
    "- 'taskType': korte classificatie (bv. strategie, opzet, optimalisatie, rapportage, copy, communicatie, seo).",
    "- Gebruik uitsluitend paden die exact in de lijsten hierboven voorkomen.",
    "",
    "Antwoord met UITSLUITEND geldige JSON volgens dit schema, zonder extra tekst of markdown:",
    ROUTING_SCHEMA_HINT,
  ].join("\n");
}

/** Tolerantly extract the JSON object from a model response. */
export function parseRoutingJson(text: string): Record<string, unknown> {
  const stripped = text.replace(/```(?:json)?/gi, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Geen JSON gevonden in routeringsantwoord.");
  }
  return JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
}
