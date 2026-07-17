import { describe, it, expect } from "vitest";
import {
  GraphNodeSourceType,
  GraphEdgeRelation,
  type GraphNode,
  type GraphEdge,
} from "@workspace/api-client-react";
import {
  SOURCE_TYPE_GROUP,
  SOURCE_TYPE_FAMILY,
  SOURCE_TYPE_ICON,
  SOURCE_TYPE_LABEL,
  RELATION_LABEL,
  FILTER_GROUPS,
  groupForNode,
  nodeColorVar,
  edgeColorVar,
  isFlowRelation,
  mergeById,
  indexById,
  drawableEdges,
  visibleNodes,
  deriveGraphState,
  isStale,
  STALE_AFTER_MS,
  type FilterGroupId,
} from "./graph-model";

const node = (id: string, sourceType: GraphNode["sourceType"]): GraphNode => ({
  id,
  source: sourceType === "agent" || sourceType === "workflow" || sourceType === "sop" ? "github" : "clickup",
  sourceType,
  label: id,
  metadata: {},
});

const edge = (
  id: string,
  sourceId: string,
  targetId: string,
  relation: GraphEdge["relation"] = "contains",
  active?: boolean,
): GraphEdge => ({ id, sourceId, targetId, relation, direction: "directed", active });

describe("graph-model — exhaustive coverage over the contract", () => {
  const allTypes = Object.values(GraphNodeSourceType);

  it("maps every one of the 13 sourceTypes to exactly one filter group", () => {
    const groupIds = new Set(FILTER_GROUPS.map((g) => g.id));
    for (const t of allTypes) {
      const g = SOURCE_TYPE_GROUP[t];
      expect(g, `group for ${t}`).toBeDefined();
      expect(groupIds.has(g)).toBe(true);
    }
    // No sourceType left unmapped and no stray keys.
    expect(Object.keys(SOURCE_TYPE_GROUP).sort()).toEqual([...allTypes].sort());
  });

  it("maps every sourceType to a colour family, an icon and a Dutch label", () => {
    for (const t of allTypes) {
      expect(SOURCE_TYPE_FAMILY[t], `family for ${t}`).toBeDefined();
      expect(SOURCE_TYPE_ICON[t], `icon for ${t}`).toBeTruthy();
      expect(SOURCE_TYPE_LABEL[t], `label for ${t}`).toBeTruthy();
    }
  });

  it("labels every relation in the contract (nl)", () => {
    for (const r of Object.values(GraphEdgeRelation)) {
      expect(RELATION_LABEL[r], `label for ${r}`).toBeTruthy();
    }
  });

  it("partitions the five groups with the expected membership", () => {
    const byGroup: Record<FilterGroupId, string[]> = {
      structure: [],
      knowledge: [],
      agents: [],
      active: [],
      flows: [],
    };
    for (const t of allTypes) byGroup[SOURCE_TYPE_GROUP[t]].push(t);
    expect(byGroup.structure.sort()).toEqual(["folder", "list", "space", "workspace"]);
    expect(byGroup.knowledge.sort()).toEqual(["doc", "page", "sop"]);
    expect(byGroup.agents.sort()).toEqual(["agent", "workflow"]);
    expect(byGroup.active.sort()).toEqual(["client", "run", "task"]);
    expect(byGroup.flows.sort()).toEqual(["integration"]);
  });
});

describe("graph-model — colour encoding", () => {
  it("colours nodes by family, not by filter group (task is cyan even though it is 'active work')", () => {
    expect(nodeColorVar(node("a", "task"))).toBe("hsl(var(--wg-structure))");
    expect(nodeColorVar(node("a", "doc"))).toBe("hsl(var(--wg-knowledge))");
    expect(nodeColorVar(node("a", "agent"))).toBe("hsl(var(--wg-execution))");
    expect(nodeColorVar(node("a", "run"))).toBe("hsl(var(--wg-execution))");
    expect(nodeColorVar(node("a", "client"))).toBe("hsl(var(--wg-client))");
  });

  it("reserves red for broken relations and green for healthy live flows only", () => {
    expect(edgeColorVar(edge("e", "a", "b", "writes_to", false))).toBe("hsl(var(--wg-error))");
    expect(edgeColorVar(edge("e", "a", "b", "writes_to", true))).toBe("hsl(var(--wg-flow))");
    expect(edgeColorVar(edge("e", "a", "b", "generated"))).toBe("hsl(var(--wg-flow))");
    expect(edgeColorVar(edge("e", "a", "b", "contains"))).toBe("hsl(var(--wg-edge))");
    expect(edgeColorVar(edge("e", "a", "b", "references"))).toBe("hsl(var(--wg-edge))");
    // A broken contains edge is still an error (red), not neutral.
    expect(edgeColorVar(edge("e", "a", "b", "contains", false))).toBe("hsl(var(--wg-error))");
  });

  it("classifies the three live-flow relations", () => {
    expect(isFlowRelation("reads_from")).toBe(true);
    expect(isFlowRelation("writes_to")).toBe(true);
    expect(isFlowRelation("generated")).toBe(true);
    expect(isFlowRelation("contains")).toBe(false);
    expect(isFlowRelation("executes")).toBe(false);
  });
});

