import { describe, expect, it } from "vitest";
import { applyHierarchyProjection } from "./hierarchy-projection";
import type { BrainHierarchyResult } from "../brain-hierarchy";
import type { Graph } from "./types";
const base = { canonicalOwner: "github", status: "active", visibility: "default", aliases: [] } as const;
const hierarchy: BrainHierarchyResult = { manifest: { version: 1, rootId: "brain", nodes: [], mappings: [] }, issues: [], sourceCount: 1, mappedSourceCount: 1, nodes: [
  { ...base, id: "brain", kind: "master", label: "Brain", parent: null, order: 0 },
  { ...base, id: "knowledge", kind: "hub", label: "Knowledge", parent: "brain", order: 10 },
  { ...base, id: "knowledge.registry", kind: "registry", label: "Registry", parent: "knowledge", order: 10 },
  { ...base, id: "source:knowledge/ads.md", kind: "source", label: "Ads", parent: "knowledge.registry", order: 100, source: "knowledge/ads.md", runtimeId: "knowledge/ads.md" },
] };
describe("hierarchy graph projection", () => {
  it("adds navigation nodes and contains edges while preserving source identity", () => {
    const graph: Graph = { nodes: [{ id: "github:sop:ads", source: "github", sourceType: "sop", label: "Ads", metadata: { category: "knowledge" } }], edges: [] };
    const result = applyHierarchyProjection(graph, hierarchy);
    expect(result.nodes.find((node) => node.id === "github:sop:ads")?.metadata).toMatchObject({ hierarchyKind: "source", runtimeId: "knowledge/ads.md" });
    expect(result.nodes.find((node) => node.id === "github:sop:hierarchy:knowledge")?.metadata.hierarchyKind).toBe("hub");
    expect(result.edges.some((edge) => edge.relation === "contains" && edge.targetId === "github:sop:ads")).toBe(true);
  });
  it("does not rewrite reference or execution semantics", () => {
    const graph: Graph = { nodes: [], edges: [{ id: "executes:a->b", sourceId: "a", targetId: "b", relation: "executes", direction: "directed" }] };
    expect(applyHierarchyProjection(graph, hierarchy).edges.some((edge) => edge.relation === "executes")).toBe(true);
  });
});
