import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The persistent embedding store must be hermetic to DB failures: every public
 * function degrades to a no-op / empty result (the in-memory path in
 * semantic.ts keeps working) rather than throwing into the search hot path.
 * Each test gets a fresh module (resetModules) so the one-time table bootstrap
 * is re-evaluated against that test's mocked pool.
 */

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

async function loadModule(query: (...args: unknown[]) => unknown) {
  vi.doMock("@workspace/db", () => ({ pool: { query } }));
  return import("./semantic-store");
}

describe("semantic-store vector serialization", () => {
  it("round-trips a vector through the pgvector text literal", async () => {
    const { toVectorLiteral, parseVector } = await loadModule(
      vi.fn().mockResolvedValue({ rows: [] }),
    );
    const v = [0.1, -0.25, 0.333];
    expect(toVectorLiteral(v)).toBe("[0.1,-0.25,0.333]");
    expect(parseVector(toVectorLiteral(v))).toEqual(v);
    expect(parseVector("[1,2,3]")).toEqual([1, 2, 3]);
    expect(parseVector("not json")).toEqual([]);
    expect(parseVector(null)).toEqual([]);
  });
});

describe("semantic-store persistence", () => {
  it("loads and parses persisted embeddings", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({}) // CREATE EXTENSION
      .mockResolvedValueOnce({}) // CREATE TABLE
      .mockResolvedValueOnce({
        rows: [{ path: "knowledge/a.md", content_hash: "h1", embedding: "[1,2,3]" }],
      });
    const { loadStoredEmbeddings } = await loadModule(query);
    const out = await loadStoredEmbeddings("model-x");
    expect(out).toEqual([
      { path: "knowledge/a.md", contentHash: "h1", embedding: [1, 2, 3] },
    ]);
  });

  it("upserts one row per embedding", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const { upsertEmbeddings } = await loadModule(query);
    await upsertEmbeddings("model-x", [
      { path: "a.md", contentHash: "h1", embedding: [1, 2] },
      { path: "b.md", contentHash: "h2", embedding: [3, 4] },
    ]);
    const inserts = query.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO doc_embeddings"),
    );
    expect(inserts).toHaveLength(2);
  });

  it("no-ops on empty upsert without touching the database", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const { upsertEmbeddings } = await loadModule(query);
    await upsertEmbeddings("model-x", []);
    expect(query).not.toHaveBeenCalled();
  });

  it("degrades to empty/no-op (never throws) when the database is down", async () => {
    const query = vi.fn().mockRejectedValue(new Error("db down"));
    const { loadStoredEmbeddings, upsertEmbeddings, deleteEmbeddings } =
      await loadModule(query);
    await expect(loadStoredEmbeddings("m")).resolves.toEqual([]);
    await expect(
      upsertEmbeddings("m", [{ path: "a", contentHash: "h", embedding: [1] }]),
    ).resolves.toBeUndefined();
    await expect(deleteEmbeddings(["a"])).resolves.toBeUndefined();
  });
});
