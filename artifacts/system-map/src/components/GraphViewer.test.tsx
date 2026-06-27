import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import type { DocNode, DocEdge, DocCategory } from "@workspace/api-client-react";
import GraphViewer from "./GraphViewer";
import { setMatchMedia } from "../test/setup";

// ---------------------------------------------------------------------------
// These tests guard the "zoom stutter" fix (Task #89): the always-on living
// pipeline bead animation (`.atlas-flow-line`) must stay capped to the routing
// skeleton (plus hover/selection and live-run reveals). A future change to the
// edge-rendering or LOD logic that silently re-attaches a bead to every flow
// edge would re-introduce the hundreds-of-animated-paths repaint cost, so these
// assertions lock the cap and its two reveal escape hatches in place.
// ---------------------------------------------------------------------------

const CATEGORIES: DocCategory[] = [
  { id: "agent", label: "Agents", count: 0 },
  { id: "workflow", label: "Workflows", count: 0 },
  { id: "knowledge", label: "Knowledge", count: 0 },
];

function node(id: string, category = "agent"): DocNode {
  return { id, path: id, title: id, category, summary: null, fanout: null };
}

function edge(source: string, target: string, kind: string): DocEdge {
  return { source, target, kind };
}

// Helpers reading the rendered SVG. A bead is a `<path class="atlas-flow-line">`;
// a static edge line carries a kind-specific arrowhead marker, so counting by
// marker tells us how many routing / flow edges are actually drawn (visible).
const beads = (root: HTMLElement) => root.querySelectorAll(".atlas-flow-line");
const staticEdges = (root: HTMLElement, kind: string) =>
  root.querySelectorAll(`path[marker-end="url(#arrow-${kind})"]`);

// A dense graph: a routing skeleton (orchestrator -> specialists) plus a much
// larger flow layer, mirroring the real map where the flow edges dominate.
function denseGraph(routingCount: number, flowCount: number) {
  const nodes: DocNode[] = [node("orchestrator")];
  const edges: DocEdge[] = [];

  for (let i = 0; i < routingCount; i++) {
    const id = `agent-${i}`;
    nodes.push(node(id));
    edges.push(edge("orchestrator", id, "routing"));
  }

  // Flow edges chain workflow nodes together so every one is a distinct edge
  // between two real nodes (d3-force throws on dangling endpoints).
  for (let i = 0; i < flowCount; i++) {
    const a = `wf-${i}`;
    const b = `wf-${i + 1}`;
    nodes.push(node(a, "workflow"));
    if (i === flowCount - 1) nodes.push(node(b, "workflow"));
    edges.push(edge(a, b, "flow"));
  }

  return { nodes, edges };
}

const baseProps = {
  categories: CATEGORIES,
  selectedNodeId: null,
  onSelectNode: () => {},
  searchQuery: "",
};

