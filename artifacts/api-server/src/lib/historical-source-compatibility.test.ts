import { describe, expect, it } from "vitest";
import { parseBrainHierarchy, validateBrainHierarchy } from "./brain-hierarchy";
import { auditHistoricalReferences } from "./historical-source-compatibility";
import { getSourceResolutionTelemetry, resetSourceResolutionTelemetry } from "./source-resolver";

const required = ["constitution", "architecture", "clients", "workflows", "knowledge", "templates", "runs", "integrations", "product", "archive"];
function hierarchy() {
  const manifest = parseBrainHierarchy({
    version: 1, rootId: "brain",
    nodes: [
      { id: "brain", kind: "master", label: "Brain", parent: null, order: 0, canonicalOwner: "github", status: "active", visibility: "default" },
      ...required.map((id, order) => ({ id, kind: "hub", label: id, parent: "brain", order: order + 1, canonicalOwner: "github", status: "active", visibility: "default" })),
    ],
    mappings: [
      { pattern: "agents/*.md", parent: "constitution", canonicalOwner: "github" },
      { pattern: "workflows/*.md", parent: "workflows", canonicalOwner: "github" },
      { pattern: "knowledge/*.md", parent: "knowledge", canonicalOwner: "github" },
    ],
    sourceAliases: [{ canonicalPath: "agents/new-agent.md", aliases: ["agents/old-agent.md"] }],
  });
  return validateBrainHierarchy(manifest, ["agents/new-agent.md", "workflows/report.md", "knowledge/rules.md"]);
}

describe("historical source compatibility", () => {
  it("preserves evidence while resolving canonical, aliased, and dynamic identities", () => {
    resetSourceResolutionTelemetry();
    const audit = auditHistoricalReferences([
      { kind: "agent", value: "agents/old-agent.md", recordId: "generation:1" },
      { kind: "workflow", value: "workflows/report.md", recordId: "generation:1" },
      { kind: "client", value: "clients/db/17.md", recordId: "generation:1" },
      { kind: "proposal", value: "knowledge/rules.md", recordId: "proposal:4" },
    ], hierarchy());
    expect(audit).toMatchObject({ total: 4, resolved: 3, runtimeDynamic: 1, unresolved: 0, aliasHits: 1 });
    expect(audit.references.find((reference) => reference.value === "agents/old-agent.md")).toMatchObject({ canonicalPath: "agents/new-agent.md", matchedBy: "alias" });
    expect(getSourceResolutionTelemetry()).toMatchObject({ attempts: 3, resolved: 3, unresolved: 0, byMatch: { alias: 1, canonical_path: 2, hierarchy_id: 0 } });
  });
  it("fails visibly instead of guessing unknown historical paths", () => {
    const audit = auditHistoricalReferences([{ kind: "workflow", value: "workflows/missing.md" }], hierarchy());
    expect(audit.unresolved).toBe(1);
    expect(audit.references[0]).toMatchObject({ status: "unresolved", canonicalPath: null });
  });
});
