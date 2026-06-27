import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as d3 from "d3-force";
import { toPng, toSvg } from "html-to-image";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { Maximize2, Plus, Minus, Download, Image as ImageIcon } from "lucide-react";
import type {
  DocNode,
  DocEdge,
  DocCategory,
} from "@workspace/api-client-react";
import {
  safeId,
  edgeStyleFor,
  getCategoryColor,
  PLATE,
  plateWidth,
  LABEL_LOD,
  lodFactor,
  type SimNode,
  type SimEdge,
} from "./graph-viewer-utils";

interface GraphViewerProps {
  nodes: DocNode[];
  edges: DocEdge[];
  categories: DocCategory[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  searchQuery: string;
  focusNonce?: number;
  // Maps a node id (e.g. agents/copywriter.md) to a portrait URL. When present
  // the node renders a circular portrait instead of the plain "press seal".
  portraits?: Record<string, string>;
  // Live-run overlay driven by the Kaart command bar: the routed team's nodes
  // light up (involved), the agent currently writing pulses (active), and an
  // animated hand-off edge flows from the previous agent to the active one.
  involvedNodeIds?: Set<string>;
  activeNodeId?: string | null;
  handoff?: { source: string; target: string } | null;
  // Per-node status tracking during a run (queued, working, done) for rich feedback
  nodeStatus?: Map<string, "queued" | "working" | "done">;
  // Frame this set of nodes when the nonce changes (e.g. a run starts) so the
  // involved team is brought into view without fighting manual pan/zoom.
  spotlightNodeIds?: string[];
  spotlightNonce?: number;
  // Service-line lens (frontend-only): when a set is provided the nodes of the
  // chosen service line — its agents plus the workflows/templates/knowledge they
  // touch, and the always-on Orchestrator/Quality hubs — stay lit and their
  // internal wiring is revealed; everything else recedes. Opt-in and purely
  // visual: the underlying graph and layout are unchanged, so the default view
  // (no lens) is exactly today's map.
  lensNodeIds?: Set<string> | null;
  // Vertical space (px) occupied by the docked GenerationPanel + command bar at
  // the bottom of the viewport. The spotlight framing reserves this region so
  // the live-run rings/pulses/hand-off line are never hidden behind the panel.
  frameBottomInset?: number;
  // Initial viewport zoom. Seeds both the TransformWrapper and the local `scale`
  // state so the level-of-detail (edge/label fade) starts in agreement with the
  // viewport. The runtime keeps `scale` in sync via onTransformed thereafter;
  // this is also the seam tests use to exercise the LOD ramps at a given zoom.
  initialScale?: number;
  // Test/diagnostic seam: invoked whenever the viewport is programmatically
  // framed — the one-time auto-fit overview ("fit") and the live-run spotlight
  // ("spotlight") — with the exact transform handed to the pan/zoom backend.
  // Lets tests assert the framing math (and that the spotlight reserves the
  // docked panel's bottom inset, lifting the team above it) without standing up
  // a real pan/zoom backend. Unused by the app.
  onFramed?: (frame: {
    kind: "fit" | "spotlight";
    x: number;
    y: number;
    scale: number;
  }) => void;
}
export default function GraphViewer({
  nodes,
  edges,
  categories,
  selectedNodeId,
  onSelectNode,
  searchQuery,
  focusNonce,
  portraits,
  involvedNodeIds,
  activeNodeId,
  handoff,
  nodeStatus,
  spotlightNodeIds,
  spotlightNonce,
  frameBottomInset,
  lensNodeIds,
  initialScale = 1,
  onFramed,
}: GraphViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [simEdges, setSimEdges] = useState<SimEdge[]>([]);
  // The node currently under the cursor; drives neighbour highlighting so the
  // dense graph becomes instantly legible on hover, without a click.
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  // Current viewport zoom level, kept in sync via onTransformed so labels can be
  // shown only when zoomed in close enough to read them.
  const [scale, setScale] = useState(initialScale);
  // Live reference to the simulation node objects (mutated in place by d3), so
  // focusing can read current positions without retriggering on every tick.
  const simNodesRef = useRef<SimNode[]>([]);
  // Guards the one-time auto-fit so it only fires after a fresh dataset settles.
  const didAutoFitRef = useRef(false);
  // Bumped when the simulation cools down, so the auto-fit waits for the final
  // (now larger, spread-out) layout instead of framing a half-settled one.
  const [settleNonce, setSettleNonce] = useState(0);
  // Honour the user's reduced-motion preference: skip the pan/zoom easing and
  // the per-node CSS transitions so layout switches land instantly.
  const [reducedMotion, setReducedMotion] = useState(false);
  // True while an export render is in flight, so the button can be disabled and
  // the controls overlay won't be captured mid-click.
  const [isExporting, setIsExporting] = useState(false);
  // Live bottom inset (the docked panel + command bar height) read at framing
  // time so the spotlight keeps the team above the panel as it grows/shrinks.
  const frameBottomInsetRef = useRef(0);
  frameBottomInsetRef.current = frameBottomInset ?? 0;
  // While a spotlight is active, the panel grows from routing-review to its
  // max height; these track that so the framing can follow the growth without
  // re-framing once it plateaus (or after the run ends).
  const spotlightActiveRef = useRef(false);
  const lastFramedInsetRef = useRef(0);

  // Track the reduced-motion media query so animations can be disabled live.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Pause the ambient living-pipeline beads while the user is actively zooming
  // or panning, so the interaction itself stays smooth, then resume once the
  // view is idle. Toggled as a CSS class straight on the container (no React
  // re-render of this heavy component) and debounced so rapid wheel ticks don't
  // flicker the animation back on between steps.
  const interactionTimer = useRef<number | null>(null);
  const markInteracting = useCallback((active: boolean) => {
    const el = containerRef.current;
    if (!el) return;
    if (active) {
      if (interactionTimer.current !== null) {
        clearTimeout(interactionTimer.current);
        interactionTimer.current = null;
      }
      el.classList.add("atlas-interacting");
    } else {
      if (interactionTimer.current !== null) clearTimeout(interactionTimer.current);
      interactionTimer.current = window.setTimeout(() => {
        containerRef.current?.classList.remove("atlas-interacting");
        interactionTimer.current = null;
      }, 220);
    }
  }, []);
  useEffect(() => {
    return () => {
      if (interactionTimer.current !== null) clearTimeout(interactionTimer.current);
    };
  }, []);

  // Update dimensions on resize
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Run D3 Simulation
  useEffect(() => {
    if (!nodes.length) {
      setSimNodes([]);
      setSimEdges([]);
      return;
    }

    const simNodesData: SimNode[] = nodes.map(n => ({ ...n }));
    const simEdgesData: SimEdge[] = edges.map(e => ({ ...e }));
    simNodesRef.current = simNodesData;
    // A new node/edge set (or layout switch) means positions will shift, so
    // re-arm the auto-fit so the new arrangement is framed in full.
    didAutoFitRef.current = false;

    // Count how many edges touch each node. The densest core docs (README,
    // ARCHITECTURE, …) accumulate many links whose attraction otherwise crams
    // their neighborhoods into an unreadable knot, so we scale the repulsion
    // and personal space of each node by its connectivity: hubs claim more room
    // and push their many neighbors out into a legible fan instead of a pile.
    const degree = new Map<string, number>();
    for (const e of simEdgesData) {
      degree.set(e.source as string, (degree.get(e.source as string) ?? 0) + 1);
      degree.set(e.target as string, (degree.get(e.target as string) ?? 0) + 1);
    }
    const degreeOf = (n: SimNode) => degree.get(n.id) ?? 0;

    // ---- Organic (d3-force) layout ----------------------------------------
    const simulation = d3.forceSimulation<SimNode>(simNodesData)
      // Longer links give connected nodes breathing room; hubs get extra so
      // their many spokes don't bunch up at a single distance.
      .force(
        "link",
        d3.forceLink<SimNode, SimEdge>(simEdgesData)
          .id(d => d.id)
          .distance(link => {
            const d = Math.max(
              degreeOf(link.source as SimNode),
              degreeOf(link.target as SimNode),
            );
            return 130 + Math.min(d, 12) * 12;
          }),
      )
      // Repulsion grows with connectivity so highly-linked cores spread their
      // neighbors out instead of collapsing inward.
      .force(
        "charge",
        d3.forceManyBody<SimNode>().strength(n => -500 - degreeOf(n) * 90),
      )
      .force("center", d3.forceCenter(dimensions.width / 2, dimensions.height / 2))
      // Hard minimum spacing, also scaled by degree and run for several
      // iterations so overlaps in the dense region are resolved firmly.
      .force(
        "collide",
        d3.forceCollide<SimNode>()
          .radius(n => Math.max(plateWidth(n.title) / 2, PLATE.height / 2) + 22)
          .strength(1)
          .iterations(3),
      )
      .stop();

    // Run the layout to completion synchronously rather than animating it tick
    // by tick. The dense core needs many iterations to fully relax, and showing
    // each intermediate (still-overlapping) frame both looks jittery and makes
    // the auto-fit frame a half-expanded layout. Computing the final positions
    // in one pass yields a stable, spread-out graph immediately.
    const ticks = Math.ceil(
      Math.log(simulation.alphaMin()) / Math.log(1 - simulation.alphaDecay()),
    );
    for (let i = 0; i < ticks; i++) simulation.tick();

    setSimNodes([...simNodesData]);
    setSimEdges([...simEdgesData]);
    // Signal the auto-fit now that the final, settled layout is ready.
    setSettleNonce((n) => n + 1);

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, dimensions.width, dimensions.height]);

  // Smoothly pan/zoom the viewport so the given node sits in the center.
  const focusOnNode = useCallback((nodeId: string) => {
    const node = simNodesRef.current.find((n) => n.id === nodeId);
    if (!node || node.x === undefined || node.y === undefined) return;
    const api = transformRef.current;
    if (!api) return;
    const scale = 1.4;
    const x = dimensions.width / 2 - node.x * scale;
    const y = dimensions.height / 2 - node.y * scale;
    api.setTransform(x, y, scale, reducedMotion ? 0 : 600, "easeOut");
  }, [dimensions.width, dimensions.height, reducedMotion]);

  // Pan/zoom so the entire graph fits within the viewport — the "overview".
  const fitView = useCallback(() => {
    const api = transformRef.current;
    const positioned = simNodesRef.current.filter(
      (n) => n.x !== undefined && n.y !== undefined,
    );
    if (!positioned.length) return;

    const xs = positioned.map((n) => n.x as number);
    const ys = positioned.map((n) => n.y as number);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const padding = 90;
    const graphWidth = maxX - minX + padding * 2;
    const graphHeight = maxY - minY + padding * 2;

    const fitScale = Math.min(
      dimensions.width / graphWidth,
      dimensions.height / graphHeight,
    );
    const clampedScale = Math.max(0.1, Math.min(fitScale, 2));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const x = dimensions.width / 2 - centerX * clampedScale;
    const y = dimensions.height / 2 - centerY * clampedScale;
    onFramed?.({ kind: "fit", x, y, scale: clampedScale });
    api?.setTransform(x, y, clampedScale, reducedMotion ? 0 : 600, "easeOut");
  }, [dimensions.width, dimensions.height, reducedMotion, onFramed]);

  // Pan/zoom so a specific subset of nodes (e.g. the routed team) is framed.
  // Used to spotlight the involved agents when a run begins, with a tighter
  // max zoom than fitView so a small team reads clearly.
  const fitToNodes = useCallback(
    (ids: string[]) => {
      const api = transformRef.current;
      const wanted = new Set(ids);
      const positioned = simNodesRef.current.filter(
        (n) => wanted.has(n.id) && n.x !== undefined && n.y !== undefined,
      );
      if (!positioned.length) return;

      const xs = positioned.map((n) => n.x as number);
      const ys = positioned.map((n) => n.y as number);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      const padding = 160;
      const w = maxX - minX + padding * 2;
      const h = maxY - minY + padding * 2;

      // Reserve the space the docked GenerationPanel + command bar occupy at the
      // bottom so the team is framed into the visible map area ABOVE the panel,
      // never behind it. Cap the reserved region so a tall panel still leaves a
      // usable band (also keeps things sane at narrow widths / short viewports).
      const inset = Math.min(
        Math.max(frameBottomInsetRef.current, 0),
        dimensions.height * 0.6,
      );
      const usableHeight = Math.max(dimensions.height - inset, 160);

      const fitScale = Math.min(dimensions.width / w, usableHeight / h);
      const clampedScale = Math.max(0.3, Math.min(fitScale, 1.6));

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const x = dimensions.width / 2 - centerX * clampedScale;
      // Centre vertically within the usable band (top of viewport → top of the
      // panel) rather than the full viewport, lifting the team clear of the panel.
      const y = usableHeight / 2 - centerY * clampedScale;
      onFramed?.({ kind: "spotlight", x, y, scale: clampedScale });
      api?.setTransform(x, y, clampedScale, reducedMotion ? 0 : 700, "easeOut");
    },
    [dimensions.width, dimensions.height, reducedMotion, onFramed],
  );

  // Export the current graph view (the cream paper + grid + SVG, exactly as
  // panned/zoomed) to an image. The control overlays carry data-export-ignore
  // so they are filtered out, and the cream theme background is forced so the
  // image is never transparent.
  const exportImage = useCallback(
    async (format: "png" | "svg") => {
      const el = containerRef.current;
      if (!el || isExporting) return;
      setIsExporting(true);
      try {
        const cream = getComputedStyle(el).backgroundColor || "#F4F4F0";
        const options = {
          backgroundColor: cream,
          cacheBust: true,
          pixelRatio: 2,
          filter: (node: HTMLElement) =>
            !(node instanceof HTMLElement && node.dataset.exportIgnore === "true"),
        };
        const dataUrl =
          format === "png" ? await toPng(el, options) : await toSvg(el, options);
        const link = document.createElement("a");
        link.download = `saerens-systeemkaart.${format}`;
        link.href = dataUrl;
        link.click();
      } catch (err) {
        console.error("Kaart exporteren mislukt", err);
      } finally {
        setIsExporting(false);
      }
    },
    [isExporting],
  );

  // Focus when a node is selected, or when search requests a focus (nonce bump).
  useEffect(() => {
    if (!selectedNodeId) return;
    // Wait a frame so the simulation has positioned freshly-filtered nodes.
    const id = requestAnimationFrame(() => focusOnNode(selectedNodeId));
    return () => cancelAnimationFrame(id);
  }, [selectedNodeId, focusNonce, focusOnNode]);

  // Auto-fit once the layout has settled for a fresh dataset, so the user always
  // starts from a readable full overview rather than an arbitrary crop. Keyed on
  // settleNonce (bumped when the simulation ends) so it frames the final,
  // fully-spread layout instead of a mid-expansion snapshot.
  useEffect(() => {
    if (didAutoFitRef.current) return;
    if (!simNodes.length || selectedNodeId) return;
    if (settleNonce === 0) return;
    didAutoFitRef.current = true;
    fitView();
  }, [settleNonce, simNodes, selectedNodeId, fitView]);

  // Spotlight the involved team when a run begins (nonce bump). Waits a frame so
  // freshly-filtered nodes are positioned before framing them.
  useEffect(() => {
    if (!spotlightNonce) return;
    if (!spotlightNodeIds || spotlightNodeIds.length === 0) return;
    spotlightActiveRef.current = true;
    lastFramedInsetRef.current = frameBottomInsetRef.current;
    const id = requestAnimationFrame(() => fitToNodes(spotlightNodeIds));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotlightNonce]);

  // The panel grows from the routing review to its (capped, then internally
  // scrolling) max height after the spotlight fires. Re-frame when that bottom
  // inset grows meaningfully so the live rings/pulses/hand-off line stay clear
  // of the panel. The panel plateaus at its max height, so this settles after a
  // couple of smooth adjustments rather than fighting the user's own pan/zoom.
  useEffect(() => {
    if (!spotlightActiveRef.current) return;
    if (!spotlightNodeIds || spotlightNodeIds.length === 0) return;
    const next = frameBottomInset ?? 0;
    if (next - lastFramedInsetRef.current <= 48) return;
    lastFramedInsetRef.current = next;
    const id = requestAnimationFrame(() => fitToNodes(spotlightNodeIds));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameBottomInset]);

  // Stop tracking the panel once the run ends so a later panel mount (e.g. a new
  // request being composed) never re-frames an idle map.
  const involvedCount = involvedNodeIds?.size ?? 0;
  useEffect(() => {
    if (involvedCount === 0) {
      spotlightActiveRef.current = false;
      lastFramedInsetRef.current = 0;
    }
  }, [involvedCount]);

  // Clear a stale hover when the hovered node leaves the current dataset (e.g.
  // category filtering removes it), otherwise hoverSet would keep dimming the
  // whole graph until the next hover event.
  useEffect(() => {
    if (hoveredNodeId && !simNodes.some((n) => n.id === hoveredNodeId)) {
      setHoveredNodeId(null);
    }
  }, [simNodes, hoveredNodeId]);

  // Derived styling helpers
  const lowerSearchQuery = searchQuery.toLowerCase();
  
  const isNodeHighlighted = (node: SimNode) => {
    if (hoveredNodeId) return node.id === hoveredNodeId;
    if (selectedNodeId) return node.id === selectedNodeId;
    if (lowerSearchQuery) return node.title.toLowerCase().includes(lowerSearchQuery);
    return false;
  };

  const runActive = (involvedNodeIds?.size ?? 0) > 0;
  // The service-line lens dims the map down to one line's cluster. A live run
  // takes precedence (its spotlight is the more urgent signal), so the lens only
  // applies when no run is active.
  const lensActive = !runActive && !!lensNodeIds && lensNodeIds.size > 0;

  const isNodeDimmed = (node: SimNode) => {
    if (hoverSet) return !hoverSet.has(node.id);
    // During a live run the involved team stays lit and everything else recedes,
    // so the map clearly shows who is working — unless the user is hovering.
    if (runActive) return !involvedNodeIds!.has(node.id);
    // The lens lights up the chosen service line's cluster and recedes the rest.
    if (lensActive) return !lensNodeIds!.has(node.id);
    if (selectedNodeId) return node.id !== selectedNodeId;
    if (lowerSearchQuery) return !node.title.toLowerCase().includes(lowerSearchQuery);
    return false;
  };

  // Adjacency for hover highlighting: each node mapped to its directly connected
  // neighbours.
  const neighborMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const add = (a: string, b: string) => {
      if (!m.has(a)) m.set(a, new Set());
      m.get(a)!.add(b);
    };
    for (const e of simEdges) {
      const s = typeof e.source === "string" ? e.source : (e.source as SimNode).id;
      const t = typeof e.target === "string" ? e.target : (e.target as SimNode).id;
      add(s, t);
      add(t, s);
    }
    return m;
  }, [simEdges]);

  // The single most-connected node (the orchestrator) stays labelled at every
  // zoom alongside the core docs, so the overview always has a named anchor to
  // orient from even when the rest of the plates read as unlabelled marks.
  const anchorLabelIds = useMemo(() => {
    let best: string | null = null;
    let bestN = -1;
    for (const [id, set] of neighborMap) {
      if (set.size > bestN) {
        bestN = set.size;
        best = id;
      }
    }
    return best ? new Set([best]) : new Set<string>();
  }, [neighborMap]);

  // When hovering, the hovered node plus its neighbours stay lit; everything
  // else recedes.
  const hoverSet = useMemo(() => {
    if (!hoveredNodeId) return null;
    const set = new Set<string>([hoveredNodeId]);
    const adj = neighborMap.get(hoveredNodeId);
    if (adj) for (const n of adj) set.add(n);
    return set;
  }, [hoveredNodeId, neighborMap]);

  // A synthetic bowed path between the previous and current agent of a live run,
  // so the map shows work flowing from colleague to colleague even when the two
  // agents aren't directly linked in the doc graph.
  const handoffPath = useMemo(() => {
    if (!handoff) return null;
    const s = simNodes.find((n) => n.id === handoff.source);
    const t = simNodes.find((n) => n.id === handoff.target);
    if (
      !s ||
      !t ||
      s.x === undefined ||
      s.y === undefined ||
      t.x === undefined ||
      t.y === undefined
    )
      return null;
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // Trim each endpoint to its plate's rectangular border (width + height aware).
    const border = (title: string) =>
      Math.min(
        Math.abs(ux) < 1e-6 ? Infinity : plateWidth(title) / 2 / Math.abs(ux),
        Math.abs(uy) < 1e-6 ? Infinity : PLATE.height / 2 / Math.abs(uy),
      );
    const x1 = s.x + ux * (border(s.title) + 3);
    const y1 = s.y + uy * (border(s.title) + 3);
    const x2 = t.x - ux * (border(t.title) + 8);
    const y2 = t.y - uy * (border(t.title) + 8);
    const bow = Math.min(len * 0.14, 70);
    const cx = (x1 + x2) / 2 - uy * bow;
    const cy = (y1 + y2) / 2 + ux * bow;
    return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
  }, [handoff, simNodes]);

  return (
    <div ref={containerRef} className="w-full h-full bg-background relative overflow-hidden">
      {/* Grid Pattern Background — faint ink dots on cream paper */}
      <div className="absolute inset-0 pointer-events-none opacity-40" 
           style={{
             backgroundImage:
               'linear-gradient(hsl(var(--foreground) / 0.14) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground) / 0.14) 1px, transparent 1px), linear-gradient(hsl(var(--foreground) / 0.07) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground) / 0.07) 1px, transparent 1px)',
             backgroundSize: '120px 120px, 120px 120px, 24px 24px, 24px 24px'
           }} 
      />

      <TransformWrapper
        ref={transformRef}
        initialScale={initialScale}
        minScale={0.1}
        maxScale={4}
        centerOnInit
        limitToBounds={false}
        onTransformed={(_ref, state) => setScale(state.scale)}
        onZoomStart={() => markInteracting(true)}
        onZoomStop={() => markInteracting(false)}
        onWheelStart={() => markInteracting(true)}
        onWheelStop={() => markInteracting(false)}
        onPanningStart={() => markInteracting(true)}
        onPanningStop={() => markInteracting(false)}
        onPinchingStart={() => markInteracting(true)}
        onPinchingStop={() => markInteracting(false)}
      >
        <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full">
          <svg width={dimensions.width} height={dimensions.height} className="overflow-visible">
            <defs>
              {/* Relationship arrowheads — refined, sit just off each node rim */}
              <marker id="arrow-routing" viewBox="0 -5 10 10" refX="8" refY="0" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0,-4L8,0L0,4" fill="hsl(var(--cat-agent))" opacity={0.9} />
              </marker>
              <marker id="arrow-flow" viewBox="0 -5 10 10" refX="8" refY="0" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0,-4L8,0L0,4" fill="hsl(var(--cat-core))" opacity={0.9} />
              </marker>
              <marker id="arrow-reference" viewBox="0 -5 10 10" refX="8" refY="0" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,-4L8,0L0,4" fill="hsl(var(--foreground))" opacity={0.5} />
              </marker>
              <marker id="arrow-mention" viewBox="0 -5 10 10" refX="8" refY="0" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,-4L8,0L0,4" fill="hsl(var(--foreground))" opacity={0.3} />
              </marker>
              {/* Soft lift for the node "seals" */}
              <filter id="node-shadow" x="-60%" y="-60%" width="220%" height="220%">
                <feDropShadow dx="0" dy="2.5" stdDeviation="3" floodColor="#1A1A1A" floodOpacity="0.20" />
              </filter>
              {/* Luminous bloom for the live-run accents (hand-off line, work
                  tokens, the writing agent's halo) — a soft glow that lifts the
                  motion from flat marks to a premium, lit feel. */}
              <filter id="atlas-glow" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="2.4" result="atlas-blur" />
                <feMerge>
                  <feMergeNode in="atlas-blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <g className="edges" fill="none">
              {simEdges.map((edge, i) => {
                const source = edge.source as SimNode;
                const target = edge.target as SimNode;
                if (source.x === undefined || source.y === undefined || target.x === undefined || target.y === undefined) return null;

                const style = edgeStyleFor(edge.kind);
                const activeNode = hoveredNodeId ?? selectedNodeId;
                const isEdgeHighlighted = activeNode && (source.id === activeNode || target.id === activeNode);
                const isEdgeDimmed = activeNode && !isEdgeHighlighted;
                const isRouting = edge.kind === "routing";

                // During a live run, wiring between two involved team members is
                // revealed so the working team's structure reads at any framing.
                const runEdge =
                  runActive &&
                  involvedNodeIds!.has(source.id) &&
                  involvedNodeIds!.has(target.id);
                // In lens mode only wiring fully inside the lit cluster counts as
                // revealed, so the chosen service line reads as a clean group.
                const lensEdge =
                  lensActive &&
                  lensNodeIds!.has(source.id) &&
                  lensNodeIds!.has(target.id);

                // The dense flow / reference / mention wiring is shown strictly on
                // demand — it is no longer faded in by zoom. Drawn as an ambient
                // layer it painted hundreds of crossing lines every frame (the
                // zoom lag) and an unreadable hairball. It now appears only when a
                // hover/selection reveals an endpoint's own wiring, during a live
                // run between two involved members, or inside an active
                // service-line lens. The routing skeleton is the single always-on
                // backbone.
                const revealed = isRouting || isEdgeHighlighted || runEdge || lensEdge;
                if (!revealed) return null;
                // In lens mode anything outside the lit cluster (including the
                // backbone) is culled unless a hover/selection reveals it, so the
                // lens reads as an isolated group.
                if (lensActive && !lensEdge && !isEdgeHighlighted) return null;

                // Schematic wiring trimmed to each plate's border. A straight
                // wire keeps the dense web legible instead of a tangle of
                // overlapping elbows.
                const sx = source.x;
                const sy = source.y;
                const tx = target.x;
                const ty = target.y;
                let d: string;
                {
                  const dx = tx - sx;
                  const dy = ty - sy;
                  const len = Math.hypot(dx, dy) || 1;
                  const ux = dx / len;
                  const uy = dy / len;
                  // Distance from a plate centre to its rectangular border along (ux,uy).
                  const border = (rx: number, ry: number) =>
                    Math.min(
                      Math.abs(ux) < 1e-6 ? Infinity : rx / Math.abs(ux),
                      Math.abs(uy) < 1e-6 ? Infinity : ry / Math.abs(uy),
                    );
                  const sH = border(plateWidth(source.title) / 2, PLATE.height / 2);
                  const tH = border(plateWidth(target.title) / 2, PLATE.height / 2);
                  const x1 = sx + ux * (sH + 2);
                  const y1 = sy + uy * (sH + 2);
                  const x2 = tx - ux * (tH + 7);
                  const y2 = ty - uy * (tH + 7);
                  d = `M ${x1} ${y1} L ${x2} ${y2}`;
                }

                const opacity = isEdgeDimmed ? 0.06 : isEdgeHighlighted ? 0.95 : style.opacity;
                const width = isEdgeHighlighted ? style.width + 0.75 : style.width;

                // Living-pipeline beads are the dominant repaint cost at high
                // zoom: with the full flow layer faded in, every routing/flow
                // edge carried an always-on dash animation, so hundreds repaint
                // the whole SVG each frame. Cap the ambient motion to the routing
                // skeleton only (few, always visible). Flow edges get the bead
                // solely when a hover/selection reveals them or a live run forces
                // them visible — so the motion still reads where it matters
                // (skeleton, hover/selection, live runs) but never animates on
                // hundreds of edges at once. The static edge line above is
                // unchanged at every zoom.
                const isPipelineEdge = edge.kind === "routing" || edge.kind === "flow";
                const showBead =
                  isPipelineEdge &&
                  !isEdgeDimmed &&
                  (edge.kind === "routing" || isEdgeHighlighted || runEdge);

                return (
                  <g key={`edge-${i}`} className={reducedMotion ? "" : "transition-opacity duration-300"}>
                    {isEdgeHighlighted && (
                      <path d={d} stroke={style.color} strokeWidth={width + 5} opacity={0.14} strokeLinecap="round" />
                    )}
                    <path
                      d={d}
                      stroke={style.color}
                      strokeWidth={width}
                      strokeDasharray={style.dash === "none" ? undefined : style.dash}
                      opacity={opacity}
                      markerEnd={`url(#${style.marker})`}
                      strokeLinecap="round"
                    />
                    {/* Living pipeline: light beads streaming source -> target.
                        Capped to the routing skeleton plus any hovered/selected or
                        live-run edge (see showBead) so the motion never runs on
                        hundreds of paths at once. */}
                    {showBead && (
                      <path
                        d={d}
                        stroke="hsl(var(--card))"
                        strokeWidth={width + 0.5}
                        strokeDasharray="0,16"
                        strokeLinecap="round"
                        opacity={isEdgeHighlighted ? 1 : 0.8}
                        className="atlas-flow-line"
                      />
                    )}
                  </g>
                );
              })}
            </g>

            {/* Live-run hand-off: an animated accent line flowing from the
                previous agent to the one currently working. Static under
                reduced motion. */}
            {handoffPath && (
              <g className="handoff" fill="none">
                <path
                  d={handoffPath}
                  stroke="hsl(var(--accent))"
                  strokeWidth={5}
                  opacity={0.18}
                  strokeLinecap="round"
                />
                {reducedMotion ? (
                  <path
                    d={handoffPath}
                    stroke="hsl(var(--accent))"
                    strokeWidth={2}
                    opacity={0.9}
                    strokeLinecap="round"
                  />
                ) : (
                  <path
                    d={handoffPath}
                    stroke="hsl(var(--accent))"
                    strokeWidth={2.5}
                    strokeDasharray="2,9"
                    strokeLinecap="round"
                    opacity={1}
                    className="atlas-handoff-line"
                    filter="url(#atlas-glow)"
                  />
                )}

                {/* Work tokens: luminous beads that physically travel from the
                    previous agent (or the Orchestrator, at the start) to the one
                    now writing — the map's literal "node to node" hand-off. The
                    group is keyed on the pair so each new hand-off restarts the
                    motion cleanly. */}
                {!reducedMotion && (
                  <g
                    key={`handoff-token-${handoff?.source}-${handoff?.target}`}
                    fill="hsl(var(--accent))"
                  >
                    {[0, 0.34, 0.68].map((t, idx) => {
                      const begin = `${(t * 1.3).toFixed(2)}s`;
                      // Eased travel (accelerate then settle) so each bead reads
                      // as work arriving at the writing agent, not a metronome.
                      const motion = (
                        <animateMotion
                          path={handoffPath}
                          dur="1.3s"
                          begin={begin}
                          repeatCount="indefinite"
                          calcMode="spline"
                          keyPoints="0;1"
                          keyTimes="0;1"
                          keySplines="0.45 0 0.25 1"
                        />
                      );
                      return (
                        <g key={idx}>
                          {/* soft trailing aura */}
                          <circle r={7} opacity={0.12}>
                            {motion}
                          </circle>
                          {/* glowing comet head */}
                          <circle r={3} opacity={0.98} filter="url(#atlas-glow)">
                            {motion}
                          </circle>
                        </g>
                      );
                    })}
                  </g>
                )}
              </g>
            )}

            {/* Nodes Layer */}
            <g className="nodes">
              {simNodes.map((node) => {
                if (node.x === undefined || node.y === undefined) return null;

                const isHighlighted = isNodeHighlighted(node);
                const isDimmed = isNodeDimmed(node);
                const isInvolved = involvedNodeIds?.has(node.id) ?? false;
                const status = nodeStatus?.get(node.id);
                const isActive = activeNodeId === node.id || status === "working";
                // Visual prominence: hover/search/select highlight, the active
                // (writing) agent, or any involved team member during a run.
                const lit = isHighlighted || isActive || status === "done";
                const color = getCategoryColor(node.category);
                const w = plateWidth(node.title);
                const h = PLATE.height;
                const hw = w / 2;
                const hh = h / 2;
                const isCore = node.category === "core";
                const portraitUrl = portraits?.[node.id];
                const clipId = `portrait-clip-${safeId(node.id)}`;
                const scaleVal = isActive ? 1.12 : (lit ? 1.06 : (isInvolved ? 1.03 : 1));
                const ringWidth = isCore ? 2.5 : (isActive ? 2.5 : (lit || isInvolved ? 2 : 1.5));
                const brackOff = 4;
                // One corner-bracket "registration tick"; sx/sy point inward.
                const bracket = (bx: number, by: number, sgx: number, sgy: number) =>
                  `M ${bx + sgx * 5} ${by} L ${bx} ${by} L ${bx} ${by + sgy * 5}`;

                return (
                  <g
                    key={node.id}
                    onClick={() => onSelectNode(node.id)}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    className={`cursor-pointer ${reducedMotion ? "" : "transition-all duration-300"}`}
                    style={{
                      opacity: isDimmed ? 0.2 : 1,
                      transform: `translate(${node.x}px,${node.y}px) scale(${scaleVal})`,
                    }}
                  >
                    {/* Active (writing) agent: pulsing accent plate halo */}
                    {isActive && (
                      <>
                        <rect
                          x={-hw - 12} y={-hh - 12} width={w + 24} height={h + 24}
                          fill="hsl(var(--accent))"
                          opacity={0.14}
                          filter={reducedMotion ? undefined : "url(#atlas-glow)"}
                          className={reducedMotion ? "" : "atlas-node-pulse"}
                        />
                        {/* Sonar ping — an accent frame expanding outward and
                            fading, so the writing agent reads as actively
                            broadcasting work. */}
                        {!reducedMotion && (
                          <rect
                            x={-hw - 6} y={-hh - 6} width={w + 12} height={h + 12}
                            fill="none" stroke="hsl(var(--accent))" strokeWidth={1.5}
                            className="atlas-node-ping"
                          />
                        )}
                        <rect
                          x={-hw - 6} y={-hh - 6} width={w + 12} height={h + 12}
                          fill="none" stroke="hsl(var(--accent))" strokeWidth={2} opacity={0.9}
                          className={reducedMotion ? "" : "atlas-frame-in"}
                        />
                      </>
                    )}

                    {/* Queued agent: a dashed waiting frame */}
                    {status === "queued" && !isActive && (
                      <rect
                        x={-hw - 6} y={-hh - 6} width={w + 12} height={h + 12}
                        fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5}
                        opacity={0.6} strokeDasharray="4,5"
                        className={reducedMotion ? "" : "atlas-frame-in"}
                      />
                    )}

                    {/* Done agent: solid completed frame */}
                    {status === "done" && !isActive && (
                      <rect
                        x={-hw - 6} y={-hh - 6} width={w + 12} height={h + 12}
                        fill="none" stroke="hsl(var(--foreground))" strokeWidth={1.5} opacity={0.3}
                        className={reducedMotion ? "" : "atlas-frame-in"}
                      />
                    )}

                    {/* Soft glow for the highlighted/selected node */}
                    {isHighlighted && !isActive && !status && (
                      <rect
                        x={-hw - 8} y={-hh - 8} width={w + 16} height={h + 16}
                        fill={color} opacity={0.14}
                        className={reducedMotion ? "" : "animate-pulse"}
                      />
                    )}

                    {/* Involved-but-waiting team member (if no explicit status yet) */}
                    {isInvolved && !status && !isActive && !isHighlighted && (
                      <rect
                        x={-hw - 6} y={-hh - 6} width={w + 12} height={h + 12}
                        fill="none" stroke="hsl(var(--accent))" strokeWidth={1.5}
                        opacity={0.4} strokeDasharray="3,4"
                        className={reducedMotion ? "" : "atlas-frame-in"}
                      />
                    )}

                    {/* Schematic plate: white paper, category-coloured frame, soft lift */}
                    <g filter="url(#node-shadow)">
                      <rect
                        x={-hw} y={-hh} width={w} height={h}
                        fill="hsl(var(--card))"
                        stroke={color}
                        strokeWidth={ringWidth}
                        className="transition-all duration-300"
                      />
                    </g>
                    {isCore && (
                      <rect x={-hw} y={-hh} width={w} height={h} fill={color} opacity={0.06} />
                    )}

                    {/* Registration brackets at the four corners */}
                    <g stroke="hsl(var(--muted-foreground))" strokeWidth={1} fill="none" opacity={lit ? 0.9 : 0.5}>
                      <path d={bracket(-hw - brackOff, -hh - brackOff, 1, 1)} />
                      <path d={bracket(hw + brackOff, -hh - brackOff, -1, 1)} />
                      <path d={bracket(-hw - brackOff, hh + brackOff, 1, -1)} />
                      <path d={bracket(hw + brackOff, hh + brackOff, -1, -1)} />
                    </g>

                    {/* Label, set inside the plate (monospace, centred). It fades
                        with zoom (level-of-detail) so the overview reads as clean
                        schematic marks; core docs, the central hub, and any lit /
                        involved plate stay legible at every zoom. */}
                    {(() => {
                      const labelAnchored = isCore || anchorLabelIds.has(node.id);
                      const labelOpacity =
                        labelAnchored || lit || isInvolved
                          ? 1
                          : lodFactor(scale, LABEL_LOD[0], LABEL_LOD[1]);
                      if (labelOpacity <= 0.01) return null;
                      return (
                        <text
                          x={0} y={0}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="hsl(var(--foreground))"
                          opacity={labelOpacity}
                          className={`font-['Space_Mono'] text-[11px] uppercase tracking-wider ${reducedMotion ? "" : "transition-opacity duration-300"} ${lit || isCore ? 'font-bold' : ''}`}
                          style={{ pointerEvents: 'none' }}
                        >
                          {node.title}
                        </text>
                      );
                    })()}

                    {/* Portrait "ID stamp" straddling the top-left corner */}
                    {portraitUrl && (
                      <>
                        <clipPath id={clipId}>
                          <rect x={-hw - 6} y={-hh - 14} width={22} height={22} />
                        </clipPath>
                        <image
                          href={portraitUrl}
                          x={-hw - 6} y={-hh - 14} width={22} height={22}
                          clipPath={`url(#${clipId})`}
                          preserveAspectRatio="xMidYMid slice"
                        />
                        <rect
                          x={-hw - 6} y={-hh - 14} width={22} height={22}
                          fill="none" stroke={color} strokeWidth={1.5}
                        />
                      </>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </TransformComponent>
      </TransformWrapper>

      {/* Export — placed bottom-left so it balances the navigation controls
          without overlapping the legend/panel overlays. */}
      <div data-export-ignore="true" className="absolute bottom-6 left-6 z-20 flex flex-col gap-3 items-start">
        {/* Export controls: PNG (priority) + SVG. */}
        <div className="flex rounded-none bg-card border border-foreground shadow-[4px_4px_0px_hsl(var(--foreground))] overflow-hidden">
          <button
            type="button"
            onClick={() => exportImage("png")}
            disabled={isExporting}
            title="Exporteer kaart als PNG"
            aria-label="Exporteer kaart als PNG"
            className="flex items-center gap-2 px-3 h-10 font-['Space_Mono'] text-[11px] uppercase tracking-wider text-foreground hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            <Download className="w-4 h-4" />
            {isExporting ? "Bezig..." : "Exporteer kaart"}
          </button>
          <div className="w-px bg-foreground" />
          <button
            type="button"
            onClick={() => exportImage("svg")}
            disabled={isExporting}
            title="Exporteer kaart als SVG"
            aria-label="Exporteer kaart als SVG"
            className="flex items-center gap-2 px-3 h-10 font-['Space_Mono'] text-[11px] uppercase tracking-wider text-foreground hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            <ImageIcon className="w-4 h-4" />
            SVG
          </button>
        </div>
      </div>

      {/* Navigation controls: fit-to-view (reset overview) + zoom in/out. */}
      <div data-export-ignore="true" className="absolute bottom-6 right-6 z-20 flex flex-col gap-2">
        <button
          type="button"
          onClick={fitView}
          title="Passend zoomen"
          aria-label="Passend zoomen"
          className="flex items-center justify-center w-10 h-10 rounded-none bg-card border border-foreground shadow-[4px_4px_0px_hsl(var(--foreground))] text-foreground hover:bg-foreground hover:text-background active:translate-x-1 active:translate-y-1 active:shadow-none transition-all"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <div className="flex flex-col rounded-none bg-card border border-foreground shadow-[4px_4px_0px_hsl(var(--foreground))] overflow-hidden">
          <button
            type="button"
            onClick={() => transformRef.current?.zoomIn(0.3)}
            title="Inzoomen"
            aria-label="Inzoomen"
            className="flex items-center justify-center w-10 h-10 text-foreground hover:bg-foreground hover:text-background transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
          <div className="h-px bg-foreground" />
          <button
            type="button"
            onClick={() => transformRef.current?.zoomOut(0.3)}
            title="Uitzoomen"
            aria-label="Uitzoomen"
            className="flex items-center justify-center w-10 h-10 text-foreground hover:bg-foreground hover:text-background transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
