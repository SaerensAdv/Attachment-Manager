import { describe, it, expect } from "vitest";
import {
  neighbors,
  reduceToOverview,
  searchNodes,
  OVERVIEW_MAX_NODES,
  OVERVIEW_MAX_EDGES,
} from "./overview";
import type { Graph, GraphEdge, GraphNode } from "./types";

function node(
  id: string,
  sourceType: GraphNode["sourceType"],
  extra: Partial<GraphNode> = {},
): GraphNode {
  return {
    id,
    source: "clickup",
    sourceType,
    label: extra.label ?? id,
    metadata: extra.metadata ?? {},
    ...extra,
  };
}

function edge(id: string, a: string, b: string): GraphEdge {
  return { id, sourceId: a, targetId: b, relation: "contains", direction: "directed" };
}

describe("reduceToOverview", () => {
  it("keeps the structural backbone and open tasks, drops closed tasks", () => {
    const graph: Graph = {
      nodes: [
        node("clickup:list:1", "list"),
        node("clickup:task:open", "task", {
          parentId: "clickup:list:1",
          metadata: { closed: false },
        }),
        node("clickup:task:done", "task", {
          parentId: "clickup:list:1",
          metadata: { closed: true },
        }),
      ],
      edges: [
        edge("e1", "clickup:list:1", "clickup:task:open"),
        edge("e2", "clickup:list:1", "clickup:task:done"),
      ],
    };

    const ov = reduceToOverview(graph);
    const ids = ov.nodes.map((n) => n.id);
    expect(ids).toContain("clickup:list:1");
    expect(ids).toContain("clickup:task:open");
    expect(ids).not.toContain("clickup:task:done");
    // The edge to the dropped task is pruned (both endpoints must remain).
    expect(ov.edges.map((e) => e.id)).toEqual(["e1"]);
    // Closed task hidden -> honest truncated flag.
    expect(ov.truncated).toBe(true);
    expect(ov.totalNodes).toBe(3);
    expect(ov.totalEdges).toBe(2);
  });

  it("caps tasks per parent list, most recent first", () => {
    const tasks: GraphNode[] = [];
    for (let i = 0; i < 15; i++) {
      tasks.push(
        node(`clickup:task:${i}`, "task", {
          parentId: "clickup:list:1",
          metadata: { closed: false },
          updatedAt: `2026-07-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
        }),
      );
    }
    const graph: Graph = { nodes: [node("clickup:list:1", "list"), ...tasks], edges: [] };

    const ov = reduceToOverview(graph, { taskPerList: 10 });
    const taskIds = ov.nodes.filter((n) => n.sourceType === "task").map((n) => n.id);
    expect(taskIds).toHaveLength(10);
    // Newest (task:14) kept, oldest (task:0) dropped.
    expect(taskIds).toContain("clickup:task:14");
    expect(taskIds).not.toContain("clickup:task:0");
    expect(ov.truncated).toBe(true);
  });

  it("is structure-first when the node budget is tight", () => {
    const graph: Graph = {
      nodes: [
        node("clickup:list:1", "list"),
        node("clickup:list:2", "list"),
        node("clickup:task:1", "task", {
          parentId: "clickup:list:1",
          metadata: { closed: false },
        }),
      ],
      edges: [],
    };
    const ov = reduceToOverview(graph, { maxNodes: 2 });
    // Backbone (both lists) kept; the task is squeezed out.
    expect(ov.nodes.map((n) => n.id).sort()).toEqual(["clickup:list:1", "clickup:list:2"]);
    expect(ov.truncated).toBe(true);
  });

  it("caps edges to the budget", () => {
    const nodes = [node("a", "list"), node("b", "list"), node("c", "list")];
    const graph: Graph = {
      nodes,
      edges: [edge("e1", "a", "b"), edge("e2", "b", "c"), edge("e3", "a", "c")],
    };
    const ov = reduceToOverview(graph, { maxEdges: 2 });
    expect(ov.edges).toHaveLength(2);
    expect(ov.truncated).toBe(true);
  });

  it("reports not-truncated when everything fits", () => {
    const graph: Graph = {
      nodes: [node("a", "list"), node("b", "workflow")],
      edges: [edge("e1", "a", "b")],
    };
    const ov = reduceToOverview(graph);
    expect(ov.truncated).toBe(false);
  });

  it("performance smoke: respects the ~250 node / ~500 edge budget on a large graph (§7.9)", () => {
    // Build a graph well above the default overview budget: 30 lists, each with
    // 40 open tasks (1230 nodes) fully wired (list→task + a task→task ring).
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    let e = 0;
    for (let l = 0; l < 30; l++) {
      const listId = `clickup:list:${l}`;
      nodes.push(node(listId, "list"));
      const taskIds: string[] = [];
      for (let t = 0; t < 40; t++) {
        const taskId = `clickup:task:${l}-${t}`;
        taskIds.push(taskId);
        nodes.push(
          node(taskId, "task", {
            parentId: listId,
            metadata: { closed: false },
            updatedAt: `2026-07-${String((t % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
          }),
        );
        edges.push(edge(`e${e++}`, listId, taskId));
      }
      // Ring edges between tasks so the edge count comfortably exceeds 500.
      for (let t = 0; t < taskIds.length; t++) {
        edges.push(
          edge(`e${e++}`, taskIds[t], taskIds[(t + 1) % taskIds.length]),
        );
      }
    }
    expect(nodes.length).toBeGreaterThan(250);
    expect(edges.length).toBeGreaterThan(500);

    const started = performance.now();
    const ov = reduceToOverview(graph_(nodes, edges));
    const elapsed = performance.now() - started;

    // Budget is honoured and the honest totals survive.
    expect(ov.nodes.length).toBeLessThanOrEqual(OVERVIEW_MAX_NODES);
    expect(ov.edges.length).toBeLessThanOrEqual(OVERVIEW_MAX_EDGES);
    expect(ov.truncated).toBe(true);
    expect(ov.totalNodes).toBe(nodes.length);
    expect(ov.totalEdges).toBe(edges.length);
    // Every retained edge still has both endpoints in the retained node set.
    const kept = new Set(ov.nodes.map((n) => n.id));
    for (const edge of ov.edges) {
      expect(kept.has(edge.sourceId)).toBe(true);
      expect(kept.has(edge.targetId)).toBe(true);
    }
    // Smoke budget: the reduction is a pure pass, not a heavy computation.
    expect(elapsed).toBeLessThan(250);
  });
});

function graph_(nodes: GraphNode[], edges: GraphEdge[]): Graph {
  return { nodes, edges };
}

describe("neighbors", () => {
  const graph: Graph = {
    nodes: [
      node("center", "list"),
      node("n1", "task"),
      node("n2", "task"),
      node("far", "task"),
    ],
    edges: [
      edge("e1", "center", "n1"),
      edge("e2", "n2", "center"),
      edge("e3", "n1", "far"),
    ],
  };

  it("returns the node plus its 1-hop neighbourhood", () => {
    const nb = neighbors(graph, "center");
    expect(nb).not.toBeNull();
    expect(nb!.center).toBe("center");
    expect(nb!.nodes.map((n) => n.id).sort()).toEqual(["center", "n1", "n2"]);
    // Only edges incident to the center; the n1->far edge is excluded.
    expect(nb!.edges.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
  });

  it("returns null for an unknown node", () => {
    expect(neighbors(graph, "nope")).toBeNull();
  });
});

describe("searchNodes", () => {
  const graph: Graph = {
    nodes: [
      node("clickup:list:1", "list", { label: "Marketing backlog" }),
      node("clickup:task:1", "task", { label: "Backlog grooming" }),
      node("clickup:doc:1", "doc", { label: "Roadmap" }),
    ],
    edges: [],
  };

  it("matches label case-insensitively and ranks prefix over substring", () => {
    const { results, total } = searchNodes(graph, "backlog");
    expect(total).toBe(2);
    // "Backlog grooming" (prefix) ranks above "Marketing backlog" (substring).
    expect(results[0].id).toBe("clickup:task:1");
    expect(results[1].id).toBe("clickup:list:1");
  });

  it("matches on id too", () => {
    const { results } = searchNodes(graph, "doc:1");
    expect(results.map((n) => n.id)).toContain("clickup:doc:1");
  });

  it("honours the limit but reports the full total", () => {
    const { results, total } = searchNodes(graph, "backlog", 1);
    expect(results).toHaveLength(1);
    expect(total).toBe(2);
  });

  it("returns nothing for an empty query", () => {
    expect(searchNodes(graph, "  ")).toEqual({ results: [], total: 0 });
  });

  it("finds a node that the overview truncated away (§7.9 hidden nodes)", () => {
    // A graph well over the overview budget so many nodes are hidden.
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    for (let l = 0; l < 30; l++) {
      const listId = `clickup:list:${l}`;
      nodes.push(node(listId, "list", { label: `List ${l}` }));
      for (let t = 0; t < 40; t++) {
        const taskId = `clickup:task:${l}-${t}`;
        nodes.push(
          node(taskId, "task", {
            label: `Task ${l}-${t}`,
            parentId: listId,
            metadata: { closed: false },
          }),
        );
        edges.push(edge(`e${l}-${t}`, listId, taskId));
      }
    }
    const big: Graph = { nodes, edges };
    const ov = reduceToOverview(big);
    expect(ov.truncated).toBe(true);

    // Pick a task that did NOT survive the overview slice, then prove search
    // still surfaces it — search spans the whole graph, not the capped slice.
    const kept = new Set(ov.nodes.map((n) => n.id));
    const hidden = nodes.find((n) => !kept.has(n.id));
    expect(hidden).toBeDefined();
    const { results } = searchNodes(big, hidden!.label!);
    expect(results.map((n) => n.id)).toContain(hidden!.id);
  });
});
