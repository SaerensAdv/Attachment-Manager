import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, fireEvent, waitFor, act } from "@testing-library/react";
import type { DocNode, DocEdge, DocCategory } from "@workspace/api-client-react";
import GraphViewer from "./GraphViewer";
import { setMatchMedia } from "../test/setup";

const CATEGORIES: DocCategory[] = [
  { id: "agent", label: "Agents", count: 0 },
  { id: "workflow", label: "Workflows", count: 0 },
  { id: "knowledge", label: "Knowledge", count: 0 },
];
function node(id: string, category = "agent"): DocNode { return { id, path: id, title: id, category, summary: null, fanout: null }; }
function edge(source: string, target: string, kind: string): DocEdge { return { source, target, kind }; }
const beads = (root: HTMLElement) => root.querySelectorAll(".atlas-flow-line");
const staticEdges = (root: HTMLElement, kind: string) => root.querySelectorAll(`path[marker-end="url(#arrow-${kind})"]`);
function denseGraph(routingCount: number, flowCount: number) {
  const nodes: DocNode[] = [node("orchestrator")]; const edges: DocEdge[] = [];
  for (let i = 0; i < routingCount; i++) { const id = `agent-${i}`; nodes.push(node(id)); edges.push(edge("orchestrator", id, "routing")); }
  for (let i = 0; i < flowCount; i++) { const a = `wf-${i}`; const b = `wf-${i + 1}`; nodes.push(node(a, "workflow")); if (i === flowCount - 1) nodes.push(node(b, "workflow")); edges.push(edge(a, b, "flow")); }
  return { nodes, edges };
}
const baseProps = { categories: CATEGORIES, selectedNodeId: null, onSelectNode: () => {}, searchQuery: "" };

describe("GraphViewer living-pipeline bead cap", () => {
  it("draws only the routing skeleton ambiently (no flow hairball) and caps beads to it", () => {
    const routingCount = 6; const flowCount = 40; const { nodes, edges } = denseGraph(routingCount, flowCount);
    const { container } = render(<GraphViewer {...baseProps} nodes={nodes} edges={edges} />);
    expect(staticEdges(container, "flow").length).toBe(0); expect(staticEdges(container, "routing").length).toBe(routingCount);
    expect(beads(container).length).toBe(routingCount); expect(beads(container).length).toBeLessThan(routingCount + flowCount);
  });
  it("reveals a flow edge and its bead only when an endpoint is selected (at any zoom)", () => {
    const nodes = [node("a"), node("b", "workflow")]; const edges = [edge("a", "b", "flow")];
    const { container, rerender } = render(<GraphViewer {...baseProps} nodes={nodes} edges={edges} />);
    expect(staticEdges(container, "flow").length).toBe(0); expect(beads(container).length).toBe(0);
    rerender(<GraphViewer {...baseProps} nodes={nodes} edges={edges} selectedNodeId="a" />);
    expect(staticEdges(container, "flow").length).toBe(1); expect(beads(container).length).toBe(1);
  });
  it("reveals + animates only the flow edge between two involved nodes during a live run", () => {
    const nodes = [node("a"), node("b", "workflow"), node("c", "workflow")]; const edges = [edge("a", "b", "flow"), edge("a", "c", "flow")];
    const { container } = render(<GraphViewer {...baseProps} nodes={nodes} edges={edges} involvedNodeIds={new Set(["a", "b"])} />);
    expect(staticEdges(container, "flow").length).toBe(1); expect(beads(container).length).toBe(1);
  });
  it("emits no JS-driven .atlas-* animation classes under prefers-reduced-motion", () => {
    setMatchMedia(true);
    const nodes = [node("a"), node("b", "workflow")]; const edges = [edge("a", "b", "flow")];
    const { container } = render(<GraphViewer {...baseProps} nodes={nodes} edges={edges} involvedNodeIds={new Set(["a", "b"])} activeNodeId="a" handoff={{ source: "a", target: "b" }} nodeStatus={new Map([["a", "working"], ["b", "queued"]])} />);
    for (const cls of ["atlas-handoff-line", "atlas-node-pulse", "atlas-node-ping", "atlas-frame-in", "atlas-spin", "atlas-spin-slow"]) expect(container.querySelectorAll(`.${cls}`).length).toBe(0);
  });
});

