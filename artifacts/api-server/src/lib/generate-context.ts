import { getDocFile, type DocFile } from "./docs";

const GLOBAL_RULES_PATH = "AGENTS.md";

// Knowledge files that always belong in the quality bar, regardless of agent.
const ALWAYS_KNOWLEDGE = [
  "knowledge/agency-principles.md",
  "knowledge/tone-of-voice.md",
  "knowledge/naming-conventions.md",
];

const REFERENCE_RE = /\b(?:templates|knowledge)\/[A-Za-z0-9_-]+\.md\b/g;

export interface TeamContext {
  /** Ordered titles of the full team, in execution order. */
  members: string[];
  /** 0-based position of the current agent within the team. */
  position: number;
  /** Concatenated work delivered by colleagues before this agent ("" for the lead). */
  priorWork: string;
  /** Whether this agent is the last in the chain (writes the approval section). */
  isFinal: boolean;
}

export interface GenerationSelection {
  agentPath: string;
  clientPath: string;
  workflowPath: string;
  /** When set (and more than one member), the agent works as part of a team. */
  team?: TeamContext;
  /** Extra docs (e.g. DB-backed clients) merged into doc resolution. */
  extraDocs?: DocFile[];
}

export interface BuiltContext {
  systemPrompt: string;
  includedPaths: string[];
}

function section(heading: string, doc: DocFile | null): string | null {
  if (!doc) return null;
  return `## ${heading}: ${doc.title}\n\n${doc.content.trim()}`;
}

/**
 * Collect template/knowledge paths referenced in the provided documents so the
 * model receives the specific output template and standards it should follow.
 */
function collectReferenced(docs: (DocFile | null)[]): string[] {
  const found = new Set<string>();
  for (const doc of docs) {
    if (!doc) continue;
    const matches = doc.content.match(REFERENCE_RE);
    if (matches) for (const m of matches) found.add(m);
  }
  return [...found];
}

