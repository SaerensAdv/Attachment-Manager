export type GraphSource = "clickup" | "github" | "replit";
export type GraphSourceType = "workspace" | "space" | "folder" | "list" | "task" | "doc" | "page" | "agent" | "workflow" | "sop" | "client" | "integration" | "run";
export type GraphRelation = "contains" | "references" | "assigned_to" | "governed_by" | "executes" | "reads_from" | "writes_to" | "generated" | "approved_by" | "related_to";
export type GraphDirection = "directed" | "undirected";
export interface GraphNode { id: string; source: GraphSource; sourceType: GraphSourceType; label: string; url?: string; parentId?: string; status?: string; updatedAt?: string; metadata: Record<string, unknown> }
export interface GraphEdge { id: string; sourceId: string; targetId: string; relation: GraphRelation; direction: GraphDirection; weight?: number; active?: boolean }
export interface Graph { nodes: GraphNode[]; edges: GraphEdge[] }
export const ALLOWED_METADATA_KEYS = new Set<string>([
  "orphan", "closed", "taskCount", "kind", "category", "fanout", "active",
  "hierarchyId", "hierarchyKind", "canonicalOwner", "runtimeId",
]);
export function nsId(source: GraphSource, sourceType: GraphSourceType, rawId: string): string { return `${source}:${sourceType}:${rawId}`; }
export function edgeId(relation: GraphRelation, sourceId: string, targetId: string): string { return `${relation}:${sourceId}->${targetId}`; }
