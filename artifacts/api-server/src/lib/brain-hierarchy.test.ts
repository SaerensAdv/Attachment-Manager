import { describe, expect, it } from "vitest";
import { loadBrainHierarchy, parseBrainHierarchy, validateBrainHierarchy, type BrainHierarchyManifest } from "./brain-hierarchy";
import { listDocFiles } from "./docs";

describe("brain hierarchy validation", () => {
  it("maps every active repository source without changing runtime paths", () => {
    const sources = listDocFiles().map((file) => file.path);
    const result = loadBrainHierarchy(sources);
    expect(result.issues).toEqual([]);
    expect(result.mappedSourceCount).toBe(result.sourceCount);
    expect(result.nodes.find((node) => node.id === "source:agents/orchestrator.md")?.runtimeId).toBe("agents/orchestrator.md");
  });
  it("rejects malformed stable IDs at schema boundary", () => {
    expect(() => parseBrainHierarchy({ version: 1, rootId: "Brain Root", nodes: [], mappings: [] })).toThrow();
  });
  it("detects topology, alias, order, coverage and mapping drift", () => {
    const required = ["constitution", "architecture", "clients", "workflows", "knowledge", "templates", "runs", "integrations", "product", "archive"];
    const nodes: BrainHierarchyManifest["nodes"] = [
      { id: "root", kind: "master", label: "Root", parent: "child", order: 0, canonicalOwner: "github", status: "active", visibility: "default", aliases: ["child"] },
      { id: "child", kind: "hub", label: "Child", parent: "root", order: 1, canonicalOwner: "github", status: "active", visibility: "default", aliases: [] },
      { id: "detached", kind: "master", label: "Detached", parent: null, order: 1, canonicalOwner: "github", status: "active", visibility: "default", aliases: [] },
      ...required.map((id) => ({ id, kind: "hub" as const, label: id, parent: "root", order: 10, canonicalOwner: "github" as const, status: "active" as const, visibility: "default" as const, aliases: [] })),
    ];
    const result = validateBrainHierarchy({ version: 1, rootId: "root", nodes, mappings: [{ pattern: "agents/*.md", parent: "child", canonicalOwner: "github" }, { pattern: "agents/orchestrator.md", parent: "child", canonicalOwner: "github" }, { pattern: "unused/*.md", parent: "child", canonicalOwner: "github" }] }, ["agents/orchestrator.md", "knowledge/test.md"]);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["root_has_parent", "master_count", "cycle", "detached_tree", "alias_collision", "duplicate_sibling_order", "ambiguous_source", "unmapped_source", "unused_mapping"]));
  });
});
