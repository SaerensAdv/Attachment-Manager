/**
 * Pure read-side projections of the normalized Workspace Graph (Fase 3.5 G4).
 *
 * These functions never fetch or touch the DB — they slice an already-built
 * in-memory `Graph` for the three read routes:
 *   - `reduceToOverview` : a light, capped opening view (§7.7 — ≤~250 nodes /
 *      ≤~500 edges, active work only, structure-first) with a `truncated` flag
 *      so the UI knows more exists behind search / neighbours.
 *   - `neighbors`        : a node's direct (1-hop) neighbourhood for progressive
 *      disclosure (§7.5).
 *   - `searchNodes`      : finds nodes by label/id across the WHOLE graph, incl.
 *      nodes not currently expanded in the overview (§7.9).
 * Kept pure so every branch (limits, ordering, hidden-node search) is unit-tested.
 */
import type { Graph, GraphEdge, GraphNode } from "./types";

export const OVERVIEW_MAX_NODES = 250;
export const OVERVIEW_MAX_EDGES = 500;
/** Per-list cap on active tasks shown in the overview (rest via neighbours). */
export const OVERVIEW_TASK_PER_LIST = 10;

export interface OverviewResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
  totalNodes: number;
  totalEdges: number;
}

/** Most-recent-first, with a stable id tie-break so slices are deterministic. */
function byRecencyThenId(a: GraphNode, b: GraphNode): number {
  const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
  const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
  if (tb !== ta) return tb - ta;
  return a.id.localeCompare(b.id);
}

export function reduceToOverview(
  graph: Graph,
  opts: {
    maxNodes?: number;
    maxEdges?: number;
    taskPerList?: number;
  } = {},
): OverviewResult {
  const maxNodes = opts.maxNodes ?? OVERVIEW_MAX_NODES;
  const maxEdges = opts.maxEdges ?? OVERVIEW_MAX_EDGES;
  const taskPerList = opts.taskPerList ?? OVERVIEW_TASK_PER_LIST;

  const totalNodes = graph.nodes.length;
  const totalEdges = graph.edges.length;

  // Structure/knowledge/agents/clients/integrations/runs are the backbone: always
  // eligible. Tasks are "active work" — closed ones are excluded from the overview.
  const skeleton: GraphNode[] = [];
  const activeTasks: GraphNode[] = [];
  for (const n of graph.nodes) {
    if (n.sourceType === "task") {
      if (n.metadata?.closed === true) continue; // active work only (§7.2)
      activeTasks.push(n);
    } else {
      skeleton.push(n);
    }
  }

  // Cap tasks per parent list (most recent first), so one huge list can't swamp
  // the overview; the rest stay reachable via neighbours/search.
  const perList = new Map<string, number>();
  const cappedTasks: GraphNode[] = [];
  for (const t of [...activeTasks].sort(byRecencyThenId)) {
    const key = t.parentId ?? "__orphan__";
    const seen = perList.get(key) ?? 0;
    if (seen >= taskPerList) continue;
    perList.set(key, seen + 1);
    cappedTasks.push(t);
  }

  // Structure-first global budget: keep the backbone, then fill with recent tasks.
  let selected: GraphNode[];
  if (skeleton.length >= maxNodes) {
    selected = [...skeleton]
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, maxNodes);
  } else {
    const room = maxNodes - skeleton.length;
    selected = [...skeleton, ...cappedTasks.slice(0, room)];
  }

  const keep = new Set(selected.map((n) => n.id));
  let edges = graph.edges.filter(
    (e) => keep.has(e.sourceId) && keep.has(e.targetId),
  );
  if (edges.length > maxEdges) edges = edges.slice(0, maxEdges);

  const truncated = selected.length < totalNodes || edges.length < totalEdges;
  return { nodes: selected, edges, truncated, totalNodes, totalEdges };
}

export interface NeighborsResult {
  center: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * The node plus its direct (1-hop) neighbours and every edge incident to it.
 * Returns null when the id is not in the graph (route -> 404).
 */
export function neighbors(graph: Graph, nodeId: string): NeighborsResult | null {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const center = byId.get(nodeId);
  if (!center) return null;

  const edges = graph.edges.filter(
    (e) => e.sourceId === nodeId || e.targetId === nodeId,
  );
  const ids = new Set<string>([nodeId]);
  for (const e of edges) {
    ids.add(e.sourceId);
    ids.add(e.targetId);
  }
  const nodes: GraphNode[] = [];
  for (const id of ids) {
    const n = byId.get(id);
    if (n) nodes.push(n);
  }
  return { center: nodeId, nodes, edges };
}

export interface SearchResult {
  results: GraphNode[];
  total: number;
}

/**
 * Case-insensitive search over EVERY node (label + id), independent of what the
 * overview currently shows. Ranks label matches over id matches, prefix over
 * substring, then recency/id, so results are stable and useful.
 */
export function searchNodes(
  graph: Graph,
  query: string,
  limit = 30,
): SearchResult {
  const q = query.trim().toLowerCase();
  if (!q) return { results: [], total: 0 };

  const scored: Array<{ node: GraphNode; score: number }> = [];
  for (const n of graph.nodes) {
    const label = n.label.toLowerCase();
    const id = n.id.toLowerCase();
    let score = 0;
    if (label === q) score = 5;
    else if (label.startsWith(q)) score = 4;
    else if (label.includes(q)) score = 3;
    else if (id.includes(q)) score = 1;
    if (score > 0) scored.push({ node: n, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return byRecencyThenId(a.node, b.node);
  });

  return {
    results: scored.slice(0, Math.max(0, limit)).map((s) => s.node),
    total: scored.length,
  };
}
