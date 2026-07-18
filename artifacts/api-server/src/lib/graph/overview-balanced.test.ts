import { describe, expect, it } from "vitest";
import { OVERVIEW_MAX_EDGES, OVERVIEW_MAX_NODES, reduceToOverview } from "./overview";
import type { Graph, GraphNode } from "./types";

const makeNode = (id: string, sourceType: GraphNode["sourceType"]): GraphNode => ({
  id,
  source: ["agent", "workflow", "sop"].includes(sourceType) ? "github" : sourceType === "integration" || sourceType === "run" || sourceType === "client" ? "replit" : "clickup",
  sourceType,
  label: id,
  updatedAt: "2026-07-18T00:00:00.000Z",
  metadata: sourceType === "task" ? { closed: false } : sourceType === "agent" ? { active: true } : {},
  ...(sourceType === "task" ? { parentId: `clickup:list:${Number(id.split(":").at(-1)) % 10}` } : {}),
});

describe("balanced graph overview", () => {
  it("raises the default overview budgets", () => {
    expect(OVERVIEW_MAX_NODES).toBe(500);
    expect(OVERVIEW_MAX_EDGES).toBe(1200);
  });

  it("keeps every lens represented when knowledge exceeds the global budget", () => {
    const nodes: GraphNode[] = [];
    for (let index = 0; index < 800; index += 1) nodes.push(makeNode(`clickup:page:${index}`, "page"));
    for (let index = 0; index < 140; index += 1) nodes.push(makeNode(`clickup:list:${index}`, "list"));
    for (let index = 0; index < 100; index += 1) nodes.push(makeNode(`github:agent:${index}`, "agent"));
    for (let index = 0; index < 180; index += 1) nodes.push(makeNode(`clickup:task:${index}`, "task"));
    for (let index = 0; index < 80; index += 1) nodes.push(makeNode(`replit:integration:${index}`, "integration"));
    const graph: Graph = { nodes, edges: [] };

    const overview = reduceToOverview(graph);
    const counts = {
      structure: overview.nodes.filter((node) => ["workspace", "space", "folder", "list"].includes(node.sourceType)).length,
      knowledge: overview.nodes.filter((node) => ["doc", "page", "sop"].includes(node.sourceType)).length,
      agents: overview.nodes.filter((node) => ["agent", "workflow"].includes(node.sourceType)).length,
      active: overview.nodes.filter((node) => ["task", "client", "run"].includes(node.sourceType)).length,
      flows: overview.nodes.filter((node) => node.sourceType === "integration").length,
    };

    expect(overview.nodes).toHaveLength(OVERVIEW_MAX_NODES);
    expect(counts.structure).toBeGreaterThan(0);
    expect(counts.knowledge).toBeGreaterThan(0);
    expect(counts.agents).toBeGreaterThan(0);
    expect(counts.active).toBeGreaterThan(0);
    expect(counts.flows).toBeGreaterThan(0);
    expect(counts.knowledge).toBeLessThan(overview.nodes.length);
  });

  it("redistributes unused quota instead of leaving overview capacity empty", () => {
    const nodes = [
      makeNode("clickup:workspace:1", "workspace"),
      makeNode("github:agent:1", "agent"),
      ...Array.from({ length: 20 }, (_, index) => makeNode(`clickup:page:${index}`, "page")),
    ];
    const overview = reduceToOverview({ nodes, edges: [] }, { maxNodes: 15 });
    expect(overview.nodes).toHaveLength(15);
    expect(overview.nodes.some((node) => node.sourceType === "workspace")).toBe(true);
    expect(overview.nodes.some((node) => node.sourceType === "agent")).toBe(true);
  });
});
