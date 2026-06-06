import {
  extractSection,
  getDocFile,
  listDocFiles,
  writeDocFile,
  type DocFile,
} from "./docs";
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
  head: TeamLayer;
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
 * The leadership "heads" — the *reporting line* layer (who answers to whom),
 * separate from the function-based {@link TEAM_LAYERS}. Like the layers, this
 * array owns only the Dutch display metadata; which agent reports to which head
 * is derived from the "Leadership & reporting line" section of AGENTS.md (see
 * {@link headSlugsFromAgents}), keyed by the numbered item matching `order`.
 */
const TEAM_HEADS: TeamLayer[] = [
  {
    id: "direction",
    order: 0,
    title: "Directie & orchestratie",
    description:
      "De rechterhand van de CEO. Leest elke aanvraag, routeert ze en stelt de briefing op — boven de heads.",
  },
  {
    id: "paid-media",
    order: 1,
    title: "Paid Media",
    description:
      "Betaalde acquisitie over Google en Meta, onder leiding van de Head of Paid Media.",
  },
  {
    id: "seo-web",
    order: 2,
    title: "SEO & Web",
    description:
      "Organische zichtbaarheid, de website, conversie en meting, onder leiding van de Head of SEO & Web.",
  },
  {
    id: "content-creative",
    order: 3,
    title: "Content & Creatie",
    description:
      "Boodschap, copy en een natuurlijke klantklare stem, onder leiding van de Head of Content & Creative.",
  },
  {
    id: "client-growth",
    order: 4,
    title: "Klant & Groei",
    description:
      "De klantrelatie, nieuwe opdrachten en marktinzicht, onder leiding van de Head of Client & Growth.",
  },
  {
    id: "quality",
    order: 5,
    title: "Kwaliteit & Compliance",
    description:
      "Overkoepelende kwaliteitspoort die elke head bedient en rechtstreeks aan de Orchestrator rapporteert.",
  },
];

