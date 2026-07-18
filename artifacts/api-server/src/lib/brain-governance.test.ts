import { describe, expect, it } from "vitest";
import { loadBrainGovernance, parseBrainGovernance, validateBrainGovernance } from "./brain-governance";

describe("brain governance manifest", () => {
  it("keeps the canonical Phase 5 mappings valid", () => {
    const result = loadBrainGovernance();
    expect(result.issues).toEqual([]);
    expect(result.manifest.links.filter((link) => link.relation === "governed_by")).toHaveLength(6);
  });

  it("rejects a technical object without a ClickUp governance owner", () => {
    const manifest = parseBrainGovernance({
      version: 1,
      objects: [{ id: "runtime", kind: "integration", label: "Runtime", owner: "replit", lifecycle: "active", graph: { id: "replit:integration:runtime", source: "replit", sourceType: "integration" } }],
      links: [],
    });
    expect(validateBrainGovernance(manifest).issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["technical_object_without_governance", "no_cross_system_links"]));
  });

  it("rejects duplicate graph ownership and broken references", () => {
    const manifest = parseBrainGovernance({
      version: 1,
      objects: [
        { id: "one", kind: "sop", label: "One", owner: "clickup", lifecycle: "draft", graph: { id: "clickup:page:x", source: "clickup", sourceType: "page" } },
        { id: "two", kind: "project", label: "Two", owner: "clickup", lifecycle: "active", graph: { id: "clickup:page:x", source: "clickup", sourceType: "page" } },
      ],
      links: [{ from: "one", to: "missing", relation: "related_to" }],
    });
    expect(validateBrainGovernance(manifest).issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["duplicate_graph_id", "missing_link_target"]));
  });
});
