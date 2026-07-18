import { describe, it, expect, vi, beforeEach } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("@workspace/db", () => ({
  pool: {
    query: queryMock,
    connect: async () => ({ query: queryMock, release: () => {} }),
  },
}));
vi.mock("../logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import type { Graph } from "./types";

const GRAPH: Graph = {
  nodes: [
    { id: "clickup:task:T", source: "clickup", sourceType: "task", label: "T", metadata: {} },
    { id: "github:agent:a", source: "github", sourceType: "agent", label: "A", metadata: {} },
  ],
  edges: [
    { id: "contains:clickup:list:L->clickup:task:T", sourceId: "clickup:list:L", targetId: "clickup:task:T", relation: "contains", direction: "directed" },
  ],
};

function snapRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 10,
    status: "active",
    payload: GRAPH,
    node_count: 2,
    edge_count: 1,
    content_hash: null,
    error: null,
    source_updated_at: null,
    last_synced_at: new Date("2026-07-01T00:00:00Z"),
    created_at: new Date("2026-07-01T00:00:00Z"),
    updated_at: new Date("2026-07-01T00:00:00Z"),
    ...over,
  };
}

function routeQuery(opts: {
  insertId?: number;
  active?: Record<string, unknown>[];
  staged?: Record<string, unknown>[];
  swapped?: Record<string, unknown>[];
  bumped?: Record<string, unknown>[];
  throwOn?: RegExp;
} = {}): void {
  queryMock.mockImplementation(async (sql: string) => {
    if (opts.throwOn && opts.throwOn.test(sql)) throw new Error("db boom");
    if (/CREATE TABLE|CREATE UNIQUE INDEX|BEGIN|COMMIT|ROLLBACK|pg_advisory_xact_lock/.test(sql)) return { rows: [] };
    if (/INSERT INTO graph_snapshots/.test(sql)) return { rows: [{ id: opts.insertId ?? 20 }] };
    if (/SET status = 'active'/.test(sql)) return { rows: opts.swapped ?? [] };
    if (/SET payload =/.test(sql)) return { rows: opts.staged ?? [{ id: opts.insertId ?? 20 }] };
    if (/SET status = 'superseded'/.test(sql)) return { rows: [] };
    if (/SET status = 'failed'/.test(sql)) return { rows: [] };
    if (/last_synced_at = now\(\), source_updated_at = \$2/.test(sql)) return { rows: opts.bumped ?? [] };
    if (/SELECT \* FROM graph_snapshots WHERE status = 'active'/.test(sql)) return { rows: opts.active ?? [] };
    return { rows: [] };
  });
}

async function loadStore() {
  vi.resetModules();
  return import("./snapshot-store");
}

beforeEach(() => queryMock.mockReset());

describe("hashGraph", () => {
  it("is stable regardless of array order", async () => {
    const { hashGraph } = await loadStore();
    expect(hashGraph(GRAPH)).toBe(hashGraph({ nodes: [...GRAPH.nodes].reverse(), edges: [...GRAPH.edges] }));
  });
  it("changes with graph content", async () => {
    const { hashGraph } = await loadStore();
    expect(hashGraph(GRAPH)).not.toBe(hashGraph({ nodes: [...GRAPH.nodes, { id: "x", source: "replit", sourceType: "run", label: "x", metadata: {} }], edges: GRAPH.edges }));
  });
});

describe("beginSync", () => {
  it("locks concurrent syncs", async () => {
    routeQuery({ insertId: 42 });
    const store = await loadStore();
    expect(await store.beginSync()).toBe(42);
    expect(await store.beginSync()).toBeNull();
  });
});

describe("completeSync", () => {
  it("refreshes and caches an unchanged active snapshot", async () => {
    const store = await loadStore();
    const hash = store.hashGraph(GRAPH);
    routeQuery({ insertId: 50, active: [snapRow({ id: 9, content_hash: hash })], bumped: [snapRow({ id: 9, content_hash: hash })] });
    const result = await store.completeSync((await store.beginSync())!, GRAPH);
    expect(result.changed).toBe(false);
    expect(result.meta.id).toBe(9);
    expect(store.getActiveGraph()?.graph).toEqual(GRAPH);
  });

  it("atomically promotes and verifies a changed snapshot", async () => {
    const store = await loadStore();
    const hash = store.hashGraph(GRAPH);
    routeQuery({ insertId: 51, active: [snapRow({ id: 8, content_hash: "OLD" })], staged: [{ id: 51 }], swapped: [snapRow({ id: 51, status: "active", content_hash: hash })] });
    const result = await store.completeSync((await store.beginSync())!, GRAPH);
    expect(result.changed).toBe(true);
    expect(result.meta.id).toBe(51);
    expect(store.getActiveGraph()?.meta.contentHash).toBe(hash);
    expect(queryMock.mock.calls.some((call) => /pg_advisory_xact_lock/.test(call[0] as string))).toBe(true);
  });

  it("rejects when staging updates no building row", async () => {
    const store = await loadStore();
    routeQuery({ insertId: 52, active: [snapRow({ content_hash: "OLD" })], staged: [] });
    await expect(store.completeSync((await store.beginSync())!, GRAPH)).rejects.toThrow("snapshot promotion failed");
    expect(store.getActiveGraph()).toBeNull();
  });

  it("rejects instead of returning false success when promotion returns no row", async () => {
    const store = await loadStore();
    routeQuery({ insertId: 53, active: [snapRow({ content_hash: "OLD" })], staged: [{ id: 53 }], swapped: [] });
    await expect(store.completeSync((await store.beginSync())!, GRAPH)).rejects.toThrow("snapshot promotion failed");
    expect(store.isSyncing()).toBe(false);
    expect(queryMock.mock.calls.some((call) => /SET status = 'failed'/.test(call[0] as string))).toBe(true);
  });
});

describe("failSync", () => {
  it("marks the building row failed and releases the lock", async () => {
    routeQuery({ insertId: 60 });
    const store = await loadStore();
    const id = await store.beginSync();
    await store.failSync(id!, "crawl failed");
    expect(store.isSyncing()).toBe(false);
    expect(queryMock.mock.calls.some((call) => /SET status = 'failed'/.test(call[0] as string))).toBe(true);
  });
});

describe("loadActiveIntoMemory", () => {
  it("loads the active payload", async () => {
    routeQuery({ active: [snapRow({ id: 5, content_hash: "H" })] });
    const store = await loadStore();
    expect((await store.loadActiveIntoMemory())?.meta.id).toBe(5);
  });
  it("clears cache when no active row exists", async () => {
    routeQuery({ active: [] });
    const store = await loadStore();
    expect(await store.loadActiveIntoMemory()).toBeNull();
  });
});
