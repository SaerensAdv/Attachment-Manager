import { describe, expect, it } from "vitest";
import { buildGraph, type GraphBuildInput } from "./build";

const base = (over: Partial<GraphBuildInput> = {}): GraphBuildInput => ({
  workspace: null, spaces: [], tasksByList: [], docs: [],
  docGraph: { nodes: [], edges: [], categories: [] },
  clients: [], runs: [], pushRecords: [], ...over,
});

describe("Atlas collector source coverage", () => {
  it("turns only client-linked generations into nested Active run nodes", () => {
    const graph = buildGraph(base({
      clients: [{ id: 3, name: "Waterlek", companyName: "LCS BV", clickupCompanyId: "C1" }],
      runs: [
        { id: "42", label: "Monthly reporting", status: "completed", updatedAt: "2026-07-18T18:00:00.000Z", clientId: 3 },
        { id: "41", label: "Archive only", status: "completed", updatedAt: "2026-07-17T18:00:00.000Z" },
      ],
    }));
    expect(graph.nodes).toContainEqual(expect.objectContaining({ id: "replit:run:42", sourceType: "run", label: "Monthly reporting", status: "completed", parentId: "replit:client:3" }));
    expect(graph.nodes.some((node) => node.id === "replit:run:41")).toBe(false);
  });

  it("keeps source integrations visible even before a push record exists", () => {
    const graph = buildGraph(base({
      workspace: { id: "9015913612", name: "Saerens Advertising" },
      docGraph: { nodes: [{ id: "agents/orchestrator.md", path: "agents/orchestrator.md", title: "Orchestrator", category: "agent", summary: null, fanout: null, active: true }], edges: [], categories: [] },
    }));
    const integrations = graph.nodes.filter((node) => node.sourceType === "integration").map((node) => node.id);
    expect(integrations).toEqual(expect.arrayContaining(["replit:integration:clickup-source", "replit:integration:github-source"]));
    expect(graph.nodes.some((node) => node.id === "github:agent:orchestrator")).toBe(true);
  });
});
