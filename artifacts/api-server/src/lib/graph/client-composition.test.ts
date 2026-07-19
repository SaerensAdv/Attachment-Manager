import { describe, expect, it } from "vitest";
import { buildGraph, type GraphBuildInput } from "./build";

const input = (over: Partial<GraphBuildInput> = {}): GraphBuildInput => ({
  workspace: { id: "W", name: "Saerens" }, spaces: [], tasksByList: [], docs: [],
  docGraph: { nodes: [], edges: [], categories: [] }, clients: [], clientFolderCompanyLinks: [], pushRecords: [], ...over,
});
const node = (graph: ReturnType<typeof buildGraph>, id: string) => graph.nodes.find((item) => item.id === id);
const edge = (graph: ReturnType<typeof buildGraph>, relation: string, sourceId: string, targetId: string) => graph.edges.some((item) => item.relation === relation && item.sourceId === sourceId && item.targetId === targetId);

describe("canonical Company -> technical profile composition", () => {
  it("projects multiple runtime profiles beneath one canonical Company", () => {
    const graph = buildGraph(input({
      spaces: [{ space: { id: "HQ", name: "HQ" }, folders: [], folderlessLists: [{ id: "CO", name: "Companies", folderId: null, taskCount: 1 }] }],
      tasksByList: [{ listId: "CO", tasks: [{ id: "C1", name: "LCS BV", status: "active client", url: null, updatedAt: null, closed: false }] }],
      clients: [
        { id: 3, name: "Waterlek", companyName: "LCS BV", clickupCompanyId: "C1" },
        { id: 10, name: "Sanidetect", companyName: "LCS BV", clickupCompanyId: "C1" },
      ],
    }));
    expect(node(graph, "replit:client:3")?.parentId).toBe("clickup:task:C1");
    expect(node(graph, "replit:client:10")?.parentId).toBe("clickup:task:C1");
    expect(node(graph, "replit:client:3")?.metadata.kind).toBe("technical_profile");
    expect(edge(graph, "contains", "clickup:task:C1", "replit:client:3")).toBe(true);
    expect(edge(graph, "contains", "clickup:task:C1", "replit:client:10")).toBe(true);
  });

  it("keeps only profiles without a Company mapping as warnings", () => {
    const graph = buildGraph(input({ clients: [{ id: 99, name: "Needs mapping", companyName: "Unknown", clickupCompanyId: null }] }));
    expect(node(graph, "replit:client:99")?.metadata).toMatchObject({ orphan: true, lifecycle: "unmapped", kind: "technical_profile" });
  });

  it("keeps the live client Folder and technical profiles as Company children", () => {
    const graph = buildGraph(input({
      spaces: [{ space: { id: "DELIVERY", name: "02 Client Delivery" }, folders: [{ id: "F1", name: "CLI-001 Icon BV", lists: [{ id: "OV", name: "Overview", folderId: "F1", taskCount: 0 }] }], folderlessLists: [] }],
      clients: [{ id: 7, name: "Beauty Icon", companyName: "Icon BV", clickupCompanyId: "C1" }],
      clientFolderCompanyLinks: [{ folderId: "F1", companyTaskId: "C1" }],
    }));
    expect(node(graph, "clickup:folder:F1")?.parentId).toBe("clickup:task:C1");
    expect(node(graph, "replit:client:7")?.parentId).toBe("clickup:task:C1");
    expect(edge(graph, "contains", "clickup:task:C1", "clickup:folder:F1")).toBe(true);
    expect(edge(graph, "contains", "clickup:task:C1", "replit:client:7")).toBe(true);
  });
});