export function buildGenerationContext(
  selection: GenerationSelection,
): BuiltContext {
  const extra = selection.extraDocs ?? [];
  const globalRules = getDocFile(GLOBAL_RULES_PATH);
  const agent = getDocFile(selection.agentPath);
  const client = getDocFile(selection.clientPath, extra);
  const workflow = getDocFile(selection.workflowPath);

  const referencedPaths = collectReferenced([agent, workflow]);
  const knowledgePaths = new Set<string>([...ALWAYS_KNOWLEDGE]);
  const templatePaths = new Set<string>();
  for (const p of referencedPaths) {
    if (p.startsWith("knowledge/")) knowledgePaths.add(p);
    else if (p.startsWith("templates/")) templatePaths.add(p);
  }

  const templateDocs = [...templatePaths].map((p) => getDocFile(p)).filter(
    (d): d is DocFile => d !== null,
  );
  const knowledgeDocs = [...knowledgePaths].map((p) => getDocFile(p)).filter(
    (d): d is DocFile => d !== null,
  );

  const includedPaths: string[] = [];
  const blocks: string[] = [];

  const pushDoc = (heading: string, doc: DocFile | null) => {
    const block = section(heading, doc);
    if (block && doc) {
      blocks.push(block);
      includedPaths.push(doc.path);
    }
  };

  pushDoc("Globale regels", globalRules);
  pushDoc("Jouw rol (agent)", agent);
  pushDoc("Klantcontext", client);
  pushDoc("Workflow", workflow);

  if (templateDocs.length > 0) {
    blocks.push(
      "## Relevante output-templates\n\n" +
        templateDocs
          .map((d) => {
            includedPaths.push(d.path);
            return `### ${d.title}\n\n${d.content.trim()}`;
          })
          .join("\n\n"),
    );
  }

  if (knowledgeDocs.length > 0) {
    blocks.push(
      "## Kwaliteitsstandaarden\n\n" +
        knowledgeDocs
          .map((d) => {
            includedPaths.push(d.path);
            return `### ${d.title}\n\n${d.content.trim()}`;
          })
          .join("\n\n"),
    );
  }

  const persona = agent?.title ?? "een gespecialiseerde agent";

  const team = selection.team;
  const inTeam = !!team && team.members.length > 1;

  // Teamwork framing: who is in the team, where this agent sits, and what
  // colleagues have already delivered. Only the final agent closes with the
  // human-approval section so the deliverable ends with exactly one.
  const teamBlocks: string[] = [];
  if (inTeam && team) {
    const roster = team.members
      .map((title, i) => {
        const marker =
          i === team.position
            ? " \u2190 jij"
            : i < team.position
              ? " (klaar)"
              : "";
        return `${i + 1}. ${title}${marker}`;
      })
      .join("\n");

    teamBlocks.push(
      [
        "## Teamwerk",
        `Je werkt NIET alleen. Dit is een opdracht in teamverband; de teamleden leveren na elkaar hun bijdrage aan \u00e9\u00e9n gezamenlijk eindresultaat. De volgorde:`,
        roster,
        "",
        team.position === 0
          ? "Jij bent het eerste teamlid en zet de richting. Lever jouw specialistische bijdrage; collega's bouwen hierna verder."
          : "Hieronder staat het werk dat je collega's al geleverd hebben. Bouw daarop verder, verwijs ernaar waar nuttig, en HERHAAL niet wat er al staat. Voeg uitsluitend jouw eigen specialistische bijdrage toe.",
        team.priorWork.trim()
          ? `\n### Werk van het team tot nu toe\n\n${team.priorWork.trim()}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  const approvalRule = !inTeam || (team && team.isFinal)
    ? "- Sluit ALTIJD af met een sectie '## Menselijke goedkeuring vereist' waarin je kort opsomt wat een teamlid moet nakijken vooraleer dit gepubliceerd, verzonden of live gezet wordt. Dit mag nooit weggelaten worden."
    : "- Voeg GEEN goedkeuringssectie toe \u2014 een teamlid verderop in de keten sluit het gezamenlijke resultaat af. Lever enkel jouw bijdrage.";

  const teamOutputRule = inTeam
    ? "- Begin je bijdrage met een korte kop die jouw rol benoemt (bv. '## Strategie' of '## Advertentieteksten'), zodat duidelijk is welk teamlid wat leverde."
    : null;

  const systemPrompt = [
    "Je bent een AI-agent binnen het AI-team van Saerens Advertising, een Belgisch Google Ads-bureau.",
    `Je vervult de rol van: ${persona}.`,
    "Je werkt strikt volgens onderstaande projectdocumentatie. Volg ALTIJD de globale regels.",
    "",
    blocks.join("\n\n"),
    inTeam ? "\n" + teamBlocks.join("\n\n") : "",
    "",
    "## Uitvoeringsregels",
    "- Schrijf je output in het Nederlands (Vlaams), tenzij de opdracht expliciet een andere taal vraagt.",
    "- Gebruik NOOIT emoji's of decoratieve symbolen, in geen enkele output (geen \u26a0\ufe0f, \u2705, \uD83D\uDE80, enz.). Hou de toon professioneel en zakelijk.",
    "- Hanteer de tone-of-voice en kwaliteitsstandaarden hierboven.",
    "- Volg de structuur van het relevante output-template wanneer er een is.",
    "- Lever ALTIJD een concrete, volledige eerste versie. Weiger nooit en vraag niet eerst om meer informatie \u2014 dat is precies wat de menselijke review-stap opvangt.",
    "- Ontbreekt er essenti\u00eble informatie (bv. cijfers, namen, datums)? Maak dan een redelijke aanname en markeer die duidelijk inline met **[AAN TE VULLEN: \u2026]**, en som de aannames kort op in de goedkeuringssectie. Schrijf de versie dus af, ook met onvolledige input.",
    "- Gebruik nette markdown-opmaak (koppen, lijsten, tabellen waar zinvol).",
    teamOutputRule,
    approvalRule,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return { systemPrompt, includedPaths };
}
