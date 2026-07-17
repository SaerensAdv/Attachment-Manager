import { describe, it, expect } from "vitest";

import { buildGraph, type GraphBuildInput } from "./build";
import { ALLOWED_METADATA_KEYS, type Graph } from "./types";
import type { DocGraph } from "../docs";

/**
 * Unit tests for the pure Workspace Graph builder (Fase 3.5 G2). These pin the
 * brief's hard invariants: PROVABLE-ONLY edges (structural contains, repo
 * reference/executes, explicit client↔company link, push generated/writes_to),
 * cross-source id namespacing with no collisions, orphan-preservation (never
 * drop a node with an unknown parent), an acyclic contains hierarchy, and a
 * content-free payload (metadata restricted to the allowlist).
 */

function docGraph(over: Partial<DocGraph> = {}): DocGraph {
  return { nodes: [], edges: [], categories: [], ...over };
}

function baseInput(over: Partial<GraphBuildInput> = {}): GraphBuildInput {
  return {
    workspace: null,
    spaces: [],
    tasksByList: [],
    docs: [],
    docGraph: docGraph(),
    clients: [],
    pushRecords: [],
    ...over,
  };
}

function nodeById(g: Graph, id: string) {
  return g.nodes.find((n) => n.id === id);
}
function hasEdge(g: Graph, relation: string, s: string, t: string) {
  return g.edges.some(
    (e) => e.relation === relation && e.sourceId === s && e.targetId === t,
  );
}

describe("buildGraph — ClickUp structural hierarchy", () => {
  it("nests workspace→space→folder→list→task and workspace→doc→page tree", () => {
    const g = buildGraph(
      baseInput({
        workspace: { id: "W", name: "Saerens" },
        spaces: [
          {
            space: { id: "S", name: "HQ" },
            folders: [
              {
                id: "F",
                name: "Klanten",
                lists: [
                  { id: "L", name: "Onboarding", folderId: "F", taskCount: 2 },
                ],
              },
            ],
            folderlessLists: [
              { id: "LF", name: "Inbox", folderId: null, taskCount: null },
            ],
          },
        ],
        tasksByList: [
          {
            listId: "L",
            tasks: [
              {
                id: "T",
                name: "Do it",
                status: "open",
                url: "https://app.clickup.com/t/T",
                updatedAt: "2026-01-01T00:00:00.000Z",
                closed: false,
              },
            ],
          },
        ],
        docs: [
          {
            doc: { id: "D", name: "SOP", updatedAt: null },
            pages: [
              { id: "P", name: "Intro", children: [{ id: "P2", name: "Sub", children: [] }] },
            ],
          },
        ],
      }),
    );

    expect(hasEdge(g, "contains", "clickup:workspace:W", "clickup:space:S")).toBe(true);
    expect(hasEdge(g, "contains", "clickup:space:S", "clickup:folder:F")).toBe(true);
    expect(hasEdge(g, "contains", "clickup:folder:F", "clickup:list:L")).toBe(true);
    expect(hasEdge(g, "contains", "clickup:space:S", "clickup:list:LF")).toBe(true);
    expect(hasEdge(g, "contains", "clickup:list:L", "clickup:task:T")).toBe(true);
    expect(hasEdge(g, "contains", "clickup:workspace:W", "clickup:doc:D")).toBe(true);
    expect(hasEdge(g, "contains", "clickup:doc:D", "clickup:page:P")).toBe(true);
    expect(hasEdge(g, "contains", "clickup:page:P", "clickup:page:P2")).toBe(true);

    const task = nodeById(g, "clickup:task:T");
    expect(task?.parentId).toBe("clickup:list:L");
    expect(task?.status).toBe("open");
    expect(task?.metadata).toEqual({ closed: false });
    expect(nodeById(g, "clickup:list:L")?.metadata).toEqual({ taskCount: 2 });
  });

  it("keeps a task whose list was not crawled as an orphan (never dropped)", () => {
    const g = buildGraph(
      baseInput({
        tasksByList: [
          {
            listId: "MISSING",
            tasks: [
              { id: "T9", name: "Lonely", status: null, url: null, updatedAt: null, closed: false },
            ],
          },
        ],
      }),
    );
    const t = nodeById(g, "clickup:task:T9");
    expect(t).toBeDefined();
    expect(t?.parentId).toBeUndefined();
    expect(t?.metadata.orphan).toBe(true);
    expect(hasEdge(g, "contains", "clickup:list:MISSING", "clickup:task:T9")).toBe(false);
  });
});