describe("reduced-motion stylesheet coverage", () => {
  const css = readFileSync(path.resolve(process.cwd(), "src/index.css"), "utf8");
  const animatedAtlasClasses = () => {
    const found = new Set<string>(); const ruleRe = /\.(atlas-[\w-]+)\s*\{([^}]*)\}/g; let m: RegExpExecArray | null;
    while ((m = ruleRe.exec(css)) !== null) { const [, name, body] = m; if (/animation:\s*(?!none)[^;]*\b\d/.test(body)) found.add(name); }
    return found;
  };
  const reducedMotionBlock = () => {
    const idx = css.indexOf("prefers-reduced-motion"); expect(idx).toBeGreaterThan(-1);
    const none = /animation:\s*none/.exec(css.slice(idx)); expect(none).not.toBeNull();
    const noneIndex = idx + (none?.index ?? 0);
    return css.slice(idx, css.indexOf("}", noneIndex) + 1);
  };
  it("disables animation for every animated .atlas-* class", () => {
    const animated = animatedAtlasClasses(); const block = reducedMotionBlock();
    expect(animated.has("atlas-flow-line")).toBe(true); expect(block).toMatch(/animation:\s*none/);
    for (const cls of animated) expect(block.includes(`.${cls}`)).toBe(true);
  });
});

function nodeGroup(root: HTMLElement, title: string): SVGGElement { const label = Array.from(root.querySelectorAll("text")).find((t) => t.textContent === title); if (!label) throw new Error(`no node label rendered for "${title}"`); return label.parentElement as unknown as SVGGElement; }
const nodeOpacity = (root: HTMLElement, title: string) => nodeGroup(root, title).style.opacity;

describe("GraphViewer hover / selection highlighting", () => {
  it("lights a hovered node and its neighbours while dimming the rest", () => {
    const nodes = [node("hub"), node("n1"), node("n2")]; const edges = [edge("hub", "n1", "routing")]; const { container } = render(<GraphViewer {...baseProps} nodes={nodes} edges={edges} />);
    expect(nodeOpacity(container, "hub")).toBe("1"); expect(nodeOpacity(container, "n1")).toBe("1"); expect(nodeOpacity(container, "n2")).toBe("1");
    fireEvent.mouseEnter(nodeGroup(container, "hub")); expect(nodeOpacity(container, "hub")).toBe("1"); expect(nodeOpacity(container, "n1")).toBe("1"); expect(nodeOpacity(container, "n2")).toBe("0.2");
    fireEvent.mouseLeave(nodeGroup(container, "hub")); expect(nodeOpacity(container, "n2")).toBe("1");
  });
  it("dims everything except the selected node and lights its wiring", () => {
    const nodes = [node("hub"), node("n1"), node("n2")]; const edges = [edge("hub", "n1", "routing")]; const { container } = render(<GraphViewer {...baseProps} nodes={nodes} edges={edges} selectedNodeId="hub" />);
    expect(nodeOpacity(container, "hub")).toBe("1"); expect(nodeOpacity(container, "n1")).toBe("0.2"); expect(nodeOpacity(container, "n2")).toBe("0.2"); expect(beads(container).length).toBe(1);
  });
});

describe("GraphViewer service-line lens", () => {
  const lensNodes = [node("a"), node("b", "workflow"), node("c", "workflow")]; const lensEdges = [edge("a", "b", "flow"), edge("b", "c", "flow")];
  it("lights only the chosen cluster and culls wiring that leaves it", () => {
    const { container } = render(<GraphViewer {...baseProps} nodes={lensNodes} edges={lensEdges} lensNodeIds={new Set(["a", "b"])} />);
    expect(nodeOpacity(container, "a")).toBe("1"); expect(nodeOpacity(container, "b")).toBe("1"); expect(nodeOpacity(container, "c")).toBe("0.2"); expect(staticEdges(container, "flow").length).toBe(1);
  });
  it("yields to an active live run, which takes precedence over the lens", () => {
    const { container } = render(<GraphViewer {...baseProps} nodes={lensNodes} edges={lensEdges} lensNodeIds={new Set(["a", "b"])} involvedNodeIds={new Set(["c"])} />);
    expect(nodeOpacity(container, "c")).toBe("1"); expect(nodeOpacity(container, "a")).toBe("0.2"); expect(nodeOpacity(container, "b")).toBe("0.2"); expect(staticEdges(container, "flow").length).toBe(0);
  });
});
const labelDrawn = (root: HTMLElement, title: string) => Array.from(root.querySelectorAll("text")).some((t) => t.textContent === title);

