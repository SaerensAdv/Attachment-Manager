import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";

export interface DocNode {
  id: string;
  path: string;
  title: string;
  category: string;
  summary: string | null;
}

export type DocEdgeKind = "reference" | "routing" | "flow" | "mention";

export interface DocEdge {
  source: string;
  target: string;
  kind: DocEdgeKind;
}

export interface DocCategory {
  id: string;
  label: string;
  count: number;
}

export interface DocGraph {
  nodes: DocNode[];
  edges: DocEdge[];
  categories: DocCategory[];
}

export interface DocFile extends DocNode {
  content: string;
}

const CORE_DOCS = ["README.md", "AGENTS.md", "ARCHITECTURE.md", "ROADMAP.md"];

const FOLDER_CATEGORY: Record<string, string> = {
  agents: "agent",
  clients: "client",
  workflows: "workflow",
  templates: "template",
  knowledge: "knowledge",
};

const CATEGORY_ORDER: { id: string; label: string }[] = [
  { id: "core", label: "Core" },
  { id: "agent", label: "Agents" },
  { id: "client", label: "Clients" },
  { id: "workflow", label: "Workflows" },
  { id: "template", label: "Templates" },
  { id: "knowledge", label: "Knowledge" },
];

/**
 * Resolve the documentation root by walking up from the current working
 * directory until a directory contains both `AGENTS.md` and an `agents/`
 * folder. This is robust whether the server runs from the workspace root
 * (production) or from `artifacts/api-server` (development).
 */
function resolveDocsRoot(): string {
  let dir = process.cwd();
  while (true) {
    if (
      existsSync(join(dir, "AGENTS.md")) &&
      existsSync(join(dir, "agents"))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("Could not locate the documentation root");
    }
    dir = parent;
  }
}

function firstTitle(content: string, fallback: string): string {
  const match = content.match(/^#\s+(.+?)\s*$/m);
  return match ? match[1].trim() : fallback;
}

function firstParagraph(content: string): string | null {
  const lines = content.split(/\r?\n/);
  let started = false;
  const collected: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!started) {
      if (line === "" || line.startsWith("#")) continue;
      started = true;
      collected.push(line);
    } else {
      if (line === "" || line.startsWith("#")) break;
      collected.push(line);
    }
  }
  if (collected.length === 0) return null;
  return collected.join(" ");
}

function listMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
}

function scanFiles(): DocFile[] {
  const root = resolveDocsRoot();
  const files: DocFile[] = [];

  const add = (relPath: string, category: string) => {
    const abs = join(root, relPath);
    if (!existsSync(abs)) return;
    const content = readFileSync(abs, "utf8");
    const filename = relPath.split("/").pop() ?? relPath;
    files.push({
      id: relPath,
      path: relPath,
      title: firstTitle(content, filename),
      category,
      summary: firstParagraph(content),
      content,
    });
  };

  for (const core of CORE_DOCS) {
    add(core, "core");
  }

  for (const [folder, category] of Object.entries(FOLDER_CATEGORY)) {
    for (const name of listMarkdown(join(root, folder))) {
      add(`${folder}/${name}`, category);
    }
  }

  return files;
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9]/.test(ch);
}

/**
 * Case-sensitive, word-boundary-aware substring search. Case sensitivity keeps
 * generic all-caps titles like `ARCHITECTURE` from matching lowercase prose.
 */
function textMentions(text: string, title: string): boolean {
  if (title.length === 0) return false;
  let idx = text.indexOf(title);
  while (idx !== -1) {
    const before = idx > 0 ? text[idx - 1] : undefined;
    const after = text[idx + title.length];
    if (!isWordChar(before) && !isWordChar(after)) return true;
    idx = text.indexOf(title, idx + 1);
  }
  return false;
}

/** Extract the body of a `## Heading` section, up to the next `##`/`#` heading. */
function extractSection(content: string, headingMatch: RegExp): string | null {
  const lines = content.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i]) && headingMatch.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return null;
  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join("\n");
}