describe("buildGraph — repo doc-graph folding", () => {
  const dg = docGraph({
    nodes: [
      { id: "agents/orchestrator.md", path: "agents/orchestrator.md", title: "Orchestrator", category: "agent", summary: null, fanout: null, active: true },
      { id: "agents/paused.md", path: "agents/paused.md", title: "Paused", category: "agent", summary: null, fanout: null, active: false },
      { id: "workflows/report.md", path: "workflows/report.md", title: "Report", category: "workflow", summary: null, fanout: 3, active: true },
      { id: "knowledge/canvas.md", path: "knowledge/canvas.md", title: "Canvas", category: "knowledge", summary: null, fanout: null, active: true },
      { id: "templates/x.md", path: "templates/x.md", title: "Tmpl", category: "template", summary: null, fanout: null, active: true },
      { id: "AGENTS.md", path: "AGENTS.md", title: "Agents", category: "core", summary: null, fanout: null, active: true },
    ],
    edges: [
      { source: "agents/orchestrator.md", target: "workflows/report.md", kind: "routing" },
      { source: "workflows/report.md", target: "knowledge/canvas.md", kind: "reference" },
      { source: "agents/orchestrator.md", target: "templates/x.md", kind: "reference" },
    ],
  });

  it("maps agent/workflow/knowledge to namespaced github nodes and excludes template/core", () => {
    const g = buildGraph(baseInput({ docGraph: dg }));
    expect(nodeById(g, "github:agent:orchestrator")?.sourceType).toBe("agent");
    expect(nodeById(g, "github:workflow:report")?.metadata).toEqual({ category: "workflow", active: true, fanout: 3 });
    expect(nodeById(g, "github:sop:canvas")?.sourceType).toBe("sop");
    expect(nodeById(g, "github:agent:paused")?.metadata.active).toBe(false);
    expect(g.nodes.some((n) => n.sourceType === "workspace")).toBe(false);
    expect(g.nodes.some((n) => n.label === "Tmpl")).toBe(false);
    expect(g.nodes.some((n) => n.label === "Agents")).toBe(false);
  });

  it("maps routing→executes, reference→references, and drops edges to excluded nodes", () => {
    const g = buildGraph(baseInput({ docGraph: dg }));
    expect(hasEdge(g, "executes", "github:agent:orchestrator", "github:workflow:report")).toBe(true);
    expect(hasEdge(g, "references", "github:workflow:report", "github:sop:canvas")).toBe(true);
    // edge to the excluded template node must not appear under any relation
    expect(g.edges.some((e) => e.targetId.includes("template") || e.targetId === "github:agent:orchestrator")).toBe(false);
  });
});

describe("buildGraph — clients ↔ ClickUp company", () => {
  it("links a client to an existing company task via clickupCompanyId (undirected)", () => {
    const g = buildGraph(
      baseInput({
        workspace: { id: "W", name: "WS" },
        spaces: [
          { space: { id: "S", name: "CRM" }, folders: [], folderlessLists: [{ id: "CO", name: "Companies", folderId: null, taskCount: 1 }] },
        ],
        tasksByList: [
          { listId: "CO", tasks: [{ id: "C1", name: "Acme NV", status: null, url: null, updatedAt: null, closed: false }] },
        ],
        clients: [{ id: 7, name: "Acme", clickupCompanyId: "C1" }],
      }),
    );
    const edge = g.edges.find((e) => e.relation === "related_to");
    expect(edge?.direction).toBe("undirected");
    expect(hasEdge(g, "related_to", "replit:client:7", "clickup:task:C1")).toBe(true);
    expect(nodeById(g, "clickup:task:C1")?.metadata.orphan).toBeUndefined();
  });

  it("creates an orphan company task when the company was not crawled", () => {
    const g = buildGraph(baseInput({ clients: [{ id: 8, name: "Beta", clickupCompanyId: "Z9" }] }));
    const company = nodeById(g, "clickup:task:Z9");
    expect(company?.metadata.orphan).toBe(true);
    expect(company?.url).toContain("/t/Z9");
    expect(hasEdge(g, "related_to", "replit:client:8", "clickup:task:Z9")).toBe(true);
  });

  it("adds no related_to edge for a client without a company link", () => {
    const g = buildGraph(baseInput({ clients: [{ id: 9, name: "NoLink", clickupCompanyId: "  " }] }));
    expect(nodeById(g, "replit:client:9")).toBeDefined();
    expect(g.edges.some((e) => e.relation === "related_to")).toBe(false);
  });
});