describe("GraphViewer wiring reveal & label LOD", () => {
  const nodes = [node("orchestrator"), node("agent-a"), node("wf-a", "workflow"), node("wf-b", "workflow"), node("doc-a", "knowledge"), node("doc-b", "knowledge")];
  const edges = [edge("orchestrator", "agent-a", "routing"), edge("wf-a", "wf-b", "flow"), edge("doc-a", "doc-b", "reference"), edge("agent-a", "doc-a", "mention")];
  it("draws only the routing skeleton ambiently (dense classes culled) regardless of zoom", () => { for (const initialScale of [0.3, 1.4]) { const { container, unmount } = render(<GraphViewer {...baseProps} nodes={nodes} edges={edges} initialScale={initialScale} />); expect(staticEdges(container, "routing").length).toBe(1); expect(staticEdges(container, "flow").length).toBe(0); expect(staticEdges(container, "reference").length).toBe(0); expect(staticEdges(container, "mention").length).toBe(0); unmount(); } });
  it("reveals a node's own dense wiring on selection", () => { const { container } = render(<GraphViewer {...baseProps} nodes={nodes} edges={edges} initialScale={1.4} selectedNodeId="wf-a" />); expect(staticEdges(container, "routing").length).toBe(1); expect(staticEdges(container, "flow").length).toBe(1); expect(staticEdges(container, "reference").length).toBe(0); expect(staticEdges(container, "mention").length).toBe(0); });
  it("far out, fades non-anchor labels but keeps core docs and the central hub labelled", () => {
    const labelNodes = [node("hub"), node("spoke-1"), node("spoke-2"), node("plain"), node("readme", "core")]; const labelEdges = [edge("hub", "spoke-1", "routing"), edge("hub", "spoke-2", "routing"), edge("hub", "plain", "routing"), edge("hub", "readme", "routing")];
    const { container } = render(<GraphViewer {...baseProps} nodes={labelNodes} edges={labelEdges} initialScale={0.3} />); expect(labelDrawn(container, "hub")).toBe(true); expect(labelDrawn(container, "readme")).toBe(true); expect(labelDrawn(container, "plain")).toBe(false);
    const { container: close } = render(<GraphViewer {...baseProps} nodes={labelNodes} edges={labelEdges} initialScale={1.4} />); expect(labelDrawn(close, "spoke-1")).toBe(true); expect(labelDrawn(close, "plain")).toBe(true);
  });
});

type Frame = { kind: "fit" | "spotlight"; x: number; y: number; scale: number };
describe("GraphViewer auto-fit overview framing", () => {
  it("frames the settled layout exactly once per fresh dataset", () => { const onFramed = vi.fn(); const { nodes, edges } = denseGraph(8, 30); const { rerender } = render(<GraphViewer {...baseProps} nodes={nodes} edges={edges} onFramed={onFramed} />); const fits = () => onFramed.mock.calls.map(([f]) => f as Frame).filter((f) => f.kind === "fit"); expect(fits().length).toBe(1); expect(fits()[0].scale).toBeLessThan(1); rerender(<GraphViewer {...baseProps} nodes={nodes} edges={edges} onFramed={onFramed} />); expect(fits().length).toBe(1); const next = denseGraph(10, 36); rerender(<GraphViewer {...baseProps} nodes={next.nodes} edges={next.edges} onFramed={onFramed} />); expect(fits().length).toBe(2); });
  it("skips the auto-fit when a node is already selected", () => { const onFramed = vi.fn(); const { nodes, edges } = denseGraph(6, 12); render(<GraphViewer {...baseProps} nodes={nodes} edges={edges} selectedNodeId="agent-0" onFramed={onFramed} />); expect(onFramed.mock.calls.map(([f]) => f as Frame).filter((f) => f.kind === "fit").length).toBe(0); });
});

