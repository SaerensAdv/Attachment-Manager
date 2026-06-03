import { extractSection, getDocFile, listDocFiles, type DocFile } from "./docs";
import {
  loadPortraitIndex,
  portraitObjectName,
  publicObjectUrl,
  PORTRAIT_THUMB_WIDTH,
} from "./portraits";

/** The hierarchy layer a team member belongs to, from the AGENTS.md ladder. */
export interface TeamLayer {
  id: string;
  order: number;
  title: string;
  description: string;
}

export interface TeamMember {
  slug: string;
  path: string;
  title: string;
  name: string | null;
  oneLiner: string | null;
  personality: string | null;
  communicationStyle: string | null;
  caresMostAbout: string | null;
  signatureHabit: string | null;
  culturalFitNote: string | null;
  roleSummary: string | null;
  portraitUrl: string | null;
  portraitThumbUrl: string | null;
  layer: TeamLayer;
}

/**
 * The fixed team hierarchy, top to bottom. This array owns only the *display*
 * metadata for each layer — its stable id, order, and Dutch title/description.
 * Which agents belong to each layer is NOT hardcoded here: it is derived from
 * the "Agent Hierarchy" section of AGENTS.md (see {@link layerSlugsFromAgents}),
 * keyed by the layer's `order` matching the numbered hierarchy item. Adding or
 * moving an agent in AGENTS.md therefore re-groups the team page automatically,
 * with no edit to this file.
 */
const TEAM_LAYERS: TeamLayer[] = [
  {
    id: "orchestrator",
    order: 1,
    title: "Orchestrator",
    description:
      "Het instappunt. Leest de aanvraag, kiest de juiste specialist en stelt de briefing op.",
  },
  {
    id: "strategy",
    order: 2,
    title: "Strategie & Kanaal",
    description:
      "Bepalen de strategie per kanaal: waar de kansen liggen en hoe we ze pakken.",
  },
  {
    id: "execution",
    order: 3,
    title: "Uitvoering",
    description:
      "Zetten goedgekeurde strategie om in concreet, klaar-voor-implementatie werk.",
  },
  {
    id: "review",
    order: 4,
    title: "Review & Optimalisatie",
    description:
      "Analyseren bestaande accounts en sturen bij voor meer rendement.",
  },
  {
    id: "communication",
    order: 5,
    title: "Communicatie",
    description:
      "Vertalen het werk naar heldere, klantgerichte taal en rapportage.",
  },
  {
    id: "build",
    order: 6,
    title: "Build",
    description: "Bouwen goedgekeurde specs om tot werkende assets en pagina's.",
  },
  {
    id: "foundation",
    order: 7,
    title: "Fundament",
    description: "Houden de gedeelde data en meting voor iedereen betrouwbaar.",
  },
  {
    id: "growth",
    order: 8,
    title: "Klant & Groei",
    description:
      "Onderhouden de klantrelatie en winnen nieuwe opdrachten binnen.",
  },
];

/** Final catch-all layer for slugs not listed in any defined layer. */
const FALLBACK_LAYER: TeamLayer = {
  id: "other",
  order: 99,
  title: "Overig",
  description: "Nog niet ingedeeld in een vaste laag van de hiërarchie.",
};

/**
 * Parse the "Agent Hierarchy" section of AGENTS.md into a map of hierarchy
 * order (the leading number of each list item) → the agent slugs listed under
 * it. Each numbered item runs until the next numbered item; every
 * `agents/<slug>.md` reference found within it is assigned to that order. This
 * makes AGENTS.md the single source of truth for layer membership.
 */
function layerSlugsFromAgents(agentsContent: string): Map<number, Set<string>> {
  const result = new Map<number, Set<string>>();
  const section = extractSection(agentsContent, /Agent Hierarchy/i);
  if (!section) return result;

  let currentOrder: number | null = null;
  for (const line of section.split(/\r?\n/)) {
    const itemMatch = line.match(/^\s*(\d+)\.\s/);
    if (itemMatch) {
      currentOrder = Number.parseInt(itemMatch[1], 10);
    }
    if (currentOrder === null) continue;
    for (const ref of line.matchAll(/agents\/([a-z0-9-]+)\.md/gi)) {
      const slug = ref[1];
      let set = result.get(currentOrder);
      if (!set) {
        set = new Set<string>();
        result.set(currentOrder, set);
      }
      set.add(slug);
    }
  }
  return result;
}

