import { describe, expect, it } from "vitest";
import { diagnoseGraph } from "./diagnostics";
import type { Graph } from "./types";

const graph = (nodes: Graph["nodes"]): Graph => ({ nodes, edges: [] });
describe("diagnoseGraph", () => {
  it("counts every lens and source type", () => {
    const result = diagnoseGraph(graph([
      { id: "w", source: "clickup", sourceType: "workspace", label: "W", metadata: {} },
      { id: "a", source: "github", sourceType: "agent", label: "A", metadata: {} },
      { id: "r", source: "replit", sourceType: "run", label: "R", metadata: {} },
      { id: "i", source: "replit", sourceType: "integration", label: "I", metadata: {} },
    ]));
    expect(result.nodesByLens).toEqual({ structure: 1, knowledge: 0, agents: 1, active: 1, flows: 1 });
  });
  it("flags impossible missing canonical sources", () => {
    const result = diagnoseGraph(graph([{ id: "w", source: "clickup", sourceType: "workspace", label: "W", metadata: {} }]), { version: 1, gitSha: "sha", builtAt: null, docsHash: "h", counts: { agents: 2, workflows: 1 }, processStartedAt: "now", docsMode: "packaged", manifestPresent: true });
    expect(result.invariantFailures).toEqual(expect.arrayContaining(["workspace_without_integration", "packaged_agents_missing_from_graph", "packaged_workflows_missing_from_graph"]));
  });
});
