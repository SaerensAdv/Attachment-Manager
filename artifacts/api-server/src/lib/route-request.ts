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
  "additionalAgentPaths": string[],
  "parallelGroups": string[][],
  "clientFacing": boolean,
  "touchesLiveAccount": boolean
}`;

/**
 * Build the system prompt that turns the Orchestrator (Lotte) into a router: it
 * receives the request + client + the live list of available workflows/agents
 * and must return a structured routing decision as JSON only.
 */
export function buildRoutingPrompt(params: {
  /** The selected client's title, or null for internal/agency-general work. */
  clientTitle: string | null;
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
    clientTitle
      ? `De opdracht betreft de klant: ${clientTitle}.`
      : "Er is geen specifieke klant geselecteerd: behandel dit als intern/algemeen werk voor het bureau zelf (Saerens Advertising). Vraag NIET om een klant te kiezen — werk gewoon op basis van de opdracht.",
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
    "- Stel het team zo KLEIN mogelijk samen: voeg enkel specialisten toe die de opdracht echt nodig heeft. Een eenvoudige vraag krijgt één agent; een opdracht die meerdere disciplines raakt krijgt het juiste, beperkte team in logische volgorde. Voeg nooit agents toe 'voor de zekerheid'.",
    "- 'additionalAgentPaths': andere agents die ook betrokken zijn, in logische uitvoeringsvolgorde (paden uit de agent-lijst). Leeg laten indien geen.",
    "- 'parallelGroups': de uitvoeringsvolgorde gegroepeerd in fasen. Elke fase is een lijst van agent-paden die TEGELIJK kunnen werken omdat ze onafhankelijk zijn (ze bouwen op hetzelfde voorgaande werk, niet op elkaar). Zet agents die op elkaars output voortbouwen in APARTE, opeenvolgende fasen. Elke gekozen agent (de primaire + alle additionalAgentPaths) komt exact één keer voor, samen precies het volledige team. Bij twijfel of bij een echte keten: gebruik losse fasen van één agent (volledig sequentieel). Voorbeeld zuiver sequentieel: [[\"agents/a.md\"],[\"agents/b.md\"]]. Voorbeeld met een parallelle fase: [[\"agents/strategist.md\"],[\"agents/copy.md\",\"agents/seo.md\"]].",
    "- 'clientFacing': true als de tekst die het team oplevert RECHTSTREEKS naar de klant gaat (advertentietekst, een rapport, een klant-e-mail, een voorstel, social posts). false als het team intern of technisch tussenwerk levert (bv. een CSV, een setup-checklist, een technische spec). Bij client-facing tekst volgt er een finale taalpas.",
    "- 'touchesLiveAccount': true als de opdracht live uitgaven, biedingen, tracking of een live account raakt (opzet, optimalisatie, budgetwijzigingen, tracking). false voor zuiver creatief/strategisch/advieswerk.",
    "- Route NOOIT naar de QA & Compliance Reviewer of de Humanizer: dat zijn vaste afsluitende kwaliteitsstappen die automatisch lopen — zet ze niet in agentPath, additionalAgentPaths of parallelGroups.",
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