describe("GraphViewer live-run spotlight framing", () => {
  const CX = 400; const CY = 300; const H = 600; const solo = [node("solo")];
  async function captureSpotlight(frameBottomInset: number): Promise<Frame> { const onFramed = vi.fn(); render(<GraphViewer {...baseProps} nodes={solo} edges={[]} spotlightNodeIds={["solo"]} spotlightNonce={1} frameBottomInset={frameBottomInset} onFramed={onFramed} />); await waitFor(() => expect(onFramed.mock.calls.some(([f]) => (f as Frame).kind === "spotlight")).toBe(true)); return onFramed.mock.calls.map(([f]) => f as Frame).find((f) => f.kind === "spotlight")!; }
  it("frames the involved team and reserves the docked panel's bottom inset", async () => { const open = await captureSpotlight(0); expect(open.x + CX * open.scale).toBeCloseTo(400, 3); expect(open.y + CY * open.scale).toBeCloseTo(H / 2, 3); const docked = await captureSpotlight(300); expect(docked.y + CY * docked.scale).toBeCloseTo(150, 3); expect(docked.scale).toBeLessThanOrEqual(open.scale); });
  const spotlights = (fn: ReturnType<typeof vi.fn>): Frame[] => fn.mock.calls.map(([f]) => f as Frame).filter((f) => f.kind === "spotlight");
  it("re-frames as the panel grows mid-run, but ignores tiny inset jitter", async () => { const onFramed = vi.fn(); const { rerender } = render(<GraphViewer {...baseProps} nodes={solo} edges={[]} involvedNodeIds={new Set(["solo"])} spotlightNodeIds={["solo"]} spotlightNonce={1} frameBottomInset={0} onFramed={onFramed} />); await waitFor(() => expect(spotlights(onFramed).length).toBe(1)); rerender(<GraphViewer {...baseProps} nodes={solo} edges={[]} involvedNodeIds={new Set(["solo"])} spotlightNodeIds={["solo"]} spotlightNonce={1} frameBottomInset={20} onFramed={onFramed} />); await act(() => new Promise((r) => setTimeout(r, 0))); expect(spotlights(onFramed).length).toBe(1); rerender(<GraphViewer {...baseProps} nodes={solo} edges={[]} involvedNodeIds={new Set(["solo"])} spotlightNodeIds={["solo"]} spotlightNonce={1} frameBottomInset={200} onFramed={onFramed} />); await waitFor(() => expect(spotlights(onFramed).length).toBe(2)); });
  it("stops tracking the panel once the run ends", async () => { const onFramed = vi.fn(); const { rerender } = render(<GraphViewer {...baseProps} nodes={solo} edges={[]} involvedNodeIds={new Set(["solo"])} spotlightNodeIds={["solo"]} spotlightNonce={1} frameBottomInset={0} onFramed={onFramed} />); await waitFor(() => expect(spotlights(onFramed).length).toBe(1)); rerender(<GraphViewer {...baseProps} nodes={solo} edges={[]} involvedNodeIds={new Set()} spotlightNodeIds={["solo"]} spotlightNonce={1} frameBottomInset={300} onFramed={onFramed} />); await act(() => new Promise((r) => setTimeout(r, 0))); expect(spotlights(onFramed).length).toBe(1); });
  it("does not spotlight without a nonce", async () => { const onFramed = vi.fn(); render(<GraphViewer {...baseProps} nodes={solo} edges={[]} spotlightNodeIds={["solo"]} onFramed={onFramed} />); await act(() => new Promise((r) => setTimeout(r, 0))); expect(onFramed.mock.calls.some(([f]) => (f as Frame).kind === "spotlight")).toBe(false); });
});

describe("GraphViewer search highlighting", () => {
  it("lights nodes whose title matches the query and dims the rest", () => { const nodes = [node("alpha-one"), node("alpha-two"), node("beta")]; const { container } = render(<GraphViewer {...baseProps} nodes={nodes} edges={[edge("alpha-one", "alpha-two", "routing")]} searchQuery="alpha" />); expect(nodeOpacity(container, "alpha-one")).toBe("1"); expect(nodeOpacity(container, "alpha-two")).toBe("1"); expect(nodeOpacity(container, "beta")).toBe("0.2"); });
  it("matches case-insensitively", () => { const { container } = render(<GraphViewer {...baseProps} nodes={[node("Copywriter"), node("Strateeg")]} edges={[]} searchQuery="COPY" />); expect(nodeOpacity(container, "Copywriter")).toBe("1"); expect(nodeOpacity(container, "Strateeg")).toBe("0.2"); });
});