/**
 * Resolve every agent slug to its layer by joining the Dutch layer metadata in
 * {@link TEAM_LAYERS} (by `order`) with the membership parsed from AGENTS.md.
 * Slugs not listed under any hierarchy item fall back to the "Overig" layer so
 * the page never silently hides an agent.
 */
function buildLayerBySlug(agentsContent: string): Map<string, TeamLayer> {
  const slugsByOrder = layerSlugsFromAgents(agentsContent);
  const bySlug = new Map<string, TeamLayer>();
  for (const layer of TEAM_LAYERS) {
    for (const slug of slugsByOrder.get(layer.order) ?? []) {
      bySlug.set(slug, layer);
    }
  }
  return bySlug;
}

function layerForSlug(
  slug: string,
  layerBySlug: Map<string, TeamLayer>,
): TeamLayer {
  return layerBySlug.get(slug) ?? FALLBACK_LAYER;
}

/** The bullet labels used inside each agent's "Character & personality" list. */
const PERSONA_FIELDS = {
  name: "Name",
  oneLiner: "In a line",
  personality: "Personality",
  communicationStyle: "How they communicate",
  caresMostAbout: "Cares most about",
  signatureHabit: "Signature habit",
  culturalFitNote: "Cultural fit note",
} as const;

type PersonaKey = keyof typeof PERSONA_FIELDS;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pull a single `- **Label:** value` bullet out of the persona section.
 * Returns the trimmed value, or null when the bullet is absent/empty.
 */
function personaBullet(section: string, label: string): string | null {
  const re = new RegExp(
    `^\\s*[-*]\\s*\\*\\*${escapeRegExp(label)}:\\*\\*\\s*(.+?)\\s*$`,
    "im",
  );
  const match = section.match(re);
  return match ? match[1].trim() : null;
}

function parsePersona(content: string): Record<PersonaKey, string | null> {
  const section = extractSection(content, /Character & personality/i) ?? "";
  const result = {} as Record<PersonaKey, string | null>;
  for (const [key, label] of Object.entries(PERSONA_FIELDS) as [
    PersonaKey,
    string,
  ][]) {
    result[key] = personaBullet(section, label);
  }
  return result;
}

/** First non-empty paragraph of the agent's Role section, if present. */
function parseRoleSummary(content: string): string | null {
  const section = extractSection(content, /^#{1,6}\s+Role\b/i);
  if (!section) return null;
  for (const raw of section.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith(">") || line.startsWith("#")) continue;
    return line;
  }
  return null;
}

function slugFromPath(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/, "");
}

/**
 * Build the full team roster from the agent docs, enriched with portrait URLs
 * and generated style examples from object storage.
 */
export async function getTeamRoster(): Promise<TeamMember[]> {
  const agents: DocFile[] = listDocFiles().filter(
    (doc) => doc.category === "agent",
  );
  const agentsDoc = getDocFile("AGENTS.md");
  const layerBySlug = buildLayerBySlug(agentsDoc?.content ?? "");
  const index = await loadPortraitIndex();

  const members = agents.map((doc): TeamMember => {
    const slug = slugFromPath(doc.path);
    const persona = parsePersona(doc.content);
    const hasPortrait = index.portraits.has(slug);
    return {
      slug,
      path: doc.path,
      title: doc.title,
      name: persona.name,
      oneLiner: persona.oneLiner,
      personality: persona.personality,
      communicationStyle: persona.communicationStyle,
      caresMostAbout: persona.caresMostAbout,
      signatureHabit: persona.signatureHabit,
      culturalFitNote: persona.culturalFitNote,
      roleSummary: parseRoleSummary(doc.content),
      portraitUrl: hasPortrait
        ? publicObjectUrl(portraitObjectName(slug))
        : null,
      // Small WebP variant for the roster avatars and round Kaart nodes, so
      // faces appear instantly instead of streaming the full-size portrait.
      portraitThumbUrl: hasPortrait
        ? publicObjectUrl(portraitObjectName(slug), {
            width: PORTRAIT_THUMB_WIDTH,
          })
        : null,
      layer: layerForSlug(slug, layerBySlug),
    };
  });

  members.sort((a, b) => a.title.localeCompare(b.title));
  return members;
}