describe("GraphViewer living-pipeline bead cap", () => {
  it("caps ambient beads to the routing skeleton even with a dense flow layer", () => {
    const routingCount = 6;
    const flowCount = 40;
    const { nodes, edges } = denseGraph(routingCount, flowCount);

    const { container } = render(
      <GraphViewer {...baseProps} nodes={nodes} edges={edges} />,
    );

    const beadCount = beads(container).length;
    const routingDrawn = staticEdges(container, "routing").length;
    const flowDrawn = staticEdges(container, "flow").length;

    // The flow layer is fully drawn (visible) at the default zoom, so the cap is
    // meaningful: these edges exist in the DOM but must NOT each carry a bead.
    expect(flowDrawn).toBe(flowCount);
    expect(routingDrawn).toBe(routingCount);

    // Beads stay bounded to the routing-edge count, NOT routing + flow. This is
    // the exact regression: re-attaching a bead per flow edge would make this
    // equal routingCount + flowCount and bring the stutter back.
    expect(beadCount).toBe(routingCount);
    expect(beadCount).toBeLessThan(routingCount + flowCount);
  });

  it("reveals a bead on a flow edge when one of its endpoints is selected (at any zoom)", () => {
    const nodes = [node("a"), node("b", "workflow")];
    const edges = [edge("a", "b", "flow")];

    // No selection: a lone flow edge gets no ambient bead.
    const { container, rerender } = render(
      <GraphViewer {...baseProps} nodes={nodes} edges={edges} />,
    );
    expect(staticEdges(container, "flow").length).toBe(1);
    expect(beads(container).length).toBe(0);

    // Selecting an endpoint reveals the bead on its flow wiring.
    rerender(
      <GraphViewer
        {...baseProps}
        nodes={nodes}
        edges={edges}
        selectedNodeId="a"
      />,
    );
    expect(beads(container).length).toBe(1);
  });

  it("forces a flow edge between two involved nodes visible + animated during a live run", () => {
    // Two flow edges share node a; only a<->b is between two involved nodes.
    const nodes = [node("a"), node("b", "workflow"), node("c", "workflow")];
    const edges = [edge("a", "b", "flow"), edge("a", "c", "flow")];

    const { container } = render(
      <GraphViewer
        {...baseProps}
        nodes={nodes}
        edges={edges}
        involvedNodeIds={new Set(["a", "b"])}
      />,
    );

    // Both flow edges are drawn, but only the involved a<->b pair is animated.
    expect(staticEdges(container, "flow").length).toBe(2);
    expect(beads(container).length).toBe(1);
  });

  it("emits no JS-driven .atlas-* animation classes under prefers-reduced-motion", () => {
    setMatchMedia(true);

    // A live run would normally light up handoff lines, node pulses/pings and
    // frame-in transitions — all gated behind `!reducedMotion` in the component.
    const nodes = [node("a"), node("b", "workflow")];
    const edges = [edge("a", "b", "flow")];

    const { container } = render(
      <GraphViewer
        {...baseProps}
        nodes={nodes}
        edges={edges}
        involvedNodeIds={new Set(["a", "b"])}
        activeNodeId="a"
        handoff={{ source: "a", target: "b" }}
        nodeStatus={new Map([["a", "working"], ["b", "queued"]])}
      />,
    );

    for (const cls of [
      "atlas-handoff-line",
      "atlas-node-pulse",
      "atlas-node-ping",
      "atlas-frame-in",
      "atlas-spin",
      "atlas-spin-slow",
    ]) {
      expect(container.querySelectorAll(`.${cls}`).length).toBe(0);
    }
  });
});

describe("reduced-motion stylesheet coverage", () => {
  // The bead element (.atlas-flow-line) is always rendered; under reduced motion
  // its animation is killed purely in CSS. This guards that EVERY animated
  // .atlas-* class is neutralised by the prefers-reduced-motion block, so a new
  // animation can't ship without a reduced-motion override.
  const css = readFileSync(path.resolve(process.cwd(), "src/index.css"), "utf8");

  const animatedAtlasClasses = () => {
    const found = new Set<string>();
    // Match `.atlas-xxx { ... animation: <not none> ... }` rule blocks.
    const ruleRe = /\.(atlas-[\w-]+)\s*\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = ruleRe.exec(css)) !== null) {
      const [, name, body] = m;
      if (/animation:\s*(?!none)[^;]*\b\d/.test(body)) found.add(name);
    }
    return found;
  };

  const reducedMotionBlock = () => {
    const idx = css.indexOf("prefers-reduced-motion");
    expect(idx).toBeGreaterThan(-1);
    // Capture from the media query to the closing brace of its rule body.
    return css.slice(idx, css.indexOf("}", css.indexOf("animation: none", idx)) + 1);
  };

  it("disables animation for every animated .atlas-* class", () => {
    const animated = animatedAtlasClasses();
    const block = reducedMotionBlock();

    // Sanity: the fix's own bead class is animated and must be covered.
    expect(animated.has("atlas-flow-line")).toBe(true);
    expect(block).toContain("animation: none");

    for (const cls of animated) {
      expect(block.includes(`.${cls}`)).toBe(true);
    }
  });
});
