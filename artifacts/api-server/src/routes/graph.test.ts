import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const getActiveGraphMock = vi.hoisted(() => vi.fn()); const loadActiveIntoMemoryMock = vi.hoisted(() => vi.fn()); const isSyncingMock = vi.hoisted(() => vi.fn()); const beginSyncMock = vi.hoisted(() => vi.fn()); const completeSyncMock = vi.hoisted(() => vi.fn()); const failSyncMock = vi.hoisted(() => vi.fn()); const collectGraphInputMock = vi.hoisted(() => vi.fn()); const buildGraphMock = vi.hoisted(() => vi.fn()); const isOwnerMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/graph/snapshot-store", () => ({ getActiveGraph: getActiveGraphMock, loadActiveIntoMemory: loadActiveIntoMemoryMock, isSyncing: isSyncingMock, beginSync: beginSyncMock, completeSync: completeSyncMock, failSync: failSyncMock }));
vi.mock("../lib/graph/collect", () => ({ collectGraphInput: collectGraphInputMock })); vi.mock("../lib/graph/build", () => ({ buildGraph: buildGraphMock })); vi.mock("../middlewares/requireAuth", () => ({ isOwner: isOwnerMock }));
const META = { id: 1, status: "active", nodeCount: 2, edgeCount: 1, contentHash: "abc", error: null, sourceUpdatedAt: "2026-07-17T00:00:00.000Z", lastSyncedAt: "2026-07-17T10:00:00.000Z", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-17T10:00:00.000Z" };
const GRAPH = { nodes: [{ id: "clickup:list:1", source: "clickup", sourceType: "list", label: "Backlog", metadata: {} }, { id: "clickup:task:9", source: "clickup", sourceType: "task", label: "Do the thing", parentId: "clickup:list:1", metadata: { closed: false } }], edges: [{ id: "e1", sourceId: "clickup:list:1", targetId: "clickup:task:9", relation: "contains", direction: "directed" }] };
const REPORT = { workspaces: { discovered: 1, included: 1, excluded: 0 }, spaces: { discovered: 1, included: 1, excluded: 0 }, lists: { discovered: 1, included: 1, excluded: 0 }, tasks: { discovered: 1, included: 1, excludedByAge: 0, excludedByListCap: 0, excludedByGlobalCap: 0 }, docs: { discovered: 0, included: 0, excluded: 0 }, pages: { discovered: 0, included: 0, excluded: 0 }, clients: { included: 0 }, pushRecords: { discovered: 0, included: 0, excluded: 0 } };
async function makeApp(): Promise<Express> { vi.resetModules(); const { default: graphRouter } = await import("./graph"); const app = express(); app.use(express.json()); app.use((req, _res, next) => { (req as unknown as { log: unknown }).log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() }; next(); }); app.use(graphRouter); return app; }
beforeEach(() => { vi.clearAllMocks(); getActiveGraphMock.mockReturnValue({ meta: META, graph: GRAPH }); loadActiveIntoMemoryMock.mockResolvedValue(null); isSyncingMock.mockReturnValue(false); beginSyncMock.mockResolvedValue(42); completeSyncMock.mockResolvedValue({ changed: true, meta: META }); failSyncMock.mockResolvedValue(undefined); collectGraphInputMock.mockResolvedValue({ ok: true, input: {}, sourceUpdatedAt: new Date("2026-07-17T00:00:00.000Z"), errors: [], report: REPORT }); buildGraphMock.mockReturnValue(GRAPH); isOwnerMock.mockReturnValue(true); });