describe("buildGraph — live flows (push records)", () => {
  it("draws generated (run→task) and writes_to (integration→task) with health", () => {
    const g = buildGraph(
      baseInput({
        pushRecords: [
          { sourceRunId: "run-abcdef123", clickupObjectId: "TX", clickupUrl: "https://app.clickup.com/t/TX", kind: "report", status: "succeeded", updatedAt: "2026-02-01T00:00:00.000Z" },
        ],
      }),
    );
    expect(hasEdge(g, "writes_to", "replit:integration:clickup-push", "clickup:task:TX")).toBe(true);
    expect(hasEdge(g, "generated", "replit:run:run-abcdef123", "clickup:task:TX")).toBe(true);
    expect(g.edges.find((e) => e.relation === "generated")?.active).toBe(true);
    expect(nodeById(g, "replit:run:run-abcdef123")?.metadata).toEqual({ kind: "report" });
    expect(nodeById(g, "clickup:task:TX")?.metadata.orphan).toBe(true);
  });

  it("marks the flow unhealthy (active:false) on a failed push and accumulates weight", () => {
    const g = buildGraph(
      baseInput({
        pushRecords: [
          { sourceRunId: null, clickupObjectId: "TF", clickupUrl: null, kind: "alert", status: "failed", updatedAt: null },
          { sourceRunId: null, clickupObjectId: "TF", clickupUrl: null, kind: "alert", status: "succeeded", updatedAt: null },
        ],
      }),
    );
    const e = g.edges.find((x) => x.relation === "writes_to");
    expect(e?.active).toBe(false); // any failure keeps the pair unhealthy
    expect(e?.weight).toBe(2);
  });

  it("skips push records that have not yet created a ClickUp object", () => {
    const g = buildGraph(
      baseInput({ pushRecords: [{ sourceRunId: "r", clickupObjectId: null, clickupUrl: null, kind: "report", status: "pending", updatedAt: null }] }),
    );
    expect(g.edges.length).toBe(0);
    expect(nodeById(g, "replit:integration:clickup-push")).toBeUndefined();
  });
});

describe("buildGraph — global invariants", () => {
  const rich = (): Graph =>
    buildGraph(
      baseInput({
        workspace: { id: "123", name: "WS" },
        spaces: [{ space: { id: "S", name: "S" }, folders: [], folderlessLists: [{ id: "L", name: "L", folderId: null, taskCount: null }] }],
        tasksByList: [{ listId: "L", tasks: [{ id: "123", name: "Same raw id as workspace/run", status: "x", url: null, updatedAt: null, closed: true }] }],
        docGraph: docGraph({ nodes: [{ id: "agents/a.md", path: "agents/a.md", title: "A", category: "agent", summary: null, fanout: null, active: true }] }),
        clients: [{ id: 1, name: "Cli", clickupCompanyId: "123" }],
        pushRecords: [{ sourceRunId: "123", clickupObjectId: "123", clickupUrl: null, kind: "report", status: "succeeded", updatedAt: null }],
      }),
    );

  it("namespaces ids across sources with zero collisions", () => {
    const g = rich();
    const ids = g.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    // the raw id "123" is shared by a workspace, a task and a run but stays distinct
    expect(nodeById(g, "clickup:workspace:123")).toBeDefined();
    expect(nodeById(g, "clickup:task:123")).toBeDefined();
    expect(nodeById(g, "replit:run:123")).toBeDefined();
  });

  it("keeps node metadata within the allowlist and emits a content-free payload", () => {
    const g = rich();
    for (const n of g.nodes) {
      for (const key of Object.keys(n.metadata)) {
        expect(ALLOWED_METADATA_KEYS.has(key)).toBe(true);
      }
    }
    const json = JSON.stringify(g);
    expect(json).not.toMatch(/description|custom_field|customField/i);
  });

  it("produces an acyclic contains hierarchy with no self-loops", () => {
    const g = rich();
    expect(g.edges.some((e) => e.sourceId === e.targetId)).toBe(false);
    const containsChildren = new Map<string, string[]>();
    for (const e of g.edges.filter((x) => x.relation === "contains")) {
      containsChildren.set(e.sourceId, [...(containsChildren.get(e.sourceId) ?? []), e.targetId]);
    }
    const state = new Map<string, number>(); // 0=visiting,1=done
    const dfs = (id: string): boolean => {
      if (state.get(id) === 0) return false; // back-edge => cycle
      if (state.get(id) === 1) return true;
      state.set(id, 0);
      for (const c of containsChildren.get(id) ?? []) if (!dfs(c)) return false;
      state.set(id, 1);
      return true;
    };
    for (const id of containsChildren.keys()) expect(dfs(id)).toBe(true);
  });

  it("does not infinite-loop on a self-referential doc page tree", () => {
    const g = buildGraph(
      baseInput({
        workspace: { id: "W", name: "W" },
        docs: [
          {
            doc: { id: "D", name: "D", updatedAt: null },
            // P appears again as its own descendant — the seen-guard must break it
            pages: [{ id: "P", name: "P", children: [{ id: "P", name: "P again", children: [] }] }],
          },
        ],
      }),
    );
    expect(g.nodes.filter((n) => n.id === "clickup:page:P").length).toBe(1);
  });
});
