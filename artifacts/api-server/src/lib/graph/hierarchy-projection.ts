import type { BrainHierarchyNode, BrainHierarchyResult } from "../brain-hierarchy";
import { edgeId, nsId, type Graph, type GraphNode } from "./types";

const hierarchyGraphId = (id: string) => nsId("github", "sop", `hierarchy:${id}`);
const sourceGraphId = (path: string): string => {
  const slug = path.replace(/\.md$/, "");
  if (path.startsWith("agents/")) return nsId("github", "agent", slug.slice("agents/".length));
  if (path.startsWith("workflows/")) return nsId("github", "workflow", slug.slice("workflows/".length));
  if (path.startsWith("knowledge/")) return nsId("github", "sop", slug.slice("knowledge/".length));
  return nsId("github", "sop", `source:${encodeURIComponent(path)}`);
};
function hierarchyMetadata(node: BrainHierarchyNode, runtimeId?: string): Record<string, unknown> {
  return { hierarchyId: node.id, hierarchyKind: node.kind, canonicalOwner: node.canonicalOwner, ...(runtimeId ? { runtimeId } : {}) };
}

/** Adds navigation semantics while preserving stable runtime graph identities. */
export function applyHierarchyProjection(graph: Graph, hierarchy: BrainHierarchyResult): Graph {
  const nodes = new Map(graph.nodes.map((node) => [node.id, { ...node, metadata: { ...node.metadata } }]));
  const edges = new Map(graph.edges.map((edge) => [edge.id, { ...edge }]));
  const hierarchyToGraph = new Map<string, string>();

  for (const item of hierarchy.nodes) {
    if (item.kind === "source") {
      const runtimeId = item.runtimeId ?? item.source;
      if (!runtimeId) continue;
      const stableId = sourceGraphId(runtimeId);
      const canonicalId = item.source ? sourceGraphId(item.source) : stableId;
      const canonical = nodes.get(canonicalId);
      const existing = nodes.get(stableId);
      if (canonical && canonicalId !== stableId) {
        nodes.delete(canonicalId);
        nodes.set(stableId, { ...canonical, id: stableId, metadata: { ...canonical.metadata, ...hierarchyMetadata(item, runtimeId) } });
        for (const edge of edges.values()) {
          if (edge.sourceId === canonicalId) edge.sourceId = stableId;
          if (edge.targetId === canonicalId) edge.targetId = stableId;
          edge.id = edgeId(edge.relation, edge.sourceId, edge.targetId);
        }
      } else if (existing) existing.metadata = { ...existing.metadata, ...hierarchyMetadata(item, runtimeId) };
      else nodes.set(stableId, { id: stableId, source: "github", sourceType: "sop", label: item.label, metadata: hierarchyMetadata(item, runtimeId) });
      hierarchyToGraph.set(item.id, stableId);
      continue;
    }
    const id = hierarchyGraphId(item.id);
    const node: GraphNode = { id, source: "github", sourceType: "sop", label: item.label, status: item.status, metadata: hierarchyMetadata(item) };
    nodes.set(id, node); hierarchyToGraph.set(item.id, id);
  }

  const normalizedEdges = new Map<string, Graph["edges"][number]>();
  for (const edge of edges.values()) normalizedEdges.set(edge.id, edge);
  for (const item of hierarchy.nodes) {
    if (!item.parent) continue;
    const parentId = hierarchyToGraph.get(item.parent); const childId = hierarchyToGraph.get(item.id);
    if (!parentId || !childId || parentId === childId) continue;
    const id = edgeId("contains", parentId, childId);
    normalizedEdges.set(id, { id, sourceId: parentId, targetId: childId, relation: "contains", direction: "directed" });
    const child = nodes.get(childId); if (child) child.parentId = parentId;
  }
  return { nodes: [...nodes.values()], edges: [...normalizedEdges.values()] };
}
