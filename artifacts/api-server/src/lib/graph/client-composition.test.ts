import { describe, expect, it } from "vitest";
import { buildGraph, type GraphBuildInput } from "./build";

const input = (over: Partial<GraphBuildInput> = {}): GraphBuildInput => ({
  workspace: { id: "W", name: "Saerens" },
  spaces: [],
  tasksByList: [],
  docs: [],
  docGraph: { nodes: [], edges: [], categories: [] },
  clients: [],
  clientFolderCompanyLinks: [],
  pushRecords: [],
  ...over,
});
const node = (graph: ReturnType<typeof buildGraph>, id: string) => graph.nodes.find((item) => item.id === id);
const edge = (graph: ReturnType<typeof buildGraph>, relation: string, sourceId: string, targetId: string) => graph.edges.some((item) => item.relation === relation && item.sourceId === sourceId && item.targetId === targetId);

describe("canonical client graph composition", () => {
  it("folds a mapped runtime client into its canonical Company", () => {
    const graph = buildGraph(input({
      spaces: [{ space: { id: "HQ", name: "HQ" }, folders: [], folderlessLists: [{ id: "CO", name: "Companies", folderId: null, taskCount: 1 }] }],
      tasksByList: [{ listId: "CO", tasks: [{ id: "C1", name: "Acme NV", status: "active client", url: null, updatedAt: null, closed: false }] }],
      clients: [{ id: 7, name: "Acme cache", clickupCompanyId: "C1" }],
    }));
    expect(node(graph, "replit:client:7")).toBeUndefined();
    expect(node(graph, "clickup:task:C1")?.metadata).toMatchObject({ runtimeId: "7", canonicalOwner: "clickup" });
    expect(graph.edges.some((item) => item.relation === "related_to" && item.sourceId === "replit:client:7")).toBe(false);
  });

  it("keeps only genuinely unmapped runtime clients as warning nodes", () => {
    const graph = buildGraph(input({ clients: [{ id: 9, name: "Needs mapping", clickupCompanyId: null }] }));
    expect(node(graph, "replit:client:9")?.metadata).toEqual({ orphan: true, lifecycle: "unmapped", canonicalOwner: "clickup" });
  });

  it("reparents the live client Folder and its Lists beneath the Company", () => {
    const graph = buildGraph(input({
      spaces: [{
        space: { id: "DELIVERY", name: "02 Client Delivery" },
        folders: [{ id: "F1", name: "CLI-001 Acme", lists: [{ id: "OV", name: "Overview", folderId: "F1", taskCount: 0 }, { id: "D", name: "Delivery", folderId: "F1", taskCount: 2 }] }],
        folderlessLists: [],
      }],
      clients: [{ id: 1, name: "Acme", clickupCompanyId: "C1" }],
      clientFolderCompanyLinks: [{ folderId: "F1", companyTaskId: "C1" }],
    }));
    expect(node(graph, "replit:client:1")).toBeUndefined();
    expect(node(graph, "clickup:folder:F1")?.parentId).toBe("clickup:task:C1");
    expect(node(graph, "clickup:folder:F1")?.metadata.canonicalOwner).toBe("clickup:task:C1");
    expect(edge(graph, "contains", "clickup:task:C1", "clickup:folder:F1")).toBe(true);
    expect(edge(graph, "contains", "clickup:space:DELIVERY", "clickup:folder:F1")).toBe(false);
    expect(edge(graph, "contains", "clickup:folder:F1", "clickup:list:OV")).toBe(true);
    expect(edge(graph, "contains", "clickup:folder:F1", "clickup:list:D")).toBe(true);
  });
});
