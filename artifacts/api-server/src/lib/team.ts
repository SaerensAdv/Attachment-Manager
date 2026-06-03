import { extractSection, listDocFiles, type DocFile } from "./docs";
import {
  loadPortraitIndex,
  portraitObjectName,
  publicObjectUrl,
  PORTRAIT_THUMB_WIDTH,
  type StyleExample,
} from "./portraits";

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
  styleExamples: StyleExample[];
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
      styleExamples: index.styleExamples.get(slug) ?? [],
    };
  });

  members.sort((a, b) => a.title.localeCompare(b.title));
  return members;
}
