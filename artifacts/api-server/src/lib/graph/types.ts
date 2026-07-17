/**
 * Normalized Workspace Graph contract (Fase 3.5, brief §7.3).
 *
 * ONE backend contract for every source (ClickUp / GitHub repo / Replit
 * runtime). Source ids are namespaced `{source}:{sourceType}:{rawId}` so a
 * ClickUp task id and a Replit run id can never collide (brief §7.9).
 *
 * The graph payload is content-free by construction: nodes carry only ids,
 * labels (object titles), status, url and updatedAt — never descriptions,
 * custom-field values, secrets or report bodies (brief §3.2/§7.4/§10). The
 * `metadata` bag is restricted to `ALLOWED_METADATA_KEYS`, enforced by a test.
 */

export type GraphSource = "clickup" | "github" | "replit";

export type GraphSourceType =
  | "workspace"
  | "space"
  | "folder"
  | "list"
  | "task"
  | "doc"
  | "page"
  | "agent"
  | "workflow"
  | "sop"
  | "client"
  | "integration"
  | "run";

export type GraphRelation =
  | "contains"
  | "references"
  | "assigned_to"
  | "governed_by"
  | "executes"
  | "reads_from"
  | "writes_to"
  | "generated"
  | "approved_by"
  | "related_to";

export type GraphDirection = "directed" | "undirected";

export interface GraphNode {
  id: string;
  source: GraphSource;
  sourceType: GraphSourceType;
  label: string;
  url?: string;
  parentId?: string;
  status?: string;
  updatedAt?: string;
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relation: GraphRelation;
  direction: GraphDirection;
  weight?: number;
  active?: boolean;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * The ONLY keys allowed in `GraphNode.metadata`. Keeping this tight is the
 * structural half of the denylist guard (brief §7.4/§7.9): no description,
 * custom-field value, email, account id or other sensitive field can ride along
 * because there is no allowed key for it. Enforced by a unit test over a full graph.
 */
export const ALLOWED_METADATA_KEYS = new Set<string>([
  "orphan", // node referenced by an edge but not found in its source crawl
  "closed", // task: is in a closed status type
  "taskCount", // list: ClickUp's task_count (a number, not content)
  "kind", // run/integration: push kind (report | search_terms | alert)
  "category", // github node: original repo category (agent/workflow/knowledge)
  "fanout", // workflow: fan-out count
  "active", // github node: lifecycle active flag
]);

/** Namespace a raw source id, e.g. nsId("clickup","task","abc") => "clickup:task:abc". */
export function nsId(
  source: GraphSource,
  sourceType: GraphSourceType,
  rawId: string,
): string {
  return `${source}:${sourceType}:${rawId}`;
}

/** Stable, dedupe-friendly edge id. Two identical relations between the same
 *  pair collapse to one edge (weights accumulate at the call site). */
export function edgeId(
  relation: GraphRelation,
  sourceId: string,
  targetId: string,
): string {
  return `${relation}:${sourceId}->${targetId}`;
}
