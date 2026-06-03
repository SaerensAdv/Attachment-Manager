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

/**
 * Strip regions that should not count as prose mentions: fenced code blocks
 * (``` ... ``` or ~~~ ... ~~~), inline code spans (`...`), and heading lines.
 * Removed regions are replaced with blank lines/spaces so surrounding text stays
 * separated and line structure is preserved. This keeps a title that only
 * appears inside an example or code listing from producing a spurious link,
 * while real backtick file references (handled separately) remain untouched.
 */
function stripNonProse(content: string): string {
  // Drop HTML comments (e.g. `<!-- deliverable: replit-prompt -->`) so markers
  // and other comments can never influence mention-edge derivation.
  const lines = content.replace(/<!--[\s\S]*?-->/g, "").split("\n");
  const out: string[] = [];
  let fenceChar: string | null = null;
  let fenceLen = 0;
  for (const line of lines) {
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceChar) {
      out.push("");
      if (fence && fence[1][0] === fenceChar && fence[1].length >= fenceLen) {
        fenceChar = null;
        fenceLen = 0;
      }
      continue;
    }
    if (fence) {
      fenceChar = fence[1][0];
      fenceLen = fence[1].length;
      out.push("");
      continue;
    }
    if (/^\s{0,3}#{1,6}\s/.test(line)) {
      out.push("");
      continue;
    }
    out.push(line.replace(/`[^`]*`/g, " "));
  }
  return out.join("\n");
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
 * One layer of the five-layer model: either a single named file (AGENTS.md) or a
 * whole category of docs (agents, clients, workflows, templates).
 */
type LayerSpec =
  | { kind: "file"; value: string }
  | { kind: "category"; value: string };

/**
 * Parse the ordered layer pipeline out of ARCHITECTURE.md's five-layer model.
 * Each line of the model names the doc(s) that back a layer via a path token
 * (AGENTS.md, agents/, clients/, workflows/, templates/). We walk the text in
 * order and record each layer the first time its token appears, so the sequence
 * mirrors whatever the document declares. Layers with no backing doc (the user
 * request) simply carry no token and are skipped, collapsing the pipeline to its
 * document-backed steps.
 */
function parseLayerOrder(content: string): LayerSpec[] {
  const layers: LayerSpec[] = [];
  const seen = new Set<string>();
  const add = (spec: LayerSpec) => {
    const key = `${spec.kind}:${spec.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      layers.push(spec);
    }
  };
  for (const line of content.split("\n")) {
    let spec: LayerSpec | null = null;
    if (/\bAGENTS\.md\b/.test(line)) spec = { kind: "file", value: "AGENTS.md" };
    else if (/\bagents\//.test(line)) spec = { kind: "category", value: "agent" };
    else if (/\bclients\//.test(line)) spec = { kind: "category", value: "client" };
    else if (/\bworkflows\//.test(line)) spec = { kind: "category", value: "workflow" };
    else if (/\btemplates\//.test(line)) spec = { kind: "category", value: "template" };
    if (spec) add(spec);
  }
  return layers;
}

/**
 * Edge priority: when the same directed pair is produced by more than one pass,
 * keep the most specific/structural relationship. routing (an explicit
 * orchestrator hand-off) ranks highest, then an explicit backtick reference (a
 * real citation), then a generic five-layer flow transition (layer adjacency),
 * and finally an incidental title mention.
 */
const EDGE_PRIORITY: Record<DocEdgeKind, number> = {
  routing: 4,
  reference: 3,
  flow: 2,
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

  // Pass 3: flow edges — the full five-layer pipeline described in
  // ARCHITECTURE.md. The model defines a fixed order of layers, each backed by a
  // file or a category of files (AGENTS.md -> agents/ -> clients/ -> workflows/
  // -> templates/, with the user-request layer carrying no document). We parse
  // that ordering straight from the doc and connect every member of each layer
  // to every member of the next, because ARCHITECTURE explicitly states the
  // layers compose many-to-many ("the same client is reused across many agents
  // and workflows"). Emitting nothing unless the model text is present keeps the
  // relationship derived from content rather than hardcoded.
  const architecture = byId.get("ARCHITECTURE.md");
  if (architecture && /five[- ]layer/i.test(architecture.content)) {
    const layers = parseLayerOrder(architecture.content);
    const membersOf = (layer: LayerSpec): DocFile[] =>
      layer.kind === "file"
        ? byId.has(layer.value)
          ? [byId.get(layer.value)!]
          : []
        : files.filter((f) => f.category === layer.value);
    for (let i = 0; i < layers.length - 1; i++) {
      const upstream = membersOf(layers[i]);
      const downstream = membersOf(layers[i + 1]);
      for (const a of upstream) {
        for (const b of downstream) {
          consider(a.id, b.id, "flow");
        }
      }
    }
  }

  // Pass 4: mention edges where a doc names another doc by its exact title.
  // We search only the prose: fenced code blocks, inline code spans, and
  // headings are stripped first, so a title that appears inside an example or
  // code listing does not create a spurious link. The exact, case-sensitive,
  // word-boundary matching is unchanged, and Pass 1's backtick references run on
  // the raw content so real file references stay intact.
  for (const source of files) {
    const prose = stripNonProse(source.content);
    for (const target of files) {
      if (source.id === target.id) continue;
      if (textMentions(prose, target.title)) {
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

/**
 * Build the documentation graph. Callers may pass `extra` doc files (e.g.
 * DB-backed clients) to merge alongside the filesystem docs; these participate
 * in edge derivation and category counts just like file-backed docs.
 */
export function getDocGraph(extra: DocFile[] = []): DocGraph {
  const files = [...scanFiles(), ...extra];
  const nodes: DocNode[] = files.map(({ content: _content, ...node }) => node);
  return {
    nodes,
    edges: deriveEdges(files),
    categories: buildCategories(files),
  };
}

/**
 * Resolve a single doc by path. `extra` doc files (e.g. DB-backed clients) are
 * searched alongside the filesystem docs, so injected clients resolve here too.
 */
export function getDocFile(path: string, extra: DocFile[] = []): DocFile | null {
  const files = [...scanFiles(), ...extra];
  return files.find((f) => f.id === path) ?? null;
}

/**
 * All doc files (filesystem + any injected `extra` docs), content included.
 * Used by the learning loop to give the model the current state of the docs it
 * is allowed to improve.
 */
export function listDocFiles(extra: DocFile[] = []): DocFile[] {
  return [...scanFiles(), ...extra];
}

/** The absolute documentation root on disk (where AGENTS.md + agents/ live). */
export function getDocsRoot(): string {
  return resolveDocsRoot();
}
