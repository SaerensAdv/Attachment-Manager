import { extractSection, listDocFiles, type DocFile } from "./docs";
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
 * The fixed team hierarchy from AGENTS.md, top to bottom. Each layer lists the
 * agent slugs that belong to it; a member's layer is resolved by slug. New or
 * unknown slugs fall back to the "Overig" layer so the page never hides a head.
 */
const TEAM_LAYERS: (TeamLayer & { slugs: string[] })[] = [
  {
    id: "orchestrator",
    order: 1,
    title: "Orchestrator",
    description:
      "Het instappunt. Leest de aanvraag, kiest de juiste specialist en stelt de briefing op.",
    slugs: ["orchestrator"],
  },
  {
    id: "strategy",
    order: 2,
    title: "Strategie & Kanaal",
    description:
      "Bepalen de strategie per kanaal: waar de kansen liggen en hoe we ze pakken.",
    slugs: ["google-ads-strategist", "meta-ads-strategist", "seo-specialist"],
  },
  {
    id: "execution",
    order: 3,
    title: "Uitvoering",
    description:
      "Zetten goedgekeurde strategie om in concreet, klaar-voor-implementatie werk.",
    slugs: ["google-ads-setup-specialist"],
  },
  {
    id: "review",
    order: 4,
    title: "Review & Optimalisatie",
    description:
      "Analyseren bestaande accounts en sturen bij voor meer rendement.",
    slugs: [
      "google-ads-optimization-specialist",
      "cro-specialist",
      "qa-compliance-reviewer",
    ],
  },
  {
    id: "communication",
    order: 5,
    title: "Communicatie",
    description:
      "Vertalen het werk naar heldere, klantgerichte taal en rapportage.",
    slugs: ["reporting-specialist", "copywriter"],
  },
  {
    id: "build",
    order: 6,
    title: "Build",
    description: "Bouwen goedgekeurde specs om tot werkende assets en pagina's.",
    slugs: ["landing-page-specialist", "web-developer"],
  },
  {
    id: "foundation",
    order: 7,
    title: "Fundament",
    description: "Houden de gedeelde data en meting voor iedereen betrouwbaar.",
    slugs: ["analytics-tracking-specialist", "competitive-research-analyst"],
  },
  {
    id: "growth",
    order: 8,
    title: "Klant & Groei",
    description:
      "Onderhouden de klantrelatie en winnen nieuwe opdrachten binnen.",
    slugs: [
      "client-success-agent",
      "sales-proposal-agent",
      "client-onboarding-agent",
    ],
  },
];

/** Final catch-all layer for slugs not listed in any defined layer. */
const FALLBACK_LAYER: TeamLayer = {
  id: "other",
  order: 99,
  title: "Overig",
  description: "Nog niet ingedeeld in een vaste laag van de hiërarchie.",
};

/** Map every known slug to its layer once, for O(1) lookup per member. */
const LAYER_BY_SLUG = new Map<string, TeamLayer>(
  TEAM_LAYERS.flatMap(({ slugs, ...layer }) =>
    slugs.map((slug): [string, TeamLayer] => [slug, layer]),
  ),
);

function layerForSlug(slug: string): TeamLayer {
  return LAYER_BY_SLUG.get(slug) ?? FALLBACK_LAYER;
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
      layer: layerForSlug(slug),
    };
  });

  members.sort((a, b) => a.title.localeCompare(b.title));
  return members;
}