describe("graph-model — view-model merge (progressive disclosure)", () => {
  it("merges neighbours by id without duplicating existing nodes", () => {
    const base = indexById([node("clickup:list:1", "list"), node("clickup:task:2", "task")]);
    const merged = mergeById(base, [
      node("clickup:task:2", "task"), // dedupe: same id
      node("clickup:task:3", "task"), // new
    ]);
    expect(merged.size).toBe(3);
    expect([...merged.keys()].sort()).toEqual([
      "clickup:list:1",
      "clickup:task:2",
      "clickup:task:3",
    ]);
  });

  it("does not mutate the existing map", () => {
    const base = indexById([node("a", "list")]);
    const merged = mergeById(base, [node("b", "task")]);
    expect(base.size).toBe(1);
    expect(merged.size).toBe(2);
    expect(merged).not.toBe(base);
  });

  it("dedupes edges by their stable id", () => {
    const base = indexById([edge("contains:a->b", "a", "b")]);
    const merged = mergeById(base, [
      edge("contains:a->b", "a", "b"), // same id
      edge("references:a->c", "a", "c"),
    ]);
    expect(merged.size).toBe(2);
  });
});

describe("graph-model — visibility filtering", () => {
  const nodes = [
    node("w", "workspace"),
    node("t", "task"),
    node("d", "doc"),
    node("ag", "agent"),
  ];
  const edges = [
    edge("contains:w->t", "w", "t"),
    edge("references:ag->d", "ag", "d"),
  ];

  it("hides a group's nodes and any edge that loses an endpoint", () => {
    const hidden = new Set<FilterGroupId>(["knowledge"]);
    const shown = visibleNodes(nodes, hidden);
    expect(shown.map((n) => n.id).sort()).toEqual(["ag", "t", "w"]);
    const visibleIds = new Set(shown.map((n) => n.id));
    const drawn = drawableEdges(edges, visibleIds);
    // references:ag->d drops because 'd' (doc/knowledge) is hidden.
    expect(drawn.map((e) => e.id)).toEqual(["contains:w->t"]);
  });

  it("groupForNode routes a node to its group", () => {
    expect(groupForNode(node("x", "integration"))).toBe("flows");
    expect(groupForNode(node("x", "sop"))).toBe("knowledge");
  });
});

describe("graph-model — state derivation", () => {
  it("prioritises loading, then error, then empty, then ready", () => {
    expect(deriveGraphState({ isLoading: true, isError: false, hasNodes: false })).toBe("loading");
    expect(deriveGraphState({ isLoading: false, isError: true, hasNodes: true })).toBe("error");
    expect(deriveGraphState({ isLoading: false, isError: false, hasNodes: false })).toBe("empty");
    expect(
      deriveGraphState({ isLoading: false, isError: false, hasNodes: true, metaStatus: "none" }),
    ).toBe("empty");
    expect(
      deriveGraphState({ isLoading: false, isError: false, hasNodes: true, metaStatus: "active" }),
    ).toBe("ready");
  });

  it("marks a snapshot stale only after 24h", () => {
    const now = Date.UTC(2026, 6, 17, 12, 0, 0);
    expect(isStale(null, now)).toBe(false);
    expect(isStale("not-a-date", now)).toBe(false);
    expect(isStale(new Date(now - STALE_AFTER_MS - 1000).toISOString(), now)).toBe(true);
    expect(isStale(new Date(now - 1000).toISOString(), now)).toBe(false);
  });
});
