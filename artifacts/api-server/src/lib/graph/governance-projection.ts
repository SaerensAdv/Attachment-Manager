import type { BrainGovernanceResult } from "../brain-governance";
import { edgeId, type Graph, type GraphNode } from "./types";

function governanceMetadata(id: string, kind: string, owner: string, lifecycle: string): Record<string, unknown> {
  return { governanceId: id, governanceKind: kind, canonicalOwner: owner, lifecycle };
}

/** Projects only explicit, validated cross-system governance contracts. */
export function applyGovernanceProjection(graph: Graph, governance: BrainGovernanceResult): Graph {
  const nodes = new Map(graph.nodes.map((node) => [node.id, { ...node, metadata: { ...node.metadata } }]));
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const objectToGraph = new Map<string, string>();

  for (const object of governance.manifest.objects) {
    const metadata = governanceMetadata(object.id, object.kind, object.owner, object.lifecycle);
    const existing = nodes.get(object.graph.id);
    if (existing) {
      existing.metadata = { ...existing.metadata, ...metadata };
      if (!existing.status) existing.status = object.lifecycle;
    } else {
      const node: GraphNode = { id: object.graph.id, source: object.graph.source, sourceType: object.graph.sourceType, label: object.label, status: object.lifecycle, metadata };
      nodes.set(node.id, node);
    }
    objectToGraph.set(object.id, object.graph.id);
  }

  for (const link of governance.manifest.links) {
    const sourceId = objectToGraph.get(link.from);
    const targetId = objectToGraph.get(link.to);
    if (!sourceId || !targetId || sourceId === targetId) continue;
    const id = edgeId(link.relation, sourceId, targetId);
    edges.set(id, { id, sourceId, targetId, relation: link.relation, direction: link.direction });
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