/**
 * Edge priority: when the same directed pair is produced by more than one pass,
 * keep the most specific/structural relationship. routing (explicit hand-off) and
 * flow (layer pipeline) are derived from dedicated parsers and outrank a generic
 * backtick reference, which in turn outranks an incidental title mention.
 */
const EDGE_PRIORITY: Record<DocEdgeKind, number> = {
  routing: 4,
  flow: 3,
  reference: 2,
  mention: 1,
};

function deriveEdges(files: DocFile[]): DocEdge[] {
  const idSet = new Set(files.map((f) => f.id));
  const byId = new Map(files.map((f) => [f.id, f] as const));
  // Best edge per directed pair, chosen by EDGE_PRIORITY.
  const best = new Map<string, DocEdge>();
  const consider = (source: string, target: string, kind: DocEdgeKind) => {
    if (source === target) return;
    if (!idSet.has(source) || !idSet.has(target)) return;
    const key = `${source}|${target}`;
    const existing = best.get(key);
    if (!existing || EDGE_PRIORITY[kind] > EDGE_PRIORITY[existing.kind]) {
      best.set(key, { source, target, kind });
    }
  };

  const agents = files.filter((f) => f.category === "agent");

  // Pass 1: reference edges from inline backtick file references.
  for (const file of files) {
    const refs = file.content.match(/`([^`]+)`/g) ?? [];
    for (const raw of refs) {
      const ref = raw.slice(1, -1).trim();
      consider(file.id, ref, "reference");
    }
  }

  // Pass 2: routing edges — explicitly parsed from the Orchestrator's routing
  // table. Each "Route to" entry names a specialist by its title; we link the
  // orchestrator to every agent it can hand off to.
  const orchestrator = byId.get("agents/orchestrator.md");
  if (orchestrator) {
    const routing =
      extractSection(orchestrator.content, /Routing\s+guide/i) ??
      orchestrator.content;
    for (const agent of agents) {
      if (agent.id === orchestrator.id) continue;
      if (textMentions(routing, agent.title)) {
        consider(orchestrator.id, agent.id, "routing");
      }
    }
  }

  // Pass 3: flow edges — the five-layer model in ARCHITECTURE.md states that
  // layer 1 (global rules, AGENTS.md) feeds layer 2 (every agent). We only emit
  // these once that model is actually present in the docs, so the relationship
  // stays derived from content rather than hardcoded.
  const architecture = byId.get("ARCHITECTURE.md");
  const agentsConstitution = byId.get("AGENTS.md");
  const describesLayers =
    architecture !== undefined &&
    /five[- ]layer/i.test(architecture.content) &&
    architecture.content.includes("AGENTS.md") &&
    /agents\//.test(architecture.content);
  if (describesLayers && agentsConstitution) {
    for (const agent of agents) {
      consider(agentsConstitution.id, agent.id, "flow");
    }
  }

  // Pass 4: mention edges where a doc names another doc by its exact title.
  for (const source of files) {
    for (const target of files) {
      if (source.id === target.id) continue;
      if (textMentions(source.content, target.title)) {
        consider(source.id, target.id, "mention");
      }
    }
  }

  return [...best.values()];
}

function buildCategories(files: DocFile[]): DocCategory[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    counts.set(file.category, (counts.get(file.category) ?? 0) + 1);
  }
  return CATEGORY_ORDER.filter((c) => counts.has(c.id)).map((c) => ({
    id: c.id,
    label: c.label,
    count: counts.get(c.id) ?? 0,
  }));
}

export function getDocGraph(): DocGraph {
  const files = scanFiles();
  const nodes: DocNode[] = files.map(({ content: _content, ...node }) => node);
  return {
    nodes,
    edges: deriveEdges(files),
    categories: buildCategories(files),
  };
}

export function getDocFile(path: string): DocFile | null {
  const files = scanFiles();
  return files.find((f) => f.id === path) ?? null;
}
