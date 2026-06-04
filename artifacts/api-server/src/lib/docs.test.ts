import { describe, it, expect } from "vitest";
import { getDocGraph, getDocFile, type DocFile } from "./docs";
import { clientToDoc } from "./clients-store";
import type { Client } from "@workspace/db";

function makeClientDoc(id: number, name: string): DocFile {
  return clientToDoc({
    id,
    name,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  } as Client);
}

describe("getDocGraph with injected client docs", () => {
  it("merges an injected client into the graph as a client node", () => {
    const extra = makeClientDoc(99, "Injected Client");
    const graph = getDocGraph([extra]);

    const node = graph.nodes.find((n) => n.id === "clients/db/99.md");
    expect(node).toBeDefined();
    expect(node?.category).toBe("client");
    expect(node?.title).toBe("Client: Injected Client");

    // Nodes never carry full content — only the lightweight metadata.
    expect(node).not.toHaveProperty("content");

    // The client category must surface in the legend buckets.
    expect(graph.categories.some((c) => c.id === "client")).toBe(true);
  });

  it("does not include the injected client when no extra is passed", () => {
    const graph = getDocGraph();
    expect(graph.nodes.some((n) => n.id === "clients/db/99.md")).toBe(false);
  });

  it("returns a well-formed graph shape", () => {
    const graph = getDocGraph();
    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(Array.isArray(graph.edges)).toBe(true);
    expect(Array.isArray(graph.categories)).toBe(true);
  });
});

describe("getDocFile with injected client docs", () => {
  it("resolves an injected client by its synthetic path", () => {
    const extra = makeClientDoc(123, "Lookup Client");
    const found = getDocFile("clients/db/123.md", [extra]);
    expect(found?.title).toBe("Client: Lookup Client");
    expect(found?.content).toContain("# Client: Lookup Client");
  });

  it("returns null for an unknown path", () => {
    expect(getDocFile("clients/db/does-not-exist.md")).toBeNull();
  });
});
