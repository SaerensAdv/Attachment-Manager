import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

/**
 * HTTP-contract tests for the Workspace Graph routes through Express + supertest.
 * The snapshot store, the source collector and the pure builder are mocked so we
 * can drive the read routes off a fixed in-memory graph and exercise every
 * sync branch (owner-gate, busy lock, partial crawl, failed crawl, thrown crawl)
 * without touching ClickUp or the DB. The overview projection and the generated
 * zod response schemas run for real, so the wire shape is genuinely validated.
 */

const getActiveGraphMock = vi.hoisted(() => vi.fn());
const loadActiveIntoMemoryMock = vi.hoisted(() => vi.fn());
const isSyncingMock = vi.hoisted(() => vi.fn());
const beginSyncMock = vi.hoisted(() => vi.fn());
const completeSyncMock = vi.hoisted(() => vi.fn());
const failSyncMock = vi.hoisted(() => vi.fn());
const collectGraphInputMock = vi.hoisted(() => vi.fn());
const buildGraphMock = vi.hoisted(() => vi.fn());
const isOwnerMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/graph/snapshot-store", () => ({
  getActiveGraph: getActiveGraphMock,
  loadActiveIntoMemory: loadActiveIntoMemoryMock,
  isSyncing: isSyncingMock,
  beginSync: beginSyncMock,
  completeSync: completeSyncMock,
  failSync: failSyncMock,
}));
vi.mock("../lib/graph/collect", () => ({
  collectGraphInput: collectGraphInputMock,
}));
vi.mock("../lib/graph/build", () => ({
  buildGraph: buildGraphMock,
}));
vi.mock("../middlewares/requireAuth", () => ({
  isOwner: isOwnerMock,
}));

const META = {
  id: 1,
  status: "active",
  nodeCount: 2,
  edgeCount: 1,
  contentHash: "abc",
  error: null,
  sourceUpdatedAt: "2026-07-17T00:00:00.000Z",
  lastSyncedAt: "2026-07-17T10:00:00.000Z",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-17T10:00:00.000Z",
};

const GRAPH = {
  nodes: [
    { id: "clickup:list:1", source: "clickup", sourceType: "list", label: "Backlog", metadata: {} },
    {
      id: "clickup:task:9",
      source: "clickup",
      sourceType: "task",
      label: "Do the thing",
      parentId: "clickup:list:1",
      metadata: { closed: false },
    },
  ],
  edges: [
    { id: "e1", sourceId: "clickup:list:1", targetId: "clickup:task:9", relation: "contains", direction: "directed" },
  ],
};

async function makeApp(): Promise<Express> {
  vi.resetModules();
  const { default: graphRouter } = await import("./graph");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // Stub the pino child logger the sync catch-path uses.
    (req as unknown as { log: unknown }).log = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    };
    next();
  });
  app.use(graphRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  getActiveGraphMock.mockReturnValue({ meta: META, graph: GRAPH });
  loadActiveIntoMemoryMock.mockResolvedValue(null);
  isSyncingMock.mockReturnValue(false);
  beginSyncMock.mockResolvedValue(42);
  completeSyncMock.mockResolvedValue({ changed: true, meta: META });
  failSyncMock.mockResolvedValue(undefined);
  collectGraphInputMock.mockResolvedValue({
    ok: true,
    input: {},
    sourceUpdatedAt: new Date("2026-07-17T00:00:00.000Z"),
    errors: [],
  });
  buildGraphMock.mockReturnValue(GRAPH);
  isOwnerMock.mockReturnValue(true);
});

describe("GET /graph/overview", () => {
  it("returns a capped overview slice with cache meta", async () => {
    const app = await makeApp();
    const res = await request(app).get("/graph/overview");
    expect(res.status).toBe(200);
    expect(res.body.nodes.map((n: { id: string }) => n.id)).toContain("clickup:list:1");
    expect(res.body.meta.status).toBe("active");
    expect(res.body.meta.syncing).toBe(false);
    expect(res.body.totalNodes).toBe(2);
    expect(res.body.truncated).toBe(false);
  });

  it("degrades to an empty 'none' overview when there is no snapshot", async () => {
    getActiveGraphMock.mockReturnValue(null);
    loadActiveIntoMemoryMock.mockResolvedValue(null);
    const app = await makeApp();
    const res = await request(app).get("/graph/overview");
    expect(res.status).toBe(200);
    expect(res.body.nodes).toEqual([]);
    expect(res.body.meta.status).toBe("none");
    expect(res.body.totalNodes).toBe(0);
  });

  it("hydrates the in-memory index from the DB on first read", async () => {
    getActiveGraphMock.mockReturnValue(null);
    loadActiveIntoMemoryMock.mockResolvedValue({ meta: META, graph: GRAPH });
    const app = await makeApp();
    const res = await request(app).get("/graph/overview");
    expect(res.status).toBe(200);
    expect(loadActiveIntoMemoryMock).toHaveBeenCalledOnce();
    expect(res.body.meta.status).toBe("active");
  });
});

