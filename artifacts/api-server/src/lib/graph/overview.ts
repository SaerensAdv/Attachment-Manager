import type { Graph, GraphEdge, GraphNode } from "./types";

export const OVERVIEW_MAX_NODES = 500;
export const OVERVIEW_MAX_EDGES = 1200;
export const OVERVIEW_TASK_PER_LIST = 20;

export type OverviewLens = "structure" | "knowledge" | "agents" | "active" | "flows";

export const OVERVIEW_LENS_WEIGHTS: Readonly<Record<OverviewLens, number>> = {
  structure: 0.2,
  knowledge: 0.28,
  agents: 0.16,
  active: 0.24,
  flows: 0.12,
};

export interface OverviewResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
  totalNodes: number;
  totalEdges: number;
}

function lensForNode(node: GraphNode): OverviewLens {
  if (["workspace", "space", "folder", "list"].includes(node.sourceType)) return "structure";
  if (["doc", "page", "sop"].includes(node.sourceType)) return "knowledge";
  if (["agent", "workflow"].includes(node.sourceType)) return "agents";
  if (["task", "client", "run"].includes(node.sourceType)) return "active";
  return "flows";
}

function timestamp(node: GraphNode): number {
  return node.updatedAt ? Date.parse(node.updatedAt) || 0 : 0;
}

function byRecencyThenId(a: GraphNode, b: GraphNode): number {
  const diff = timestamp(b) - timestamp(a);
  return diff || a.id.localeCompare(b.id);
}

function orderLens(lens: OverviewLens, nodes: GraphNode[]): GraphNode[] {
  if (lens === "structure") {
    const rank: Record<string, number> = { workspace: 0, space: 1, folder: 2, list: 3 };
    return [...nodes].sort((a, b) => (rank[a.sourceType] ?? 9) - (rank[b.sourceType] ?? 9) || a.id.localeCompare(b.id));
  }
  if (lens === "agents") {
    return [...nodes].sort((a, b) => Number(b.metadata?.active !== false) - Number(a.metadata?.active !== false) || a.id.localeCompare(b.id));
  }
  return [...nodes].sort(byRecencyThenId);
}

function boundedActiveNodes(nodes: GraphNode[], taskPerList: number): GraphNode[] {
  const nonTasks = nodes.filter((node) => node.sourceType !== "task");
  const tasks = nodes.filter((node) => node.sourceType === "task" && node.metadata?.closed !== true).sort(byRecencyThenId);
  const perList = new Map<string, number>();
  const cappedTasks: GraphNode[] = [];
  for (const task of tasks) {
    const parent = task.parentId ?? "__orphan__";
    const seen = perList.get(parent) ?? 0;
    if (seen >= taskPerList) continue;
    perList.set(parent, seen + 1);
    cappedTasks.push(task);
  }
  return orderLens("active", [...nonTasks, ...cappedTasks]);
}

function allocateQuotas(maxNodes: number): Record<OverviewLens, number> {
  const lenses = Object.keys(OVERVIEW_LENS_WEIGHTS) as OverviewLens[];
  const quotas = {} as Record<OverviewLens, number>;
  let assigned = 0;
  for (const lens of lenses) {
    const quota = Math.floor(maxNodes * OVERVIEW_LENS_WEIGHTS[lens]);
    quotas[lens] = quota;
    assigned += quota;
  }
  for (let index = 0; assigned < maxNodes; index += 1, assigned += 1) quotas[lenses[index % lenses.length]] += 1;
  return quotas;
}

function selectBalanced(buckets: Record<OverviewLens, GraphNode[]>, maxNodes: number): GraphNode[] {
  const lenses = Object.keys(OVERVIEW_LENS_WEIGHTS) as OverviewLens[];
  const quotas = allocateQuotas(maxNodes);
  const selected: GraphNode[] = [];
  const offsets = {} as Record<OverviewLens, number>;

  for (const lens of lenses) {
    const take = Math.min(quotas[lens], buckets[lens].length);
    selected.push(...buckets[lens].slice(0, take));
    offsets[lens] = take;
  }

  let remaining = maxNodes - selected.length;
  while (remaining > 0) {
    let progressed = false;
    for (const lens of lenses) {
      if (remaining === 0) break;
      const next = buckets[lens][offsets[lens]];
      if (!next) continue;
      selected.push(next);
      offsets[lens] += 1;
      remaining -= 1;
      progressed = true;
    }
    if (!progressed) break;
  }
  return selected;
}

export function reduceToOverview(
  graph: Graph,
  opts: { maxNodes?: number; maxEdges?: number; taskPerList?: number } = {},
): OverviewResult {
  const maxNodes = opts.maxNodes ?? OVERVIEW_MAX_NODES;
  const maxEdges = opts.maxEdges ?? OVERVIEW_MAX_EDGES;
  const taskPerList = opts.taskPerList ?? OVERVIEW_TASK_PER_LIST;
  const totalNodes = graph.nodes.length;
  const totalEdges = graph.edges.length;

  const raw: Record<OverviewLens, GraphNode[]> = { structure: [], knowledge: [], agents: [], active: [], flows: [] };
  for (const node of graph.nodes) raw[lensForNode(node)].push(node);
  const buckets: Record<OverviewLens, GraphNode[]> = {
    structure: orderLens("structure", raw.structure),
    knowledge: orderLens("knowledge", raw.knowledge),
    agents: orderLens("agents", raw.agents),
    active: boundedActiveNodes(raw.active, taskPerList),
    flows: orderLens("flows", raw.flows),
  };

  const selected = selectBalanced(buckets, maxNodes);
  const keep = new Set(selected.map((node) => node.id));
  const connectedEdges = graph.edges.filter((edge) => keep.has(edge.sourceId) && keep.has(edge.targetId));
  const edges = connectedEdges.slice(0, maxEdges);
  const truncated = selected.length < totalNodes || edges.length < totalEdges;
  return { nodes: selected, edges, truncated, totalNodes, totalEdges };
}

export interface NeighborsResult { center: string; nodes: GraphNode[]; edges: GraphEdge[] }
export function neighbors(graph: Graph, nodeId: string): NeighborsResult | null {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  if (!byId.has(nodeId)) return null;
  const edges = graph.edges.filter((edge) => edge.sourceId === nodeId || edge.targetId === nodeId);
  const ids = new Set<string>([nodeId]);
  for (const edge of edges) { ids.add(edge.sourceId); ids.add(edge.targetId); }
  return { center: nodeId, nodes: [...ids].flatMap((id) => { const node = byId.get(id); return node ? [node] : []; }), edges };
}

export interface SearchResult { results: GraphNode[]; total: number }
export function searchNodes(graph: Graph, query: string, limit = 30): SearchResult {
  const q = query.trim().toLowerCase();
  if (!q) return { results: [], total: 0 };
  const scored: Array<{ node: GraphNode; score: number }> = [];
  for (const node of graph.nodes) {
    const label = node.label.toLowerCase();
    const id = node.id.toLowerCase();
    const score = label === q ? 5 : label.startsWith(q) ? 4 : label.includes(q) ? 3 : id.includes(q) ? 1 : 0;
    if (score) scored.push({ node, score });
  }
  scored.sort((a, b) => b.score - a.score || byRecencyThenId(a.node, b.node));
  return { results: scored.slice(0, Math.max(0, limit)).map(({ node }) => node), total: scored.length };
}
