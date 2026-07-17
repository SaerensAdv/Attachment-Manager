import { describe, expect, it } from "vitest";
import { boundPageTree, boundTasksByList, readGraphCollectionPolicy, selectDocs, selectWorkspace } from "./collection-policy";
import type { CuDoc, CuDocPage, CuTask } from "./clickup-structure";

const task = (id: string, updatedAt: string | null): CuTask => ({ id, name: id, status: "open", url: null, updatedAt, closed: false });
const doc = (id: string, updatedAt: string | null): CuDoc => ({ id, name: id, updatedAt });
const page = (id: string, children: CuDocPage[] = []): CuDocPage => ({ id, name: id, children });

describe("graph collection policy", () => {
  it("uses conservative defaults and parses explicit allowlists", () => {
    const policy = readGraphCollectionPolicy({
      GRAPH_WORKSPACE_ID: "ws-1",
      GRAPH_ALLOWED_SPACE_IDS: "s1, s2",
      GRAPH_ALLOWED_LIST_IDS: "l1,l2",
      GRAPH_ALLOWED_DOC_IDS: "d1",
    });
    expect(policy.workspaceId).toBe("ws-1");
    expect([...policy.allowedSpaceIds ?? []]).toEqual(["s1", "s2"]);
    expect(policy.taskLookbackDays).toBe(90);
    expect(policy.maxTasksPerList).toBe(25);
    expect(policy.maxTasksTotal).toBe(500);
    expect(policy.maxDocs).toBe(75);
    expect(policy.maxPagesTotal).toBe(500);
  });

  it("selects the configured workspace instead of blindly taking the first", () => {
    const policy = readGraphCollectionPolicy({ GRAPH_WORKSPACE_ID: "ws-2" });
    expect(selectWorkspace([{ id: "ws-1", name: "Wrong" }, { id: "ws-2", name: "Right" }], policy)?.name).toBe("Right");
    expect(selectWorkspace([{ id: "ws-1", name: "Wrong" }], policy)).toBeNull();
  });

  it("filters old tasks and enforces per-list plus global budgets by recency", () => {
    const policy = { ...readGraphCollectionPolicy({}), taskLookbackDays: 90, maxTasksPerList: 2, maxTasksTotal: 3 };
    const now = new Date("2026-07-18T00:00:00.000Z");
    const result = boundTasksByList([
      { listId: "l1", tasks: [task("a", "2026-07-17T00:00:00.000Z"), task("b", "2026-07-16T00:00:00.000Z"), task("old", "2025-01-01T00:00:00.000Z"), task("c", "2026-07-15T00:00:00.000Z")] },
      { listId: "l2", tasks: [task("d", "2026-07-14T00:00:00.000Z"), task("e", "2026-07-13T00:00:00.000Z")] },
    ], policy, now);
    expect(result.tasksByList.flatMap((group) => group.tasks.map((item) => item.id))).toEqual(["a", "b", "d"]);
    expect(result.counts).toEqual({ discovered: 6, included: 3, excludedByAge: 1, excludedByListCap: 1, excludedByGlobalCap: 1 });
  });

  it("allowlists and caps docs by recency", () => {
    const policy = { ...readGraphCollectionPolicy({ GRAPH_ALLOWED_DOC_IDS: "d1,d3" }), maxDocs: 1 };
    const result = selectDocs([doc("d1", "2026-01-01T00:00:00.000Z"), doc("d2", "2026-07-01T00:00:00.000Z"), doc("d3", "2026-06-01T00:00:00.000Z")], policy);
    expect(result.docs.map((item) => item.id)).toEqual(["d3"]);
    expect(result.excluded).toBe(2);
  });

  it("caps nested page trees without flattening hierarchy", () => {
    const result = boundPageTree([page("p1", [page("p1a"), page("p1b")]), page("p2")], 2);
    expect(result.pages).toEqual([page("p1", [page("p1a")])]);
    expect(result).toMatchObject({ discovered: 4, included: 2, excluded: 2 });
  });
});
