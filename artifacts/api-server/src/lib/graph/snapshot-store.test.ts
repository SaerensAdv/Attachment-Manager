import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for the graph snapshot store (Fase 3.5 G3). The load-bearing
 * guarantees: a stable order-independent content hash, a single in-process sync
 * lock, a no-op flip when nothing changed, an atomic promotion when it did, and
 * — critically — that a FAILED sync leaves the prior active snapshot completely
 * untouched (partial data never reaches the UI). `@workspace/db` is mocked so no
 * pool is opened; `pool.query` is routed by SQL text. Each test re-imports the
 * module (via resetModules) so the module-level lock/cache start clean.
 */

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
// The swap now runs in an explicit transaction on a pooled client. The client
// delegates to the same routed queryMock so BEGIN/COMMIT/ROLLBACK and the two
// ordered UPDATEs are all captured and routed exactly like pool.query.
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

/** Route pool.query by SQL so each test can drive the active/swap/bump results. */
function routeQuery(opts: {
  insertId?: number;
  active?: Record<string, unknown>[];
  swapped?: Record<string, unknown>[];
  bumped?: Record<string, unknown>[];
  throwOn?: RegExp;
} = {}): void {
  queryMock.mockImplementation(async (sql: string) => {
    if (opts.throwOn && opts.throwOn.test(sql)) throw new Error("db boom");
    if (/CREATE TABLE|CREATE UNIQUE INDEX/.test(sql)) return { rows: [] };
    if (/INSERT INTO graph_snapshots/.test(sql))
      return { rows: [{ id: opts.insertId ?? 20 }] };
    if (/SET status = 'active'/.test(sql)) return { rows: opts.swapped ?? [] };
    if (/SET payload =/.test(sql)) return { rows: [] };
    if (/SET status = 'superseded'/.test(sql)) return { rows: [] };
    if (/SET status = 'failed'/.test(sql)) return { rows: [] };
    if (/last_synced_at = now\(\), source_updated_at = \$2/.test(sql))
      return { rows: opts.bumped ?? [] };
    if (/SELECT \* FROM graph_snapshots WHERE status = 'active'/.test(sql))
      return { rows: opts.active ?? [] };
    return { rows: [] };
  });
}

async function loadStore() {
  vi.resetModules();
  return import("./snapshot-store");
}

beforeEach(() => {
  queryMock.mockReset();
});

describe("hashGraph", () => {
  it("is stable and independent of node/edge array order", async () => {
    const { hashGraph } = await loadStore();
    const reordered: Graph = {
      nodes: [...GRAPH.nodes].reverse(),
      edges: [...GRAPH.edges],
    };
    expect(hashGraph(GRAPH)).toBe(hashGraph(reordered));
  });

  it("changes when the graph changes", async () => {
    const { hashGraph } = await loadStore();
    const changed: Graph = {
      nodes: [...GRAPH.nodes, { id: "x", source: "replit", sourceType: "run", label: "x", metadata: {} }],
      edges: GRAPH.edges,
    };
    expect(hashGraph(GRAPH)).not.toBe(hashGraph(changed));
  });
});

describe("beginSync — in-process lock", () => {
  it("opens a building row and refuses a second concurrent sync", async () => {
    routeQuery({ insertId: 42 });
    const store = await loadStore();
    const first = await store.beginSync();
    expect(first).toBe(42);
    expect(store.isSyncing()).toBe(true);
    const second = await store.beginSync();
    expect(second).toBeNull(); // lock held — no duplicate sync
  });
});

describe("completeSync", () => {
  it("no-op flips when the payload matches the active snapshot (changed=false)", async () => {
    const store = await loadStore();
    const hash = store.hashGraph(GRAPH);
    routeQuery({
      insertId: 50,
      active: [snapRow({ id: 9, content_hash: hash })],
      bumped: [snapRow({ id: 9, content_hash: hash, last_synced_at: new Date("2026-07-02T00:00:00Z") })],
    });
    const id = await store.beginSync();
    const res = await store.completeSync(id!, GRAPH);
    expect(res.changed).toBe(false);
    expect(store.isSyncing()).toBe(false);
    // The building row was discarded (superseded), not promoted.
    expect(queryMock.mock.calls.some((c) => /SET status = 'superseded'/.test(c[0] as string))).toBe(true);
    expect(queryMock.mock.calls.some((c) => /SET status = 'active'/.test(c[0] as string))).toBe(false);
    // The freshness bump must target the active row BY ID: both params it passes
    // ($1 = id, $2 = source_updated_at) must be referenced or Postgres rejects
    // the statement at runtime ("could not determine data type of parameter $1").
    const bump = queryMock.mock.calls.find((c) =>
      /source_updated_at = \$2/.test(c[0] as string),
    );
    expect(bump?.[0]).toMatch(/WHERE id = \$1/);
    expect((bump?.[1] as unknown[])[0]).toBe(9);
  });

  it("atomically promotes the building row when the payload changed", async () => {
    const store = await loadStore();
    routeQuery({
      insertId: 51,
      active: [snapRow({ id: 8, content_hash: "OLDHASH" })],
      swapped: [snapRow({ id: 51, status: "active", content_hash: store.hashGraph(GRAPH) })],
    });
    const id = await store.beginSync();
    const res = await store.completeSync(id!, GRAPH);
    expect(res.changed).toBe(true);
    expect(res.meta?.id).toBe(51);
    expect(store.getActiveGraph()?.graph).toEqual(GRAPH);
    // The atomic swap statement carries the building id.
    const swap = queryMock.mock.calls.find((c) => /SET status = 'active'/.test(c[0] as string));
    expect(swap?.[1]).toEqual([51]);
  });

  it("leaves the prior active in place if the swap throws (partial-sync safety)", async () => {
    const store = await loadStore();
    routeQuery({
      insertId: 52,
      active: [snapRow({ id: 7, content_hash: "OLDHASH" })],
      throwOn: /SET status = 'active'/,
    });
    const id = await store.beginSync();
    const res = await store.completeSync(id!, GRAPH);
    expect(res.changed).toBe(false);
    expect(res.meta).toBeNull();
    expect(store.isSyncing()).toBe(false);
    // No active-in-memory was overwritten with the half-built graph.
    expect(store.getActiveGraph()).toBeNull();
  });
});

describe("failSync", () => {
  it("marks the building row failed and releases the lock without touching active", async () => {
    routeQuery({ insertId: 60 });
    const store = await loadStore();
    const id = await store.beginSync();
    await store.failSync(id!, "clickup crawl timed out");
    expect(store.isSyncing()).toBe(false);
    const failCall = queryMock.mock.calls.find((c) => /SET status = 'failed'/.test(c[0] as string));
    expect(failCall).toBeTruthy();
    expect((failCall?.[1] as unknown[])[0]).toBe(60);
    // Never promoted anything.
    expect(queryMock.mock.calls.some((c) => /SET status = 'active'/.test(c[0] as string))).toBe(false);
  });
});

describe("loadActiveIntoMemory", () => {
  it("caches the active snapshot payload in memory", async () => {
    routeQuery({ active: [snapRow({ id: 5, content_hash: "H", payload: GRAPH })] });
    const store = await loadStore();
    const loaded = await store.loadActiveIntoMemory();
    expect(loaded?.meta.id).toBe(5);
    expect(store.getActiveGraph()?.graph).toEqual(GRAPH);
  });

  it("returns null and clears the cache when there is no active snapshot", async () => {
    routeQuery({ active: [] });
    const store = await loadStore();
    expect(await store.loadActiveIntoMemory()).toBeNull();
    expect(store.getActiveGraph()).toBeNull();
  });
});
