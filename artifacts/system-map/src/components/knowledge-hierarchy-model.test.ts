import { describe, expect, it } from "vitest";
import { buildKnowledgeTree, filterHierarchyTree, hierarchyBreadcrumbs, hierarchyRuntimeId, hierarchySourceId } from "./knowledge-hierarchy-model";
import type { BrainHierarchyNode } from "@workspace/api-client-react";
const base = { canonicalOwner: "github", status: "active", visibility: "default", aliases: [] } as const;
const nodes: BrainHierarchyNode[] = [
  { ...base, id: "brain", kind: "master", label: "Brain", parent: null, order: 0 },
  { ...base, id: "knowledge", kind: "hub", label: "Knowledge", parent: "brain", order: 10 },
  { ...base, id: "knowledge.registry", kind: "registry", label: "Registry", parent: "knowledge", order: 10 },
  { ...base, id: "source:knowledge/ads.md", kind: "source", label: "Ads", parent: "knowledge.registry", order: 100, source: "knowledge/ads.md", runtimeId: "knowledge/ads.md" },
];
describe("knowledge hierarchy model", () => {
  it("builds ordered trees and breadcrumbs", () => { const tree = buildKnowledgeTree(nodes, "brain"); expect(tree?.children[0].children[0].children[0].label).toBe("Ads"); expect(hierarchyBreadcrumbs(nodes, "source:knowledge/ads.md").map((node) => node.id)).toEqual(["brain", "knowledge", "knowledge.registry", "source:knowledge/ads.md"]); });
  it("preserves runtime path identity", () => { expect(hierarchySourceId(nodes, "knowledge/ads.md")).toBe("source:knowledge/ads.md"); expect(hierarchyRuntimeId(nodes, "source:knowledge/ads.md")).toBe("knowledge/ads.md"); });
  it("keeps ancestors while filtering descendants", () => { expect(filterHierarchyTree(buildKnowledgeTree(nodes, "brain")!, "ads")?.children[0].children[0].children).toHaveLength(1); });
});
