import { describe, expect, it } from "vitest";
import { parseBrainHierarchy, validateBrainHierarchy } from "./brain-hierarchy";
import { buildSourceResolutionIndex, resolveBrainSource } from "./source-resolver";

const required = ["constitution", "architecture", "clients", "workflows", "knowledge", "templates", "runs", "integrations", "product", "archive"];
function fixture() {
  const manifest = parseBrainHierarchy({
    version: 1,
    rootId: "brain",
    nodes: [
      { id: "brain", kind: "master", label: "Brain", parent: null, order: 0, canonicalOwner: "github", status: "active", visibility: "default" },
      ...required.map((id, order) => ({ id, kind: "hub", label: id, parent: "brain", order: order + 1, canonicalOwner: "github", status: "active", visibility: "default" })),
    ],
    mappings: [{ pattern: "brain/knowledge/*.md", parent: "knowledge", canonicalOwner: "github" }],
    sourceAliases: [{ canonicalPath: "brain/knowledge/google-ads.md", aliases: ["knowledge/google-ads.md"] }],
  });
  return validateBrainHierarchy(manifest, ["brain/knowledge/google-ads.md"]);
}

describe("source resolver", () => {
  it("resolves hierarchy IDs, canonical paths, and historical aliases identically", () => {
    const hierarchy = fixture();
    const canonical = resolveBrainSource("brain/knowledge/google-ads.md", hierarchy);
    const alias = resolveBrainSource("knowledge/google-ads.md", hierarchy);
    const stable = resolveBrainSource("source:brain/knowledge/google-ads.md", hierarchy);
    expect(alias?.canonicalPath).toBe(canonical?.canonicalPath);
    expect(stable?.canonicalPath).toBe(canonical?.canonicalPath);
    expect(alias?.matchedBy).toBe("alias");
  });
  it("builds one index and fails closed for invalid or unknown input", () => {
    const hierarchy = fixture();
    expect(buildSourceResolutionIndex(hierarchy).size).toBe(3);
    expect(resolveBrainSource("missing.md", hierarchy)).toBeNull();
    hierarchy.issues.push({ code: "forced", message: "invalid" });
    expect(resolveBrainSource("knowledge/google-ads.md", hierarchy)).toBeNull();
  });
});
