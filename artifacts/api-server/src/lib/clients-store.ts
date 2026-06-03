import { db, clientsTable, type Client } from "@workspace/db";
import { asc } from "drizzle-orm";
import type { DocFile } from "./docs";

/** Path prefix that namespaces DB-backed clients inside the "clients" category. */
export const DB_CLIENT_PREFIX = "clients/db/";

/** Build the synthetic doc path for a persisted client. */
export function dbClientPath(id: number): string {
  return `${DB_CLIENT_PREFIX}${id}.md`;
}

/** True when a doc path points at a DB-backed client. */
export function isDbClientPath(path: string): boolean {
  return path.startsWith(DB_CLIENT_PREFIX);
}

/** Extract the numeric client id from a DB client doc path, or null. */
export function dbClientIdFromPath(path: string): number | null {
  if (!isDbClientPath(path)) return null;
  const raw = path.slice(DB_CLIENT_PREFIX.length).replace(/\.md$/, "");
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function paragraph(label: string, value: string | null): string | null {
  const text = value?.trim();
  if (!text) return null;
  return `## ${label}\n\n${text}`;
}

function codeBlock(label: string, value: string | null): string | null {
  const text = value?.trim();
  if (!text) return null;
  // Use a fence longer than any backtick run in the pasted content, so data
  // that itself contains ``` cannot close the block early and inject markdown.
  const longestRun = Math.max(
    0,
    ...(text.match(/`+/g) ?? []).map((s) => s.length),
  );
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `## ${label}\n\n${fence}\n${text}\n${fence}`;
}

function bullets(label: string, value: string | null): string | null {
  const items = (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (items.length === 0) return null;
  return `## ${label}\n\n${items.map((i) => `- ${i}`).join("\n")}`;
}

/**
 * Render a persisted client into the same markdown shape as
 * `clients/_template.md`, so agents read DB clients exactly like file clients.
 * Empty fields are omitted entirely rather than emitting empty sections.
 */
export function clientToMarkdown(client: Client): string {
  const links: string[] = [];
  if (client.website?.trim()) links.push(`- Website: ${client.website.trim()}`);
  if (client.landingPages?.trim()) {
    links.push(`- Key landing pages: ${client.landingPages.trim()}`);
  }

  const sections: (string | null)[] = [
    `# Client: ${client.name}`,
    paragraph("Business", client.business),
    paragraph("World", client.world),
    bullets("Services / Products", client.services),
    bullets("Target audience", client.audience),
    bullets("Locations", client.locations),
    paragraph("Language(s)", client.languages),
    paragraph("Main goal", client.mainGoal),
    paragraph("Primary conversion action", client.conversionAction),
    paragraph("Target / KPIs", client.kpis),
    paragraph("Budget", client.budget),
    paragraph("Tone of voice", client.toneOfVoice),
    bullets("Current advertising channels", client.channels),
    paragraph("Brand restrictions & important notes", client.restrictions),
    links.length > 0 ? `## Links\n\n${links.join("\n")}` : null,
    paragraph("Current state", client.currentState),
    codeBlock("Google Ads data (current)", client.googleAdsData),
    codeBlock("Search Console / SEO data (current)", client.searchConsoleData),
  ];

  return sections.filter((s): s is string => s !== null).join("\n\n") + "\n";
}

function firstParagraph(content: string): string | null {
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    return line;
  }
  return null;
}

/** Convert a persisted client into a DocFile in the "client" category. */
export function clientToDoc(client: Client): DocFile {
  const content = clientToMarkdown(client);
  const path = dbClientPath(client.id);
  return {
    id: path,
    path,
    title: `Client: ${client.name}`,
    category: "client",
    summary: firstParagraph(content),
    content,
  };
}

/** Load all persisted clients as DocFiles for merging into the doc system. */
export async function loadClientDocs(): Promise<DocFile[]> {
  const rows = await db
    .select()
    .from(clientsTable)
    .orderBy(asc(clientsTable.name));
  return rows.map(clientToDoc);
}
