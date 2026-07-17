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

/** The kind of agency layer a department belongs to. */
export type DepartmentKind = "direction" | "delivery" | "client" | "quality";

/**
 * A department in the agency org model, parsed from the "Agency organisation"
 * section of AGENTS.md. This is the single grouping model for the team — it
 * replaces the old, overlapping function-layer + reporting-head taxonomies.
 *
 * The {@link TEAM_DEPARTMENTS} array below owns only the *display + structural*
 * metadata (Dutch title/description, the agency `kind`, and the handoff
 * topology). Which agents belong to a department, and who owns it, is derived
 * from AGENTS.md (see {@link parseAgencyOrg}), keyed by the department's `order`
 * matching the numbered item. Moving an agent in AGENTS.md therefore re-groups
 * the team page and the system map automatically, with no edit to this file.
 */
export interface TeamDepartment {
  id: string;
  order: number;
  title: string;
  kind: DepartmentKind;
  description: string;
  /** Slug of the department's owner (head), or null when none is named. */
  ownerSlug: string | null;
  /** Department ids this department hands briefs / finished work to. */
  handsTo: string[];
  /** Department ids this department receives work from (inverse of handsTo). */
  receivesFrom: string[];
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
  /** The single department this member belongs to (the one org model). */
  department: TeamDepartment;
  /** True when this member is their department's owner (head). */
  isOwner: boolean;
  /**
   * Agent lifecycle flag (from the doc's frontmatter). false means the agent is
   * paused: excluded from routing and greyed/hidden in the picker, but still
   * shown on the team page. Defaults to true.
   */
  active: boolean;
}

/**
 * Display + structural metadata per department. The `handsTo` lists encode the
 * inter-department handoff topology the system map draws; `receivesFrom` is
 * derived as its inverse so the two can never drift. Membership and owner are
 * NOT hardcoded here — they come from AGENTS.md.
 */
interface DepartmentMeta {
  id: string;
  order: number;
  kind: DepartmentKind;
  title: string;
  description: string;
  handsTo: string[];
}

const TEAM_DEPARTMENTS: DepartmentMeta[] = [
  {
    id: "direction",
    order: 0,
    kind: "direction",
    title: "Directie & orchestratie",
    description:
      "De rechterhand van de CEO. Leest elke aanvraag, routeert ze en stelt de briefing op — boven alle afdelingen.",
    handsTo: ["client-growth", "paid-media", "seo-web", "content-creative"],
  },
  {
    id: "paid-media",
    order: 1,
    kind: "delivery",
    title: "Paid Media",
    description:
      "Betaalde acquisitie over Google en Meta, onder leiding van de Head of Paid Media.",
    handsTo: ["quality", "client-growth"],
  },
  {
    id: "seo-web",
    order: 2,
    kind: "delivery",
    title: "SEO & Web",
    description:
      "Organische zichtbaarheid, de website, conversie en meting, onder leiding van de Head of SEO & Web.",
    handsTo: ["quality", "client-growth"],
  },
  {
    id: "content-creative",
    order: 3,
    kind: "delivery",
    title: "Content & Creatie",
    description:
      "Merk, boodschap, copy en een natuurlijke klantklare stem, onder leiding van de Head of Content & Creative.",
    handsTo: ["quality", "client-growth"],
  },
  {
    id: "client-growth",
    order: 4,
    kind: "client",
    title: "Klant & Groei",
    description:
      "De klantrelatie, klantrapportage, nieuwe opdrachten en marktinzicht, onder leiding van de Head of Client & Growth.",
    handsTo: ["paid-media", "seo-web", "content-creative"],
  },
  {
    id: "quality",
    order: 5,
    kind: "quality",
    title: "Kwaliteit & Compliance",
    description:
      "Overkoepelende kwaliteitspoort die elke afdeling bedient en rechtstreeks aan de Orchestrator rapporteert.",
    handsTo: ["direction"],
  },
];

/** Catch-all department for slugs not placed under any department in AGENTS.md. */
const FALLBACK_DEPARTMENT: TeamDepartment = {
  id: "other",
  order: 99,
  kind: "delivery",
  title: "Overig",
  description: "Nog niet ingedeeld in een afdeling van de organisatie.",
  ownerSlug: null,
  handsTo: [],
  receivesFrom: [],
};

const AGENCY_SECTION_RE = /Agency organisation/i;

/**
 * Parse the "Agency organisation" section of AGENTS.md into membership (which
 * agent slugs are listed under each numbered department) and ownership (the
 * slug named on each department's "Owner:" line). Each numbered item runs until
 * the next numbered item; every `agents/<slug>.md` reference found within it is
 * a member of that department. This makes AGENTS.md the single source of truth
 * for both grouping and ownership.
 */
