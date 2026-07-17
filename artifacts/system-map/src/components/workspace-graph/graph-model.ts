// Pure, framework-free model helpers for the Workspace Graph (Fase 3.5 §7).
//
// Everything that maps the normalized backend contract (GraphNode / GraphEdge /
// GraphMeta) onto the viewer's visual + interaction language lives here so it can
// be unit-tested without a DOM: which filter group a node belongs to, which colour
// family + glyph it draws with, how incoming neighbours merge into the live view,
// and how the cache meta collapses into a single UI state. The canvas and page
// components stay thin renderers over these decisions.

import {
  Boxes,
  LayoutGrid,
  Folder,
  List,
  SquareCheck,
  FileText,
  File,
  BookOpen,
  Bot,
  Workflow as WorkflowIcon,
  Play,
  Plug,
  Building2,
  type LucideIcon,
} from "lucide-react";
import {
  GraphNodeSourceType,
  GraphEdgeRelation,
  type GraphNode,
  type GraphEdge,
  type GraphMeta,
} from "@workspace/api-client-react";

// ---------------------------------------------------------------------------
// Filter groups (§7.6) — the five legend toggles. A group controls VISIBILITY
// only; it is deliberately independent of a node's colour family (a single group
// like "Actief werk" holds several colours, e.g. task/client/run). Every one of
// the 13 sourceTypes maps to exactly one group (enforced by a unit test).
// ---------------------------------------------------------------------------
export type FilterGroupId =
  | "structure"
  | "knowledge"
  | "agents"
  | "active"
  | "flows";

export interface FilterGroup {
  id: FilterGroupId;
  label: string;
  help: string;
}

export const FILTER_GROUPS: readonly FilterGroup[] = [
  { id: "structure", label: "Structuur", help: "Workspace, spaces, folders en lijsten" },
  { id: "knowledge", label: "Kennis", help: "Docs, pagina's en SOP's" },
  { id: "agents", label: "Agents", help: "Agents en workflows" },
  { id: "active", label: "Actief werk", help: "Taken, klanten en runs" },
  { id: "flows", label: "Live-flows", help: "Integraties en live datastromen" },
] as const;

export const SOURCE_TYPE_GROUP: Record<GraphNode["sourceType"], FilterGroupId> = {
  workspace: "structure",
  space: "structure",
  folder: "structure",
  list: "structure",
  doc: "knowledge",
  page: "knowledge",
  sop: "knowledge",
  agent: "agents",
  workflow: "agents",
  task: "active",
  client: "active",
  run: "active",
  integration: "flows",
};

export const groupForNode = (node: Pick<GraphNode, "sourceType">): FilterGroupId =>
  SOURCE_TYPE_GROUP[node.sourceType];

// ---------------------------------------------------------------------------
// Colour families (§7.6 visual language). Colour is NEVER the sole carrier — a
// per-sourceType glyph and the always-available Dutch type label carry the same
// information — so this is one of three redundant encodings.
//   cyan   = ClickUp structure (workspace/space/folder/list/task)
//   blue   = Docs & versioned knowledge (doc/page/sop)
//   orange = agents, workflows & execution (agent/workflow/run/integration)
//   magenta= client records (kept distinct from the tasks/runs beside them)
// Green (healthy live flow) and red (broken relation / error) are EDGE colours,
// never node colours.
// ---------------------------------------------------------------------------
export type NodeFamily = "structure" | "knowledge" | "execution" | "client";

export const SOURCE_TYPE_FAMILY: Record<GraphNode["sourceType"], NodeFamily> = {
  workspace: "structure",
  space: "structure",
  folder: "structure",
  list: "structure",
  task: "structure",
  doc: "knowledge",
  page: "knowledge",
  sop: "knowledge",
  agent: "execution",
  workflow: "execution",
  run: "execution",
  integration: "execution",
  client: "client",
};

const FAMILY_COLOR_VAR: Record<NodeFamily, string> = {
  structure: "--wg-structure",
  knowledge: "--wg-knowledge",
  execution: "--wg-execution",
  client: "--wg-client",
};

export const familyForNode = (node: Pick<GraphNode, "sourceType">): NodeFamily =>
  SOURCE_TYPE_FAMILY[node.sourceType];

/** CSS colour for a node, resolved against the dark graph wrapper's tokens. */
export const nodeColorVar = (node: Pick<GraphNode, "sourceType">): string =>
  `hsl(var(${FAMILY_COLOR_VAR[familyForNode(node)]}))`;

// ---------------------------------------------------------------------------
// Glyphs + human labels (Dutch). The glyph is a second encoding of type; the
// label is the third (and works at any zoom in the detail panel + legend).
// ---------------------------------------------------------------------------
export const SOURCE_TYPE_ICON: Record<GraphNode["sourceType"], LucideIcon> = {
  workspace: Boxes,
  space: LayoutGrid,
  folder: Folder,
  list: List,
  task: SquareCheck,
  doc: FileText,
  page: File,
  sop: BookOpen,
  agent: Bot,
  workflow: WorkflowIcon,
  run: Play,
  integration: Plug,
  client: Building2,
};

export const SOURCE_TYPE_LABEL: Record<GraphNode["sourceType"], string> = {
  workspace: "Werkruimte",
  space: "Space",
  folder: "Map",
  list: "Lijst",
  task: "Taak",
  doc: "Document",
  page: "Pagina",
  agent: "Agent",
  workflow: "Workflow",
  sop: "SOP",
  client: "Klant",
  integration: "Integratie",
  run: "Run",
};

