import { getDocFile, type DocFile } from "./docs";

const GLOBAL_RULES_PATH = "AGENTS.md";

// Knowledge files that always belong in the quality bar, regardless of agent.
const ALWAYS_KNOWLEDGE = [
  "knowledge/agency-principles.md",
  "knowledge/tone-of-voice.md",
  "knowledge/naming-conventions.md",
];

const REFERENCE_RE = /\b(?:templates|knowledge)\/[A-Za-z0-9_-]+\.md\b/g;

export interface GenerationSelection {
  agentPath: string;
  clientPath: string;
  workflowPath: string;
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
  const globalRules = getDocFile(GLOBAL_RULES_PATH);
  const agent = getDocFile(selection.agentPath);
  const client = getDocFile(selection.clientPath);
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

  const systemPrompt = [
    "Je bent een AI-agent binnen het AI-team van Saerens Advertising, een Belgisch Google Ads-bureau.",
    `Je vervult de rol van: ${persona}.`,
    "Je werkt strikt volgens onderstaande projectdocumentatie. Volg ALTIJD de globale regels.",
    "",
    blocks.join("\n\n"),
    "",
    "## Uitvoeringsregels",
    "- Schrijf je output in het Nederlands (Vlaams), tenzij de opdracht expliciet een andere taal vraagt.",
    "- Hanteer de tone-of-voice en kwaliteitsstandaarden hierboven.",
    "- Volg de structuur van het relevante output-template wanneer er een is.",
    "- Lever ALTIJD een concrete, volledige eerste versie. Weiger nooit en vraag niet eerst om meer informatie \u2014 dat is precies wat de menselijke review-stap opvangt.",
    "- Ontbreekt er essenti\u00eble informatie (bv. cijfers, namen, datums)? Maak dan een redelijke aanname en markeer die duidelijk inline met **[AAN TE VULLEN: \u2026]**, en som de aannames kort op in de goedkeuringssectie. Schrijf de versie dus af, ook met onvolledige input.",
    "- Gebruik nette markdown-opmaak (koppen, lijsten, tabellen waar zinvol).",
    "- Sluit ALTIJD af met een sectie '## \u26a0\ufe0f Menselijke goedkeuring vereist' waarin je kort opsomt wat een teamlid moet nakijken vooraleer dit gepubliceerd, verzonden of live gezet wordt. Dit mag nooit weggelaten worden.",
  ].join("\n");

  return { systemPrompt, includedPaths };
}