function parseAgencyOrg(agentsContent: string): {
  membersByOrder: Map<number, Set<string>>;
  ownerByOrder: Map<number, string>;
} {
  const membersByOrder = new Map<number, Set<string>>();
  const ownerByOrder = new Map<number, string>();
  const section = extractSection(agentsContent, AGENCY_SECTION_RE);
  if (!section) return { membersByOrder, ownerByOrder };

  let currentOrder: number | null = null;
  for (const line of section.split(/\r?\n/)) {
    const itemMatch = line.match(/^\s*(\d+)\.\s/);
    if (itemMatch) currentOrder = Number.parseInt(itemMatch[1], 10);
    if (currentOrder === null) continue;

    const refs = [...line.matchAll(/agents\/([a-z0-9-]+)\.md/gi)].map(
      (m) => m[1],
    );
    if (refs.length === 0) continue;

    // The "Owner:" bullet names the department's head (first ref wins).
    if (/^\s*[-*]\s*owner\s*:/i.test(line) && !ownerByOrder.has(currentOrder)) {
      ownerByOrder.set(currentOrder, refs[0]);
    }

    let set = membersByOrder.get(currentOrder);
    if (!set) {
      set = new Set<string>();
      membersByOrder.set(currentOrder, set);
    }
    for (const slug of refs) set.add(slug);
  }
  return { membersByOrder, ownerByOrder };
}

/** id -> fixed order, for sorting derived department-id lists deterministically. */
const ORDER_BY_ID = new Map(TEAM_DEPARTMENTS.map((d) => [d.id, d.order]));
const orderOfId = (id: string) => ORDER_BY_ID.get(id) ?? 99;

/**
 * The full set of departments, joining the Dutch display + structural metadata
 * in {@link TEAM_DEPARTMENTS} with the owner parsed from AGENTS.md, and with
 * `receivesFrom` derived as the inverse of every department's `handsTo`.
 */
export function getDepartments(agentsContent: string): TeamDepartment[] {
  const { ownerByOrder } = parseAgencyOrg(agentsContent);

  const receives = new Map<string, Set<string>>();
  for (const d of TEAM_DEPARTMENTS) {
    for (const target of d.handsTo) {
      let set = receives.get(target);
      if (!set) {
        set = new Set<string>();
        receives.set(target, set);
      }
      set.add(d.id);
    }
  }

  return TEAM_DEPARTMENTS.map((d) => ({
    id: d.id,
    order: d.order,
    kind: d.kind,
    title: d.title,
    description: d.description,
    ownerSlug: ownerByOrder.get(d.order) ?? null,
    handsTo: d.handsTo,
    receivesFrom: [...(receives.get(d.id) ?? [])].sort(
      (a, b) => orderOfId(a) - orderOfId(b),
    ),
  }));
}

/**
 * Every agent slug placed under a numbered item in the "Agency organisation"
 * section, flattened across all departments. Doc validation uses this to spot
 * agents that were never assigned a department (and would silently fall into
 * the "Overig" catch-all).
 */
export function departmentSlugs(agentsContent: string): Set<string> {
  const all = new Set<string>();
  for (const set of parseAgencyOrg(agentsContent).membersByOrder.values()) {
    for (const slug of set) all.add(slug);
  }
  return all;
}

/** Resolve every agent slug to its department by joining metadata with AGENTS.md. */
function buildDepartmentBySlug(
  agentsContent: string,
  departments: TeamDepartment[],
): Map<string, TeamDepartment> {
  const { membersByOrder } = parseAgencyOrg(agentsContent);
  const byOrder = new Map(departments.map((d) => [d.order, d]));
  const bySlug = new Map<string, TeamDepartment>();
  for (const [order, slugs] of membersByOrder) {
    const dept = byOrder.get(order);
    if (!dept) continue;
    for (const slug of slugs) bySlug.set(slug, dept);
  }
  return bySlug;
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

/** The agency departments, resolved from AGENTS.md (display + handoff topology). */
export function getTeamDepartments(): TeamDepartment[] {
  const agentsDoc = getDocFile("AGENTS.md");
  return getDepartments(agentsDoc?.content ?? "");
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
  const departments = getDepartments(agentsDoc?.content ?? "");
  const departmentBySlug = buildDepartmentBySlug(
    agentsDoc?.content ?? "",
    departments,
  );
  const index = await loadPortraitIndex();

  const members = agents.map((doc): TeamMember => {
    const slug = slugFromPath(doc.path);
    const persona = parsePersona(doc.content);
    const hasPortrait = index.portraits.has(slug);
    const version = index.portraits.get(slug) || undefined;
    const department = departmentBySlug.get(slug) ?? FALLBACK_DEPARTMENT;
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
      department,
      isOwner: department.ownerSlug === slug,
      active: doc.active,
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