export const SOURCE_LABEL: Record<GraphNode["source"], string> = {
  clickup: "ClickUp",
  github: "Repository",
  replit: "App",
};

// ---------------------------------------------------------------------------
// Relations (§7.4). Live-flow relations are the data streams that get green
// (healthy) / red (broken) treatment and are gated by the "Live-flows" filter.
// ---------------------------------------------------------------------------
export const RELATION_LABEL: Record<GraphEdge["relation"], string> = {
  contains: "bevat",
  references: "verwijst naar",
  assigned_to: "toegewezen aan",
  governed_by: "gestuurd door",
  executes: "voert uit",
  reads_from: "leest uit",
  writes_to: "schrijft naar",
  generated: "genereerde",
  approved_by: "goedgekeurd door",
  related_to: "gerelateerd aan",
};

export const FLOW_RELATIONS: readonly GraphEdge["relation"][] = [
  "reads_from",
  "writes_to",
  "generated",
];

export const isFlowRelation = (relation: GraphEdge["relation"]): boolean =>
  FLOW_RELATIONS.includes(relation);

/**
 * Edge colour, resolved against the dark wrapper's tokens.
 *   red   — a broken/failed relation (active === false) — reserved for errors;
 *   green — a healthy live data stream;
 *   neutral — structural / reference / routing wiring.
 */
export const edgeColorVar = (edge: Pick<GraphEdge, "relation" | "active">): string => {
  if (edge.active === false) return "hsl(var(--wg-error))";
  if (isFlowRelation(edge.relation)) return "hsl(var(--wg-flow))";
  return "hsl(var(--wg-edge))";
};

/** A dashed edge reads as "weaker" wiring (mentions/references) at a glance. */
export const edgeIsWeak = (relation: GraphEdge["relation"]): boolean =>
  relation === "references";

// ---------------------------------------------------------------------------
// View-model merge (progressive disclosure §7.5). The live view is the overview
// UNION every expanded neighbourhood. Backend ids are stable
// (nodes: `{source}:{sourceType}:{rawId}`, edges: `{relation}:{src}->{tgt}`), so
// a plain id-keyed merge dedupes safely and never thrashes existing entries.
// ---------------------------------------------------------------------------
export const indexById = <T extends { id: string }>(items: readonly T[]): Map<string, T> => {
  const map = new Map<string, T>();
  for (const item of items) map.set(item.id, item);
  return map;
};

export const mergeById = <T extends { id: string }>(
  existing: ReadonlyMap<string, T>,
  incoming: readonly T[],
): Map<string, T> => {
  const next = new Map(existing);
  for (const item of incoming) next.set(item.id, { ...next.get(item.id), ...item });
  return next;
};

/** Edges are drawable only when BOTH endpoints are present in the visible set. */
export const drawableEdges = (
  edges: readonly GraphEdge[],
  visibleNodeIds: ReadonlySet<string>,
): GraphEdge[] =>
  edges.filter(
    (e) => visibleNodeIds.has(e.sourceId) && visibleNodeIds.has(e.targetId),
  );

/** Nodes remaining after the group filters (a hidden group removes its nodes). */
export const visibleNodes = (
  nodes: readonly GraphNode[],
  hiddenGroups: ReadonlySet<FilterGroupId>,
): GraphNode[] => nodes.filter((n) => !hiddenGroups.has(groupForNode(n)));

// ---------------------------------------------------------------------------
// Cache meta → UI state (§7.6 loading/empty/partial/stale/error). The page owns
// query loading/error; this collapses the successful cases into one enum plus a
// few orthogonal flags the banners key off.
// ---------------------------------------------------------------------------
export type GraphViewState = "loading" | "error" | "empty" | "ready";

export interface GraphStateInput {
  isLoading: boolean;
  isError: boolean;
  hasNodes: boolean;
  metaStatus?: string;
}

export const deriveGraphState = (input: GraphStateInput): GraphViewState => {
  if (input.isLoading) return "loading";
  if (input.isError) return "error";
  // "none" = no snapshot has ever been built; no nodes = nothing to draw.
  if (!input.hasNodes || input.metaStatus === "none") return "empty";
  return "ready";
};

/** A snapshot is stale once its last successful sync is older than a day. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export const isStale = (
  lastSyncedAt: string | null | undefined,
  now: number = Date.now(),
): boolean => {
  if (!lastSyncedAt) return false;
  const t = Date.parse(lastSyncedAt);
  if (Number.isNaN(t)) return false;
  return now - t > STALE_AFTER_MS;
};

/** Human "x seconden/minuten/uren/dagen geleden" for the meta line (nl-BE). */
export const relativeTime = (
  iso: string | null | undefined,
  now: number = Date.now(),
): string => {
  if (!iso) return "nooit";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "onbekend";
  const diff = Math.max(0, now - t);
  const min = Math.round(diff / 60000);
  if (min < 1) return "zojuist";
  if (min < 60) return `${min} min geleden`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs} u geleden`;
  const days = Math.round(hrs / 24);
  return `${days} d geleden`;
};

/** Convenience: the exhaustive list of source types, for legends + tests. */
export const ALL_SOURCE_TYPES = Object.values(GraphNodeSourceType);
export const ALL_RELATIONS = Object.values(GraphEdgeRelation);

export type { GraphMeta };