describe("GET /graph/neighbors/:nodeId", () => {
  it("returns a node's 1-hop neighbourhood", async () => {
    const app = await makeApp();
    const res = await request(app).get("/graph/neighbors/clickup:list:1");
    expect(res.status).toBe(200);
    expect(res.body.center).toBe("clickup:list:1");
    expect(res.body.nodes.map((n: { id: string }) => n.id).sort()).toEqual([
      "clickup:list:1",
      "clickup:task:9",
    ]);
    expect(res.body.edges).toHaveLength(1);
  });

  it("404s an unknown node", async () => {
    const app = await makeApp();
    const res = await request(app).get("/graph/neighbors/clickup:list:999");
    expect(res.status).toBe(404);
  });
});

describe("GET /graph/search", () => {
  it("searches the whole graph", async () => {
    const app = await makeApp();
    const res = await request(app).get("/graph/search").query({ q: "backlog" });
    expect(res.status).toBe(200);
    expect(res.body.results.map((n: { id: string }) => n.id)).toContain("clickup:list:1");
    expect(res.body.total).toBe(1);
  });

  it("400s without a query", async () => {
    const app = await makeApp();
    const res = await request(app).get("/graph/search");
    expect(res.status).toBe(400);
  });

  it("clamps the limit", async () => {
    const app = await makeApp();
    const res = await request(app).get("/graph/search").query({ q: "do", limit: "5000" });
    expect(res.status).toBe(200);
  });
});

describe("POST /graph/sync", () => {
  it("rebuilds and reports a change on the happy path", async () => {
    const app = await makeApp();
    const res = await request(app).post("/graph/sync");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.changed).toBe(true);
    expect(res.body.meta.status).toBe("active");
    expect(res.body.note).toBeNull();
    expect(beginSyncMock).toHaveBeenCalledOnce();
    expect(completeSyncMock).toHaveBeenCalledOnce();
    expect(failSyncMock).not.toHaveBeenCalled();
  });

  it("notes a partial crawl but still activates", async () => {
    collectGraphInputMock.mockResolvedValue({
      ok: true,
      input: {},
      sourceUpdatedAt: null,
      errors: ["tasks:1:rate_limited", "docs:timeout"],
    });
    const app = await makeApp();
    const res = await request(app).post("/graph/sync");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.note).toContain("Gedeeltelijk");
  });

  it("rejects a non-owner with 403 and never begins a sync", async () => {
    isOwnerMock.mockReturnValue(false);
    const app = await makeApp();
    const res = await request(app).post("/graph/sync");
    expect(res.status).toBe(403);
    expect(beginSyncMock).not.toHaveBeenCalled();
  });

  it("409s when a sync is already running", async () => {
    isSyncingMock.mockReturnValue(true);
    const app = await makeApp();
    const res = await request(app).post("/graph/sync");
    expect(res.status).toBe(409);
    expect(beginSyncMock).not.toHaveBeenCalled();
  });

  it("409s when the store cannot take the lock", async () => {
    beginSyncMock.mockResolvedValue(null);
    const app = await makeApp();
    const res = await request(app).post("/graph/sync");
    expect(res.status).toBe(409);
  });

  it("502s and preserves the prior snapshot when the crawl is unusable", async () => {
    collectGraphInputMock.mockResolvedValue({
      ok: false,
      input: {},
      sourceUpdatedAt: null,
      errors: ["clickup:unauthorized"],
    });
    const app = await makeApp();
    const res = await request(app).post("/graph/sync");
    expect(res.status).toBe(502);
    expect(res.body.ok).toBe(false);
    expect(res.body.note).toContain("vorige graph behouden");
    expect(failSyncMock).toHaveBeenCalledOnce();
    expect(completeSyncMock).not.toHaveBeenCalled();
  });

  it("502s and fails the sync when the crawl throws", async () => {
    collectGraphInputMock.mockRejectedValue(new Error("boom"));
    const app = await makeApp();
    const res = await request(app).post("/graph/sync");
    expect(res.status).toBe(502);
    expect(res.body.ok).toBe(false);
    expect(failSyncMock).toHaveBeenCalledOnce();
  });
});

describe("GET /graph/sync-status", () => {
  it("reports freshness and sync state", async () => {
    isSyncingMock.mockReturnValue(true);
    const app = await makeApp();
    const res = await request(app).get("/graph/sync-status");
    expect(res.status).toBe(200);
    expect(res.body.meta.status).toBe("active");
    expect(res.body.meta.syncing).toBe(true);
    expect(res.body.meta.lastSyncedAt).toBe("2026-07-17T10:00:00.000Z");
  });
});