/** Catch-all head for slugs not assigned to any head in AGENTS.md. */
const FALLBACK_HEAD: TeamLayer = {
  id: "head-other",
  order: 98,
  title: "Nog geen rapportagelijn",
  description: "Nog niet toegewezen aan een head in de rapportagelijn.",
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
 * Every agent slug explicitly placed under a numbered item in the AGENTS.md
 * "Agent Hierarchy" section, flattened across all layers. Doc validation uses
 * this to spot agents that were never assigned a layer (and would silently fall
 * into the "Overig" catch-all).
 */
export function hierarchySlugs(agentsContent: string): Set<string> {
  const all = new Set<string>();
  for (const set of layerSlugsFromAgents(agentsContent).values()) {
    for (const slug of set) all.add(slug);
  }
  return all;
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

/**
 * Parse the "Leadership & reporting line" section of AGENTS.md the same way as
 * the hierarchy: each numbered item (its leading number = a head's `order`)
 * lists the `agents/<slug>.md` that report to that head. This makes AGENTS.md
 * the single source of truth for the reporting line too.
 */
function headSlugsFromAgents(agentsContent: string): Map<number, Set<string>> {
  const result = new Map<number, Set<string>>();
  const section = extractSection(agentsContent, /Leadership & reporting line/i);
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
 * Every agent slug placed under a numbered item in the AGENTS.md "Leadership &
 * reporting line" section, flattened across all heads. Doc validation uses this
 * to spot agents that were never given a head (and would silently fall into the
 * "Nog geen rapportagelijn" catch-all).
 */
export function headSlugs(agentsContent: string): Set<string> {
  const all = new Set<string>();
  for (const set of headSlugsFromAgents(agentsContent).values()) {
    for (const slug of set) all.add(slug);
  }
  return all;
}

/** Resolve every agent slug to the head it reports to (display + reporting line). */
function buildHeadBySlug(agentsContent: string): Map<string, TeamLayer> {
  const slugsByOrder = headSlugsFromAgents(agentsContent);
  const bySlug = new Map<string, TeamLayer>();
  for (const head of TEAM_HEADS) {
    for (const slug of slugsByOrder.get(head.order) ?? []) {
      bySlug.set(slug, head);
    }
  }
  return bySlug;
}

function headForSlug(
  slug: string,
  headBySlug: Map<string, TeamLayer>,
): TeamLayer {
  return headBySlug.get(slug) ?? FALLBACK_HEAD;
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
  const headBySlug = buildHeadBySlug(agentsDoc?.content ?? "");
  const index = await loadPortraitIndex();

  const members = agents.map((doc): TeamMember => {
    const slug = slugFromPath(doc.path);
    const persona = parsePersona(doc.content);
    const hasPortrait = index.portraits.has(slug);
    const version = index.portraits.get(slug) || undefined;
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
        ? publicObjectUrl(portraitObjectName(slug), { version })
        : null,
      // Small WebP variant for the roster avatars and round Kaart nodes, so
      // faces appear instantly instead of streaming the full-size portrait.
      portraitThumbUrl: hasPortrait
        ? publicObjectUrl(portraitObjectName(slug), {
            width: PORTRAIT_THUMB_WIDTH,
            version,
          })
        : null,
      layer: layerForSlug(slug, layerBySlug),
      head: headForSlug(slug, headBySlug),
    };
  });

  members.sort((a, b) => a.title.localeCompare(b.title));
  return members;
}

/** The editable persona fields, all sent on every save (empty = cleared). */
export type PersonaEdits = Record<PersonaKey, string> & { roleSummary: string };

const HEADING_LINE = /^#{1,6}\s/;
const BULLET_LINE = /^\s*[-*]\s+/;

/**
 * Locate the body line range of a markdown section (the lines after its heading,
 * up to the next heading). Returns null when no matching heading exists.
 */
function findSectionBody(
  lines: string[],
  headingMatch: RegExp,
): { start: number; end: number } | null {
  let heading = -1;
  for (let i = 0; i < lines.length; i++) {
    if (HEADING_LINE.test(lines[i]) && headingMatch.test(lines[i])) {
      heading = i;
      break;
    }
  }
  if (heading === -1) return null;
  let end = lines.length;
  for (let i = heading + 1; i < lines.length; i++) {
    if (HEADING_LINE.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start: heading + 1, end };
}

/** A `- **Label:** value` bullet matcher; group 1 captures the prefix. */
function bulletPrefixRegex(label: string): RegExp {
  return new RegExp(
    `^(\\s*[-*]\\s*\\*\\*${escapeRegExp(label)}:\\*\\*\\s*).*$`,
    "i",
  );
}

/**
 * Apply persona edits to the bullet lines of the "Character & personality"
 * section body: a non-empty value upserts its bullet (in PERSONA_FIELDS order
 * when newly inserted), an empty value removes it.
 */
function applyPersonaBullets(bodyLines: string[], edits: PersonaEdits): string[] {
  const out = [...bodyLines];
  for (const [key, label] of Object.entries(PERSONA_FIELDS) as [
    PersonaKey,
    string,
  ][]) {
    const value = (edits[key] ?? "").trim();
    const re = bulletPrefixRegex(label);
    const idx = out.findIndex((line) => re.test(line));
    if (idx !== -1) {
      if (value) {
        // Function replacement so `$` in the value isn't treated specially.
        out[idx] = out[idx].replace(re, (_m, prefix: string) => prefix + value);
      } else {
        out.splice(idx, 1);
      }
    } else if (value) {
      let lastBullet = -1;
      for (let i = 0; i < out.length; i++) {
        if (BULLET_LINE.test(out[i])) lastBullet = i;
      }
      out.splice(lastBullet + 1, 0, `- **${label}:** ${value}`);
    }
  }
  return out;
}

/** Build fresh persona bullets (used when the section doesn't exist yet). */
function personaBulletsFor(edits: PersonaEdits): string[] {
  const bullets: string[] = [];
  for (const [key, label] of Object.entries(PERSONA_FIELDS) as [
    PersonaKey,
    string,
  ][]) {
    const value = (edits[key] ?? "").trim();
    if (value) bullets.push(`- **${label}:** ${value}`);
  }
  return bullets;
}

/**
 * Replace the first prose paragraph of the Role section with `value`. Leaves the
 * document untouched when the value is empty (so clearing the field never
 * deletes prose) or when there is no Role section to edit.
 */
function applyRoleSummary(lines: string[], value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return lines;
  const bounds = findSectionBody(lines, /^#{1,6}\s+Role\b/i);
  if (!bounds) return lines;
  const out = [...lines];
  for (let i = bounds.start; i < bounds.end; i++) {
    const t = out[i].trim();
    if (t === "" || t.startsWith(">") || t.startsWith("#")) continue;
    out[i] = trimmed;
    return out;
  }
  out.splice(bounds.start, 0, trimmed, "");
  return out;
}

/**
 * Persist edited persona text back to the agent's markdown and return the
 * refreshed team member. Returns null when no agent exists for the slug (or the
 * write is rejected). Editing is surgical: only the targeted bullets and the
 * Role paragraph change; the rest of the document is preserved verbatim.
 */
export async function updateAgentPersona(
  slug: string,
  edits: PersonaEdits,
): Promise<TeamMember | null> {
  const path = `agents/${slug}.md`;
  const doc = getDocFile(path);
  if (!doc) return null;

  let lines = doc.content.split("\n");
  const personaBounds = findSectionBody(lines, /Character & personality/i);
  if (personaBounds) {
    const body = lines.slice(personaBounds.start, personaBounds.end);
    const newBody = applyPersonaBullets(body, edits);
    lines = [
      ...lines.slice(0, personaBounds.start),
      ...newBody,
      ...lines.slice(personaBounds.end),
    ];
  } else {
    const bullets = personaBulletsFor(edits);
    if (bullets.length > 0) {
      lines = [...lines, "", "## Character & personality", "", ...bullets];
    }
  }

  lines = applyRoleSummary(lines, edits.roleSummary);

  // Skip the write when nothing actually changed, so a no-op save never bumps
  // the file or invalidates doc caches needlessly.
  const next = lines.join("\n");
  if (next !== doc.content) {
    const updated = writeDocFile(path, next);
    if (!updated) return null;
  }

  const roster = await getTeamRoster();
  return roster.find((m) => m.slug === slug) ?? null;
}