describe("GET /graph/overview", () => {
  it("returns a capped overview slice with cache meta", async () => { const res = await request(await makeApp()).get("/graph/overview"); expect(res.status).toBe(200); expect(res.body.nodes.map((n: { id: string }) => n.id)).toContain("clickup:list:1"); expect(res.body.meta.status).toBe("active"); expect(res.body.totalNodes).toBe(2); expect(res.body.truncated).toBe(false); });
  it("degrades to an empty none overview", async () => { getActiveGraphMock.mockReturnValue(null); loadActiveIntoMemoryMock.mockResolvedValue(null); const res = await request(await makeApp()).get("/graph/overview"); expect(res.body.nodes).toEqual([]); expect(res.body.meta.status).toBe("none"); });
  it("hydrates memory from DB", async () => { getActiveGraphMock.mockReturnValue(null); loadActiveIntoMemoryMock.mockResolvedValue({ meta: META, graph: GRAPH }); const res = await request(await makeApp()).get("/graph/overview"); expect(res.status).toBe(200); expect(loadActiveIntoMemoryMock).toHaveBeenCalledOnce(); });
});
describe("GET /graph/neighbors/:nodeId", () => {
  it("returns direct neighbourhood", async () => { const res = await request(await makeApp()).get("/graph/neighbors/clickup:list:1"); expect(res.status).toBe(200); expect(res.body.nodes).toHaveLength(2); });
  it("404s unknown node", async () => { expect((await request(await makeApp()).get("/graph/neighbors/nope")).status).toBe(404); });
});
describe("GET /graph/search", () => {
  it("searches whole graph", async () => { const res = await request(await makeApp()).get("/graph/search?q=backlog"); expect(res.body.total).toBe(1); });
  it("400s without query", async () => { expect((await request(await makeApp()).get("/graph/search")).status).toBe(400); });
  it("clamps limit", async () => { expect((await request(await makeApp()).get("/graph/search?q=do&limit=5000")).status).toBe(200); });
});
describe("POST /graph/sync", () => {
  it("rebuilds on happy path", async () => { const res = await request(await makeApp()).post("/graph/sync"); expect(res.status).toBe(200); expect(res.body.ok).toBe(true); expect(res.body.note).toBeNull(); });
  it("reports intentional policy exclusions", async () => { collectGraphInputMock.mockResolvedValue({ ok: true, input: {}, sourceUpdatedAt: null, errors: [], report: { ...REPORT, tasks: { ...REPORT.tasks, discovered: 101, included: 1, excludedByAge: 100 } } }); const res = await request(await makeApp()).post("/graph/sync"); expect(res.body.note).toContain("Begrensd"); expect(res.body.note).toContain("100 bronitems uitgesloten"); });
  it("notes partial crawl and still activates", async () => { collectGraphInputMock.mockResolvedValue({ ok: true, input: {}, sourceUpdatedAt: null, errors: ["docs:timeout"], report: REPORT }); const res = await request(await makeApp()).post("/graph/sync"); expect(res.body.note).toContain("Gedeeltelijk"); });
  it("rejects non-owner", async () => { isOwnerMock.mockReturnValue(false); const res = await request(await makeApp()).post("/graph/sync"); expect(res.status).toBe(403); expect(beginSyncMock).not.toHaveBeenCalled(); });
  it("409s while syncing", async () => { isSyncingMock.mockReturnValue(true); expect((await request(await makeApp()).post("/graph/sync")).status).toBe(409); });
  it("409s when store busy", async () => { beginSyncMock.mockResolvedValue(null); expect((await request(await makeApp()).post("/graph/sync")).status).toBe(409); });
  it("preserves prior snapshot on unusable crawl", async () => { collectGraphInputMock.mockResolvedValue({ ok: false, input: {}, sourceUpdatedAt: null, errors: ["clickup:unauthorized"], report: REPORT }); const res = await request(await makeApp()).post("/graph/sync"); expect(res.status).toBe(502); expect(completeSyncMock).not.toHaveBeenCalled(); });
  it("fails safely when crawl throws", async () => { collectGraphInputMock.mockRejectedValue(new Error("boom")); const res = await request(await makeApp()).post("/graph/sync"); expect(res.status).toBe(502); expect(failSyncMock).toHaveBeenCalledOnce(); });
});
describe("GET /graph/sync-status", () => { it("reports freshness and sync", async () => { isSyncingMock.mockReturnValue(true); const res = await request(await makeApp()).get("/graph/sync-status"); expect(res.body.meta.syncing).toBe(true); }); });
