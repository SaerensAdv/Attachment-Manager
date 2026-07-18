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

/** Adds navigation semantics without touching reference or execution edges. */
export function applyHierarchyProjection(graph: Graph, hierarchy: BrainHierarchyResult): Graph {
  const nodes = new Map(graph.nodes.map((node) => [node.id, { ...node, metadata: { ...node.metadata } }]));
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const hierarchyToGraph = new Map<string, string>();

  for (const item of hierarchy.nodes) {
    if (item.kind === "source") {
      const runtimeId = item.runtimeId ?? item.source;
      if (!runtimeId) continue;
      const id = sourceGraphId(runtimeId);
      const existing = nodes.get(id);
      if (existing) existing.metadata = { ...existing.metadata, ...hierarchyMetadata(item, runtimeId) };
      else nodes.set(id, { id, source: "github", sourceType: "sop", label: item.label, metadata: hierarchyMetadata(item, runtimeId) });
      hierarchyToGraph.set(item.id, id);
      continue;
    }
    const id = hierarchyGraphId(item.id);
    const node: GraphNode = { id, source: "github", sourceType: "sop", label: item.label, status: item.status, metadata: hierarchyMetadata(item) };
    nodes.set(id, node); hierarchyToGraph.set(item.id, id);
  }

  for (const item of hierarchy.nodes) {
    if (!item.parent) continue;
    const parentId = hierarchyToGraph.get(item.parent); const childId = hierarchyToGraph.get(item.id);
    if (!parentId || !childId || parentId === childId) continue;
    const id = edgeId("contains", parentId, childId);
    edges.set(id, { id, sourceId: parentId, targetId: childId, relation: "contains", direction: "directed" });
    const child = nodes.get(childId); if (child) child.parentId = parentId;
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
