import { describe, expect, it } from "vitest";
import { loadBrainHierarchy, validateBrainHierarchy, type BrainHierarchyManifest } from "./brain-hierarchy";
import { listDocFiles } from "./docs";

describe("brain hierarchy phase 1", () => {
  it("maps every active repository source without changing runtime paths", () => {
    const sources = listDocFiles().map((file) => file.path);
    const result = loadBrainHierarchy(sources);
    expect(result.issues).toEqual([]);
    expect(result.mappedSourceCount).toBe(result.sourceCount);
    expect(result.nodes.find((node) => node.id === "source:agents/orchestrator.md")?.runtimeId).toBe("agents/orchestrator.md");
  });

  it("detects cycles, missing parents and unmapped sources", () => {
    const manifest: BrainHierarchyManifest = {
      version: 1,
      rootId: "root",
      nodes: [
        { id: "root", kind: "master", label: "Root", parent: "child", order: 0, canonicalOwner: "github", status: "active", visibility: "default" },
        { id: "child", kind: "hub", label: "Child", parent: "root", order: 1, canonicalOwner: "github", status: "active", visibility: "default" },
      ],
      mappings: [],
    };
    const result = validateBrainHierarchy(manifest, ["agents/test.md"]);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["cycle", "unmapped_source"]));
  });
});
