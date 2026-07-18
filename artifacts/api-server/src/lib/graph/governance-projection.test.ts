import { describe, expect, it } from "vitest";
import { loadBrainGovernance } from "../brain-governance";
import { applyGovernanceProjection } from "./governance-projection";
import type { Graph } from "./types";

describe("governance graph projection", () => {
  it("connects verified SOPs to their versioned workflows", () => {
    const base: Graph = { nodes: [{ id: "github:workflow:monthly-reporting", source: "github", sourceType: "workflow", label: "Monthly reporting", metadata: {} }], edges: [] };
    const result = applyGovernanceProjection(base, loadBrainGovernance());
    expect(result.edges.some((edge) => edge.relation === "governed_by" && edge.sourceId === "github:workflow:monthly-reporting" && edge.targetId === "clickup:page:8cp7v4c-72315")).toBe(true);
  });
  it("projects real Super Agents separately from their governance pages", () => {
    const result = applyGovernanceProjection({ nodes: [], edges: [] }, loadBrainGovernance());
    const agents = result.nodes.filter((node) => node.source === "clickup" && node.sourceType === "agent");
    expect(agents.map((node) => node.label).sort()).toEqual(["Briefing Blair", "Partner Paige", "Sync Sage", "Wiki Warden"]);
    expect(agents.every((node) => node.url?.includes("/ai/agents/"))).toBe(true);
    expect(result.edges.filter((edge) => edge.relation === "governed_by" && edge.sourceId.startsWith("clickup:agent:"))).toHaveLength(4);
    expect(result.nodes.find((node) => node.id === "clickup:page:8cp7v4c-72035")?.sourceType).toBe("page");
  });
  it("keeps explicit project and integration relationships", () => {
    const result = applyGovernanceProjection({ nodes: [], edges: [] }, loadBrainGovernance());
    expect(result.edges.some((edge) => edge.relation === "governed_by" && edge.sourceId === "github:sop:repository:attachment-manager" && edge.targetId === "clickup:page:8cp7v4c-67195")).toBe(true);
    expect(result.edges.some((edge) => edge.relation === "reads_from" && edge.sourceId === "clickup:agent:8cp7v4c-74635" && edge.targetId === "replit:integration:github-source")).toBe(true);
  });
});
