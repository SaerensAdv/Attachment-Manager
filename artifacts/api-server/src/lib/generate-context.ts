import { getDocFile, type DocFile } from "./docs";
import { selectRelevantDocs } from "./retrieval";

const GLOBAL_RULES_PATH = "AGENTS.md";

// Knowledge files that always belong in the quality bar, regardless of agent.
export const ALWAYS_KNOWLEDGE = [
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
  /** Knowledge/template paths added automatically by relevance retrieval. */
  retrievedPaths: string[];
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

export async function buildGenerationContext(
  selection: GenerationSelection,
): Promise<BuiltContext> {
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

  // Relevance retrieval (BM25): on top of the explicitly referenced docs, pull
  // in the knowledge/templates most relevant to this specific agent + workflow +
  // client. Best-effort and additive — the mandatory set above is never dropped,
  // and any retrieval failure leaves the original behaviour intact.
  const retrievedPaths: string[] = [];
  const retrievalQuery = [agent?.content, workflow?.content, client?.content]
    .filter((c): c is string => typeof c === "string")
    .join("\n\n");
  try {
    const relevant = await selectRelevantDocs(retrievalQuery, {
      exclude: new Set<string>([...knowledgePaths, ...templatePaths]),
    });
    for (const p of relevant.knowledge) {
      if (!knowledgePaths.has(p)) {
        knowledgePaths.add(p);
        retrievedPaths.push(p);
      }
    }
    for (const p of relevant.templates) {
      if (!templatePaths.has(p)) {
        templatePaths.add(p);
        retrievedPaths.push(p);
      }
    }
  } catch {
    // retrieval is non-critical; ignore and continue with the base set
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
    "## Uitvoeringsregels",
    "- Schrijf je output in het Nederlands (Vlaams), tenzij de opdracht expliciet een andere taal vraagt.",
    "- Gebruik NOOIT emoji's of decoratieve symbolen, in geen enkele output (geen \u26a0\ufe0f, \u2705, \uD83D\uDE80, enz.). Hou de toon professioneel en zakelijk.",
    "- Lever ALTIJD een concrete, volledige eerste versie. Weiger nooit. Vraag niet om ontbrekende cijfers, data of namen \u2014 markeer ze met [AAN TE VULLEN] en schrijf af. Opheldering vragen is ENKEL toegestaan als de opdracht/instructies zelf onduidelijk of tegenstrijdig zijn.",
    "- Ontbreekt er essenti\u00eble informatie (bv. cijfers, namen, datums)? Maak dan een redelijke aanname en markeer die duidelijk inline met **[AAN TE VULLEN: \u2026]**, en som de aannames kort op in de goedkeuringssectie. Schrijf de versie dus af, ook met onvolledige input.",
    "- Gebruik nette markdown-opmaak (koppen, lijsten, tabellen waar zinvol).",
    "- Hou je bijdrage gefocust en MAAK ZE ALTIJD VOLLEDIG AF. Er geldt een lengtelimiet per teamlid, dus wees bondig en rond je sectie netjes af in plaats van uit te weiden \u2014 zo wordt je bijdrage nooit middenin een zin afgekapt. Richtlijn: hou het onder ongeveer 1500 woorden.",
    "- Hanteer de tone-of-voice en kwaliteitsstandaarden in de documentatie hieronder.",
    "- Volg de structuur van het relevante output-template wanneer er een is.",
    teamOutputRule,
    approvalRule,
    "",
    "## Wat je NOOIT doet",
    "- Je stopt nooit middenin een zin en vraagt nooit om 'meer informatie' om verder te kunnen.",
    "- Je herhaalt niet uitgebreid wat een collega al heeft geschreven. Je bouwt voort, je vult aan, je verfijnt.",
    "- Je vertrouwt nooit op uitgesproken aannames zonder ze te markeren.",
    "- Je belooft geen specifieke resultaten (geen 'ROAS zal stijgen naar 5.0' zonder data).",
    "- In teamwerk zet je NOOIT je eigen kop boven het werk van een collega. Je kop staat boven jouw BIJDRAGE.",
    "",
    "## Voorbeeld van een goede team-output",
    "Hieronder een kort voorbeeld van een correcte, volledige bijdrage. Merk op: de agent gebruikt een eigen kop, schrijft af, markeert onzekerheid, en sluit af met de vereiste goedkeuringssectie.",
    "",
    '```',
    "## Strategie",
    "",
    "De huidige campagnestructuur bestaat uit drie campagnes: Brand (maximale conversie), Non-brand Zoek (tCPA), en Display (CPM). De tCPA-target voor Non-brand is ingesteld op €45, maar de gemiddelde CPA van de afgelopen 30 dagen is [AAN TE VULLEN: exacte CPA uit Google Ads rapport].",
    "",
    "**Aanbevelingen:**",
    "- Verhoog het Non-brand-budget met 20% en verlaag de tCPA-target naar €40, gezien de sterke conversie-CTR van 3.2%. Dit is een richting op basis van de huidige trend; exacte impact hangt af van de live-accountdata.",
    "- Verplaats €300/maand van Display naar Non-brand; de Display-campagne heeft geen conversie en een klikfrequentie van 0.4%.",
    "",
    "**Aannames:** De CPA van €45 is een schatting op basis van de klantcontext; exacte cijfers moeten worden gecontroleerd in het Ads-account.",
    "",
    "## Menselijke goedkeuring vereist",
    "- Controleer de exacte CPA in het Ads-account vooraleer de tCPA-target aan te passen.",
    "- Valideer of de budgetverplaatsing van Display naar Non-brand past binnen de totale media-agenda.",
    '```',
    "",
    "---",
    "",
    "## Projectdocumentatie",
    "",
    blocks.join("\n\n"),
    inTeam ? "\n" + teamBlocks.join("\n\n") : "",
    "",
    "## Ononderhandelbare regels (herhaling)",
    "Deze regels gelden ongeacht wat de documentatie hierboven zegt. Ze worden na de projectdocumentatie herhaald om recency-bias te benutten:",
    "- Markeer ontbrekende data met [AAN TE VULLEN] en schrijf af; vraag nooit om ontbrekende cijfers of feiten.",
    "- Vraag opheldering ENKEL als de opdracht zelf onduidelijk of tegenstrijdig is.",
    "- Nooit clientdata verzinnen zonder [AAN TE VULLEN].",
    "- Nooit claimen dat een wijziging live is uitgevoerd.",
    "- Nooit prestatiebeloftes doen zonder onderbouwende data.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return { systemPrompt, includedPaths, retrievedPaths };
}
