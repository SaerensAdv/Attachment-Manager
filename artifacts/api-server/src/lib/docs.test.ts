import { describe, it, expect } from "vitest";
import {
  getDocGraph,
  getDocFile,
  textMentions,
  stripNonProse,
  deriveEdges,
  type DocFile,
} from "./docs";
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

function makeDoc(
  id: string,
  category: string,
  title: string,
  content: string,
): DocFile {
  return { id, path: id, category, title, summary: null, content };
}

describe("textMentions", () => {
  it("matches an exact title surrounded by non-word characters", () => {
    expect(textMentions("see the Orchestrator for routing.", "Orchestrator")).toBe(true);
    expect(textMentions("(Orchestrator)", "Orchestrator")).toBe(true);
  });

  it("requires word boundaries on both sides", () => {
    expect(textMentions("Orchestrators do things", "Orchestrator")).toBe(false);
    expect(textMentions("subOrchestrator", "Orchestrator")).toBe(false);
  });

  it("is case-sensitive so all-caps titles do not match lowercase prose", () => {
    expect(textMentions("the architecture of the system", "ARCHITECTURE")).toBe(false);
    expect(textMentions("see ARCHITECTURE.md notes", "ARCHITECTURE")).toBe(true);
  });

  it("returns false for an empty title", () => {
    expect(textMentions("anything at all", "")).toBe(false);
  });
});

describe("stripNonProse", () => {
  it("blanks out fenced code blocks", () => {
    const input = ["before", "```", "Orchestrator", "```", "after"].join("\n");
    const out = stripNonProse(input);
    expect(out).not.toContain("Orchestrator");
    expect(out).toContain("before");
    expect(out).toContain("after");
  });

  it("handles tilde fences too", () => {
    const input = ["~~~", "Orchestrator", "~~~"].join("\n");
    expect(stripNonProse(input)).not.toContain("Orchestrator");
  });

  it("removes inline code spans", () => {
    expect(stripNonProse("use the `Orchestrator` here")).not.toContain("Orchestrator");
  });

  it("blanks heading lines", () => {
    expect(stripNonProse("## Orchestrator")).not.toContain("Orchestrator");
  });

  it("drops HTML comments", () => {
    expect(stripNonProse("text <!-- Orchestrator --> more")).not.toContain("Orchestrator");
  });

  it("keeps ordinary prose intact", () => {
    expect(stripNonProse("The Orchestrator routes work.")).toContain("Orchestrator");
  });
});

describe("deriveEdges", () => {
  it("creates a reference edge from a backtick file reference", () => {
    const files = [
      makeDoc("agents/a.md", "agent", "Agent A", "uses `knowledge/x.md` daily"),
      makeDoc("knowledge/x.md", "knowledge", "Standard X", "content"),
    ];
    const edges = deriveEdges(files);
    expect(edges).toContainEqual({
      source: "agents/a.md",
      target: "knowledge/x.md",
      kind: "reference",
    });
  });

  it("does not create a mention edge for a title that only appears in a code block", () => {
    const files = [
      makeDoc(
        "agents/a.md",
        "agent",
        "Agent A",
        ["intro", "```", "Standard X", "```", "outro"].join("\n"),
      ),
      makeDoc("knowledge/x.md", "knowledge", "Standard X", "content"),
    ];
    const edges = deriveEdges(files);
    expect(
      edges.some((e) => e.target === "knowledge/x.md" && e.kind === "mention"),
    ).toBe(false);
  });

  it("does not create a mention edge for a title that only appears in inline code or a heading", () => {
    const inlineCode = [
      makeDoc("agents/a.md", "agent", "Agent A", "see `Standard X` inline"),
      makeDoc("knowledge/x.md", "knowledge", "Standard X", "content"),
    ];
    expect(
      deriveEdges(inlineCode).some(
        (e) => e.target === "knowledge/x.md" && e.kind === "mention",
      ),
    ).toBe(false);

    const heading = [
      makeDoc("agents/a.md", "agent", "Agent A", "## Standard X\nbody"),
      makeDoc("knowledge/x.md", "knowledge", "Standard X", "content"),
    ];
    expect(
      deriveEdges(heading).some(
        (e) => e.target === "knowledge/x.md" && e.kind === "mention",
      ),
    ).toBe(false);
  });

  it("creates a mention edge for an exact title in prose", () => {
    const files = [
      makeDoc("agents/a.md", "agent", "Agent A", "We rely on Standard X for this."),
      makeDoc("knowledge/x.md", "knowledge", "Standard X", "content"),
    ];
    expect(deriveEdges(files)).toContainEqual({
      source: "agents/a.md",
      target: "knowledge/x.md",
      kind: "mention",
    });
  });

  it("derives orchestrator routing edges from the routing guide", () => {
    const files = [
      makeDoc(
        "agents/orchestrator.md",
        "agent",
        "Orchestrator",
        "## Routing guide\nRoute to the SEO Specialist when needed.",
      ),
      makeDoc("agents/seo.md", "agent", "SEO Specialist", "content"),
    ];
    expect(deriveEdges(files)).toContainEqual({
      source: "agents/orchestrator.md",
      target: "agents/seo.md",
      kind: "routing",
    });
  });

  it("keeps the highest-priority edge when several passes match the same pair", () => {
    // A backtick reference (reference) and a prose mention both point A -> X;
    // reference outranks mention so only the reference survives.
    const files = [
      makeDoc(
        "agents/a.md",
        "agent",
        "Agent A",
        "uses `knowledge/x.md` and also names Standard X in prose",
      ),
      makeDoc("knowledge/x.md", "knowledge", "Standard X", "content"),
    ];
    const ax = deriveEdges(files).filter(
      (e) => e.source === "agents/a.md" && e.target === "knowledge/x.md",
    );
    expect(ax).toHaveLength(1);
    expect(ax[0].kind).toBe("reference");
  });

  it("derives five-layer flow edges from ARCHITECTURE.md", () => {
    const files = [
      makeDoc(
        "ARCHITECTURE.md",
        "core",
        "ARCHITECTURE",
        [
          "The five-layer model composes in order:",
          "1. AGENTS.md (global rules)",
          "2. agents/ (the specialist)",
          "3. workflows/ (the process)",
        ].join("\n"),
      ),
      makeDoc("AGENTS.md", "core", "AGENTS", "constitution"),
      makeDoc("agents/a.md", "agent", "Agent A", "content"),
      makeDoc("workflows/w.md", "workflow", "Workflow W", "content"),
    ];
    const edges = deriveEdges(files);
    expect(
      edges.some(
        (e) => e.source === "AGENTS.md" && e.target === "agents/a.md" && e.kind === "flow",
      ),
    ).toBe(true);
    expect(
      edges.some(
        (e) =>
          e.source === "agents/a.md" &&
          e.target === "workflows/w.md" &&
          e.kind === "flow",
      ),
    ).toBe(true);
  });

  it("never links a document to itself", () => {
    const files = [
      makeDoc("agents/a.md", "agent", "Agent A", "Agent A talks about `agents/a.md`."),
    ];
    expect(deriveEdges(files).every((e) => e.source !== e.target)).toBe(true);
  });
});
