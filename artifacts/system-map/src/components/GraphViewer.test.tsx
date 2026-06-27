import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, fireEvent, waitFor, act } from "@testing-library/react";
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
  it("draws only the routing skeleton ambiently (no flow hairball) and caps beads to it", () => {
    const routingCount = 6;
    const flowCount = 40;
    const { nodes, edges } = denseGraph(routingCount, flowCount);

    const { container } = render(
      <GraphViewer {...baseProps} nodes={nodes} edges={edges} />,
    );

    const beadCount = beads(container).length;
    const routingDrawn = staticEdges(container, "routing").length;
    const flowDrawn = staticEdges(container, "flow").length;

    // The dense flow layer is no longer drawn as an ambient layer at any zoom —
    // drawn all at once it was the laggy, unreadable hairball. Only the routing
    // skeleton stays on by default; flow wiring is shown strictly on demand.
    expect(flowDrawn).toBe(0);
    expect(routingDrawn).toBe(routingCount);

    // Beads stay bounded to the routing-edge count, never routing + flow. This is
    // the exact regression: re-attaching a bead per flow edge would make this
    // equal routingCount + flowCount and bring the stutter back.
    expect(beadCount).toBe(routingCount);
    expect(beadCount).toBeLessThan(routingCount + flowCount);
  });

  it("reveals a flow edge and its bead only when an endpoint is selected (at any zoom)", () => {
    const nodes = [node("a"), node("b", "workflow")];
    const edges = [edge("a", "b", "flow")];

    // No selection: the flow edge is not drawn at all (so it has no bead).
    const { container, rerender } = render(
      <GraphViewer {...baseProps} nodes={nodes} edges={edges} />,
    );
    expect(staticEdges(container, "flow").length).toBe(0);
    expect(beads(container).length).toBe(0);

    // Selecting an endpoint reveals its flow wiring and the wiring's bead.
    rerender(
      <GraphViewer
        {...baseProps}
        nodes={nodes}
        edges={edges}
        selectedNodeId="a"
      />,
    );
    expect(staticEdges(container, "flow").length).toBe(1);
    expect(beads(container).length).toBe(1);
  });

  it("reveals + animates only the flow edge between two involved nodes during a live run", () => {
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

    // Only the involved a<->b pair is revealed and animated; a<->c (c is not
    // involved, nothing is hovered) stays hidden — wiring is on-demand only.
    expect(staticEdges(container, "flow").length).toBe(1);
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

// ---------------------------------------------------------------------------
// Interaction "lit vs dimmed" coverage. The Kaart's legibility rests on a
// single derived signal — `isNodeDimmed` — that drives each node group's
// opacity (lit = 1, dimmed = 0.2). It fans out from four sources that are easy
// to silently break in a refactor: hover (node + neighbours), selection,
// the service-line lens, and search. A dimmed node still renders its label at
// the default zoom, so we can locate any node by its label text and read the
// opacity its dim/lit state resolved to.
// ---------------------------------------------------------------------------

// At the default scale (1) every label is fully drawn (LOD ramp tops out at
// 1.0), so each node — lit or dimmed — has a <text> we can find it by. A node's
// outer <g> (the one carrying the dim opacity) is that label's direct parent.
function nodeGroup(root: HTMLElement, title: string): SVGGElement {
  const label = Array.from(root.querySelectorAll("text")).find(
    (t) => t.textContent === title,
  );
  if (!label) throw new Error(`no node label rendered for "${title}"`);
  return label.parentElement as unknown as SVGGElement;
}

// The opacity a node's dim/lit state resolved to ("1" lit, "0.2" dimmed).
const nodeOpacity = (root: HTMLElement, title: string) =>
  nodeGroup(root, title).style.opacity;

describe("GraphViewer hover / selection highlighting", () => {
  it("lights a hovered node and its neighbours while dimming the rest", () => {
    // hub <-> n1 are wired; n2 is unconnected (not a neighbour of hub).
    const nodes = [node("hub"), node("n1"), node("n2")];
    const edges = [edge("hub", "n1", "routing")];

    const { container } = render(
      <GraphViewer {...baseProps} nodes={nodes} edges={edges} />,
    );

    // Idle: nothing is dimmed, the whole map reads at full strength.
    expect(nodeOpacity(container, "hub")).toBe("1");
    expect(nodeOpacity(container, "n1")).toBe("1");
    expect(nodeOpacity(container, "n2")).toBe("1");

    // Hover the hub: hub + its neighbour n1 stay lit, the unrelated n2 recedes.
    fireEvent.mouseEnter(nodeGroup(container, "hub"));
    expect(nodeOpacity(container, "hub")).toBe("1");
    expect(nodeOpacity(container, "n1")).toBe("1");
    expect(nodeOpacity(container, "n2")).toBe("0.2");

    // Leaving clears the spotlight so the map returns to full strength.
    fireEvent.mouseLeave(nodeGroup(container, "hub"));
    expect(nodeOpacity(container, "n2")).toBe("1");
  });

  it("dims everything except the selected node and lights its wiring", () => {
    // Selection is sharper than hover: only the selected node stays lit (even a
    // direct neighbour recedes), but the edge touching it is highlighted.
    const nodes = [node("hub"), node("n1"), node("n2")];
    const edges = [edge("hub", "n1", "routing")];

    const { container } = render(
      <GraphViewer
        {...baseProps}
        nodes={nodes}
        edges={edges}
        selectedNodeId="hub"
      />,
    );

    expect(nodeOpacity(container, "hub")).toBe("1");
    expect(nodeOpacity(container, "n1")).toBe("0.2");
    expect(nodeOpacity(container, "n2")).toBe("0.2");

    // The routing edge touching the selection reveals its living-pipeline bead
    // (the same hover/selection escape hatch the bead-cap suite relies on).
    expect(beads(container).length).toBe(1);
  });
});

describe("GraphViewer service-line lens", () => {
  // a -> b lives entirely inside the lit cluster; b -> c leaves it.
  const lensNodes = [node("a"), node("b", "workflow"), node("c", "workflow")];
  const lensEdges = [edge("a", "b", "flow"), edge("b", "c", "flow")];

  it("lights only the chosen cluster and culls wiring that leaves it", () => {
    const { container } = render(
      <GraphViewer
        {...baseProps}
        nodes={lensNodes}
        edges={lensEdges}
        lensNodeIds={new Set(["a", "b"])}
      />,
    );

    // The lens lights its cluster (a, b) and dims everything outside it (c).
    expect(nodeOpacity(container, "a")).toBe("1");
    expect(nodeOpacity(container, "b")).toBe("1");
    expect(nodeOpacity(container, "c")).toBe("0.2");

    // Only the wholly-internal a->b edge is revealed; b->c (leaving the
    // cluster) is culled.
    expect(staticEdges(container, "flow").length).toBe(1);
  });

  it("yields to an active live run, which takes precedence over the lens", () => {
    const { container } = render(
      <GraphViewer
        {...baseProps}
        nodes={lensNodes}
        edges={lensEdges}
        lensNodeIds={new Set(["a", "b"])}
        involvedNodeIds={new Set(["c"])}
      />,
    );

    // The run spotlight wins: the involved node (c) is lit and the lens cluster
    // (a, b) recedes — the exact inverse of the lens-only framing above.
    expect(nodeOpacity(container, "c")).toBe("1");
    expect(nodeOpacity(container, "a")).toBe("0.2");
    expect(nodeOpacity(container, "b")).toBe("0.2");

    // A run reveals only wiring between two involved nodes; the single involved
    // node (c) has no such edge and nothing is hovered, so no flow wiring is
    // drawn (it is shown strictly on demand, never ambiently).
    expect(staticEdges(container, "flow").length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Zoom level-of-detail (LOD). The doc graph is dense (~800 edges); drawn all at
// once the overview collapses into a hairball. So each edge class fades in with
// zoom: the dense flow / reference / mention wiring is NOT revealed by zoom at
// all anymore (drawn all at once it was the laggy, unreadable hairball) — only
// the routing skeleton is drawn ambiently, and the dense wiring appears strictly
// on demand (hover/selection, live run, lens). Non-anchor node labels are the
// one thing that still fades with zoom, while core docs and the central hub stay
// labelled at every zoom. This is exactly the kind of thresholded logic that
// breaks silently in a refactor. The `initialScale` prop is the seam that drives
// the same `scale` state onTransformed feeds at runtime. A node's label <text>
// existing tells us its label is drawn at the given zoom; counting static edges
// by arrowhead marker tells us which classes survive the cull.
// ---------------------------------------------------------------------------

const labelDrawn = (root: HTMLElement, title: string) =>
  Array.from(root.querySelectorAll("text")).some((t) => t.textContent === title);

describe("GraphViewer wiring reveal & label LOD", () => {
  it("draws only the routing skeleton ambiently (dense classes culled) regardless of zoom", () => {
    // One of every relationship class, each between two real nodes.
    const nodes = [
      node("orchestrator"),
      node("agent-a"),
      node("wf-a", "workflow"),
      node("wf-b", "workflow"),
      node("doc-a", "knowledge"),
      node("doc-b", "knowledge"),
    ];
    const edges = [
      edge("orchestrator", "agent-a", "routing"),
      edge("wf-a", "wf-b", "flow"),
      edge("doc-a", "doc-b", "reference"),
      edge("agent-a", "doc-a", "mention"),
    ];

    // Far out AND zoomed in: only the always-on routing backbone is drawn; the
    // dense classes are never faded in by zoom (that was the laggy hairball).
    for (const initialScale of [0.3, 1.4]) {
      const { container, unmount } = render(
        <GraphViewer {...baseProps} nodes={nodes} edges={edges} initialScale={initialScale} />,
      );
      expect(staticEdges(container, "routing").length).toBe(1);
      expect(staticEdges(container, "flow").length).toBe(0);
      expect(staticEdges(container, "reference").length).toBe(0);
      expect(staticEdges(container, "mention").length).toBe(0);
      unmount();
    }
  });

  it("reveals a node's own dense wiring on selection (the on-demand replacement for zoom reveal)", () => {
    const nodes = [
      node("orchestrator"),
      node("agent-a"),
      node("wf-a", "workflow"),
      node("wf-b", "workflow"),
      node("doc-a", "knowledge"),
      node("doc-b", "knowledge"),
    ];
    const edges = [
      edge("orchestrator", "agent-a", "routing"),
      edge("wf-a", "wf-b", "flow"),
      edge("doc-a", "doc-b", "reference"),
      edge("agent-a", "doc-a", "mention"),
    ];

    // Selecting wf-a reveals only the wiring touching it (the wf-a<->wf-b flow
    // edge), at any zoom — not the unrelated reference / mention edges.
    const { container } = render(
      <GraphViewer
        {...baseProps}
        nodes={nodes}
        edges={edges}
        initialScale={1.4}
        selectedNodeId="wf-a"
      />,
    );

    expect(staticEdges(container, "routing").length).toBe(1);
    expect(staticEdges(container, "flow").length).toBe(1);
    expect(staticEdges(container, "reference").length).toBe(0);
    expect(staticEdges(container, "mention").length).toBe(0);
  });

  it("far out, fades non-anchor labels but keeps core docs and the central hub labelled", () => {
    // hub is the most-connected node (it touches every other), so it is the
    // central anchor; a core doc is anchored by category; plain is neither.
    const nodes = [
      node("hub"),
      node("spoke-1"),
      node("spoke-2"),
      node("plain"),
      node("readme", "core"),
    ];
    const edges = [
      edge("hub", "spoke-1", "routing"),
      edge("hub", "spoke-2", "routing"),
      edge("hub", "plain", "routing"),
      edge("hub", "readme", "routing"),
    ];

    const { container } = render(
      <GraphViewer {...baseProps} nodes={nodes} edges={edges} initialScale={0.3} />,
    );

    // Anchors stay legible to orient from: the central hub and the core doc.
    expect(labelDrawn(container, "hub")).toBe(true);
    expect(labelDrawn(container, "readme")).toBe(true);

    // Ordinary plates read as unlabelled schematic marks far out.
    expect(labelDrawn(container, "spoke-1")).toBe(false);
    expect(labelDrawn(container, "spoke-2")).toBe(false);
    expect(labelDrawn(container, "plain")).toBe(false);

    // Zoomed in, those same ordinary plates regain their labels.
    const { container: close } = render(
      <GraphViewer {...baseProps} nodes={nodes} edges={edges} initialScale={1.4} />,
    );
    expect(labelDrawn(close, "spoke-1")).toBe(true);
    expect(labelDrawn(close, "plain")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Viewport framing. As the real team graph grows, two automatic camera moves
// keep it readable: (1) a one-time auto-fit that frames the whole settled
// layout when a fresh dataset lands, and (2) a live-run spotlight that frames
// the involved team and reserves the docked GenerationPanel's bottom inset so
// the working agents sit ABOVE the panel, never hidden behind it. Both feed
// `setTransform` on a pan/zoom backend that jsdom can't drive, so the component
// exposes an `onFramed` seam reporting the exact {x,y,scale} it computes — the
// same values handed to setTransform. A regression here (framing a half-settled
// layout, re-fitting on every render, or forgetting the panel inset) would
// leave the team off-screen or behind the command bar with no error.
// ---------------------------------------------------------------------------

type Frame = { kind: "fit" | "spotlight"; x: number; y: number; scale: number };

describe("GraphViewer auto-fit overview framing", () => {
  it("frames the settled layout exactly once per fresh dataset", () => {
    const onFramed = vi.fn();
    const { nodes, edges } = denseGraph(8, 30);

    const { rerender } = render(
      <GraphViewer
        {...baseProps}
        nodes={nodes}
        edges={edges}
        onFramed={onFramed}
      />,
    );

    const fits = () =>
      onFramed.mock.calls
        .map(([f]) => f as Frame)
        .filter((f) => f.kind === "fit");

    // The auto-fit fires once, after the simulation settles.
    expect(fits().length).toBe(1);

    // It framed the SETTLED (spread-out) layout: a dense graph relaxes wider
    // than the 800x600 test viewport, so the fit must zoom OUT (scale < 1). A
    // collapsed / half-settled cluster would instead clamp at the 2x max — so
    // this also guards that the fit waits for the final, fully-spread layout.
    const fit = fits()[0];
    expect(fit.scale).toBeLessThan(1);
    expect(fit.scale).toBeGreaterThanOrEqual(0.1);

    // Re-rendering with the SAME dataset must not re-fit — otherwise an
    // unrelated prop change would yank the user's manual pan/zoom back to fit.
    rerender(
      <GraphViewer
        {...baseProps}
        nodes={nodes}
        edges={edges}
        onFramed={onFramed}
      />,
    );
    expect(fits().length).toBe(1);

    // A genuinely new dataset re-arms the one-time fit so the new (larger)
    // arrangement is framed in full.
    const next = denseGraph(10, 36);
    rerender(
      <GraphViewer
        {...baseProps}
        nodes={next.nodes}
        edges={next.edges}
        onFramed={onFramed}
      />,
    );
    expect(fits().length).toBe(2);
  });

  it("skips the auto-fit when a node is already selected (a focus/deep-link wins)", () => {
    const onFramed = vi.fn();
    const { nodes, edges } = denseGraph(6, 12);

    render(
      <GraphViewer
        {...baseProps}
        nodes={nodes}
        edges={edges}
        selectedNodeId="agent-0"
        onFramed={onFramed}
      />,
    );

    // The selection drives its own focus; the overview auto-fit must stand down
    // so it doesn't fight that framing.
    expect(
      onFramed.mock.calls.map(([f]) => f as Frame).filter((f) => f.kind === "fit")
        .length,
    ).toBe(0);
  });
});

describe("GraphViewer live-run spotlight framing", () => {
  // A single involved node is pinned to the viewport centre by forceCenter
  // ((400,300) in the default 800x600 test viewport), so the framing math is
  // exact and the panel-inset reserve can be asserted precisely.
  const CX = 400;
  const CY = 300;
  const H = 600;
  const solo = [node("solo")];

  async function captureSpotlight(frameBottomInset: number): Promise<Frame> {
    const onFramed = vi.fn();
    render(
      <GraphViewer
        {...baseProps}
        nodes={solo}
        edges={[]}
        spotlightNodeIds={["solo"]}
        spotlightNonce={1}
        frameBottomInset={frameBottomInset}
        onFramed={onFramed}
      />,
    );
    // The spotlight frames on the next animation frame (so freshly-filtered
    // nodes are positioned first), so wait for that to flush.
    await waitFor(() =>
      expect(
        onFramed.mock.calls.some(([f]) => (f as Frame).kind === "spotlight"),
      ).toBe(true),
    );
    return onFramed.mock.calls
      .map(([f]) => f as Frame)
      .find((f) => f.kind === "spotlight")!;
  }

  it("frames the involved team and reserves the docked panel's bottom inset", async () => {
    // No docked panel: the team is centred in the FULL viewport.
    const open = await captureSpotlight(0);
    expect(open.kind).toBe("spotlight");
    // Horizontal centring (unaffected by the bottom inset): node centre maps to
    // the middle of the viewport width.
    expect(open.x + CX * open.scale).toBeCloseTo(400, 3);
    // Vertical centre lands at the middle of the full viewport.
    expect(open.y + CY * open.scale).toBeCloseTo(H / 2, 3);

    // A tall docked panel: the SAME team must be lifted into the band ABOVE the
    // panel — centred within (viewport height - inset), never behind it.
    const inset = 300;
    const docked = await captureSpotlight(inset);
    expect(docked.x + CX * docked.scale).toBeCloseTo(400, 3);
    expect(docked.y + CY * docked.scale).toBeCloseTo((H - inset) / 2, 3);

    // The reserved band sits strictly higher than the full-viewport centre, and
    // shrinking the usable area only zooms the framing out (never in).
    expect((H - inset) / 2).toBeLessThan(H / 2);
    expect(docked.scale).toBeLessThanOrEqual(open.scale);
  });

  it("does not spotlight without a nonce", async () => {
    const onFramed = vi.fn();
    render(
      <GraphViewer
        {...baseProps}
        nodes={solo}
        edges={[]}
        spotlightNodeIds={["solo"]}
        onFramed={onFramed}
      />,
    );
    // Give any pending animation frame a chance to flush, then confirm nothing
    // was spotlit (the auto-fit may still run; only spotlight is gated here).
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(
      onFramed.mock.calls.some(([f]) => (f as Frame).kind === "spotlight"),
    ).toBe(false);
  });
});

describe("GraphViewer search highlighting", () => {
  it("lights nodes whose title matches the query and dims the rest", () => {
    const nodes = [node("alpha-one"), node("alpha-two"), node("beta")];
    const edges = [edge("alpha-one", "alpha-two", "routing")];

    const { container } = render(
      <GraphViewer
        {...baseProps}
        nodes={nodes}
        edges={edges}
        searchQuery="alpha"
      />,
    );

    // Both matches stay lit; the non-matching node recedes.
    expect(nodeOpacity(container, "alpha-one")).toBe("1");
    expect(nodeOpacity(container, "alpha-two")).toBe("1");
    expect(nodeOpacity(container, "beta")).toBe("0.2");
  });

  it("matches case-insensitively", () => {
    const nodes = [node("Copywriter"), node("Strateeg")];

    const { container } = render(
      <GraphViewer
        {...baseProps}
        nodes={nodes}
        edges={[]}
        searchQuery="COPY"
      />,
    );

    expect(nodeOpacity(container, "Copywriter")).toBe("1");
    expect(nodeOpacity(container, "Strateeg")).toBe("0.2");
  });
});
