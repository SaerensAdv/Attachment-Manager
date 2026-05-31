import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as d3 from "d3-force";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { Maximize2, Plus, Minus } from "lucide-react";
import type { DocNode, DocEdge, DocCategory } from "@workspace/api-client-react";

// Below this zoom level labels are hidden to keep the dense overview readable;
// zooming in past it fades them in so individual nodes can be inspected. The
// per-node focus zoom (1.4) and a small manual zoom both clear this threshold.
const LABEL_VISIBLE_SCALE = 1.15;

interface GraphViewerProps {
  nodes: DocNode[];
  edges: DocEdge[];
  categories: DocCategory[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  searchQuery: string;
  focusNonce?: number;
}

// Visual style per relationship kind. routing (orchestrator hand-off) and flow
// (five-layer pipeline) get their own colors so the structural backbone reads
// distinctly from generic references and incidental mentions.
const EDGE_STYLE: Record<
  string,
  { color: string; width: number; dash: string; opacity: number; marker: string }
> = {
  routing: { color: "hsl(var(--cat-agent))", width: 1.75, dash: "none", opacity: 0.7, marker: "arrow-routing" },
  flow: { color: "hsl(var(--cat-core))", width: 1.75, dash: "none", opacity: 0.65, marker: "arrow-flow" },
  reference: { color: "hsl(var(--foreground))", width: 1, dash: "none", opacity: 0.26, marker: "arrow-reference" },
  mention: { color: "hsl(var(--foreground))", width: 1, dash: "3,5", opacity: 0.14, marker: "arrow-mention" },
};
const edgeStyleFor = (kind: string) => EDGE_STYLE[kind] ?? EDGE_STYLE.mention;

interface SimNode extends d3.SimulationNodeDatum, DocNode {
  x?: number;
  y?: number;
}

interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
  kind: string;
}

// Map category to CSS variable color
const getCategoryColor = (categoryId: string) => {
  return `hsl(var(--cat-${categoryId}))`;
};

export default function GraphViewer({
  nodes,
  edges,
  categories,
  selectedNodeId,
  onSelectNode,
  searchQuery,
  focusNonce,
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
  const [scale, setScale] = useState(1);
  // Live reference to the simulation node objects (mutated in place by d3), so
  // focusing can read current positions without retriggering on every tick.
  const simNodesRef = useRef<SimNode[]>([]);
  // Guards the one-time auto-fit so it only fires after a fresh dataset settles.
  const didAutoFitRef = useRef(false);
  // Bumped when the simulation cools down, so the auto-fit waits for the final
  // (now larger, spread-out) layout instead of framing a half-settled one.
  const [settleNonce, setSettleNonce] = useState(0);

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
    // A new node/edge set means the layout will shift, so re-arm the auto-fit.
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

    // Visual radius of a node circle (16) — collision keeps at least this much
    // clear space plus a per-degree margin so labels in the dense center don't
    // collide even when zoomed in.
    const NODE_RADIUS = 16;

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
          .radius(n => NODE_RADIUS + 34 + Math.min(degreeOf(n), 12) * 3)
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
    api.setTransform(x, y, scale, 600, "easeOut");
  }, [dimensions.width, dimensions.height]);

  // Pan/zoom so the entire graph fits within the viewport — the "overview".
  const fitView = useCallback(() => {
    const api = transformRef.current;
    const positioned = simNodesRef.current.filter(
      (n) => n.x !== undefined && n.y !== undefined,
    );
    if (!api || !positioned.length) return;

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
    api.setTransform(x, y, clampedScale, 600, "easeOut");
  }, [dimensions.width, dimensions.height]);

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

  const isNodeDimmed = (node: SimNode) => {
    if (hoverSet) return !hoverSet.has(node.id);
    if (selectedNodeId) return node.id !== selectedNodeId;
    if (lowerSearchQuery) return !node.title.toLowerCase().includes(lowerSearchQuery);
    return false;
  };

  // Connectivity per node, used to scale node size: hub documents read as larger
  // "seals" than leaf docs, giving the atlas a clear visual hierarchy.
  const degreeMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of simEdges) {
      const s = typeof e.source === "string" ? e.source : (e.source as SimNode).id;
      const t = typeof e.target === "string" ? e.target : (e.target as SimNode).id;
      m.set(s, (m.get(s) ?? 0) + 1);
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return m;
  }, [simEdges]);

  const radiusOf = (node: SimNode) => 12 + Math.min(degreeMap.get(node.id) ?? 0, 14);

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

  // When hovering, the hovered node plus its neighbours stay lit; everything
  // else recedes.
  const hoverSet = useMemo(() => {
    if (!hoveredNodeId) return null;
    const set = new Set<string>([hoveredNodeId]);
    const adj = neighborMap.get(hoveredNodeId);
    if (adj) for (const n of adj) set.add(n);
    return set;
  }, [hoveredNodeId, neighborMap]);

  return (
    <div ref={containerRef} className="w-full h-full bg-background relative overflow-hidden">
      {/* Grid Pattern Background — faint ink dots on cream paper */}
      <div className="absolute inset-0 pointer-events-none opacity-40" 
           style={{
             backgroundImage: 'radial-gradient(circle at 2px 2px, hsl(var(--foreground) / 0.18) 1px, transparent 0)',
             backgroundSize: '32px 32px'
           }} 
      />

      <TransformWrapper
        ref={transformRef}
        initialScale={1}
        minScale={0.1}
        maxScale={4}
        centerOnInit
        limitToBounds={false}
        onTransformed={(_ref, state) => setScale(state.scale)}
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
            </defs>

            {/* Edges Layer */}
            <g className="edges" fill="none">
              {simEdges.map((edge, i) => {
                const source = edge.source as SimNode;
                const target = edge.target as SimNode;
                if (source.x === undefined || source.y === undefined || target.x === undefined || target.y === undefined) return null;

                const style = edgeStyleFor(edge.kind);
                const activeNode = hoveredNodeId ?? selectedNodeId;
                const isEdgeHighlighted = activeNode && (source.id === activeNode || target.id === activeNode);
                const isEdgeDimmed = activeNode && !isEdgeHighlighted;

                // Trim the endpoints to each node's rim and bow the line into a
                // gentle arc so the dense graph reads as elegant curves rather
                // than a mechanical web.
                const dx = target.x - source.x;
                const dy = target.y - source.y;
                const len = Math.hypot(dx, dy) || 1;
                const ux = dx / len;
                const uy = dy / len;
                const x1 = source.x + ux * (radiusOf(source) + 2);
                const y1 = source.y + uy * (radiusOf(source) + 2);
                const x2 = target.x - ux * (radiusOf(target) + 7);
                const y2 = target.y - uy * (radiusOf(target) + 7);
                const bow = Math.min(len * 0.12, 56);
                const cx = (x1 + x2) / 2 - uy * bow;
                const cy = (y1 + y2) / 2 + ux * bow;
                const d = `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;

                const opacity = isEdgeDimmed ? 0.06 : isEdgeHighlighted ? 0.95 : style.opacity;
                const width = isEdgeHighlighted ? style.width + 0.75 : style.width;

                return (
                  <g key={`edge-${i}`} className="transition-opacity duration-300">
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
                    {/* Living pipeline: light beads streaming source -> target
                        along the structural routing/flow edges. */}
                    {(edge.kind === "routing" || edge.kind === "flow") && !isEdgeDimmed && (
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

            {/* Nodes Layer */}
            <g className="nodes">
              {simNodes.map((node) => {
                if (node.x === undefined || node.y === undefined) return null;

                const isHighlighted = isNodeHighlighted(node);
                const isDimmed = isNodeDimmed(node);
                const color = getCategoryColor(node.category);
                const r = radiusOf(node);

                return (
                  <g
                    key={node.id}
                    onClick={() => onSelectNode(node.id)}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    className="cursor-pointer transition-all duration-300"
                    style={{
                      opacity: isDimmed ? 0.2 : 1,
                      transform: `translate(${node.x}px,${node.y}px) scale(${isHighlighted ? 1.15 : 1})`,
                    }}
                  >
                    {/* Soft halo for the highlighted/selected node */}
                    {isHighlighted && (
                      <circle r={r + 10} fill={color} opacity={0.16} className="animate-pulse" />
                    )}

                    {/* Editorial "press seal": a paper disc lifted with a soft
                        shadow, ringed in the category accent. */}
                    <g filter="url(#node-shadow)">
                      <circle
                        r={r}
                        fill="hsl(var(--card))"
                        stroke={color}
                        strokeWidth={isHighlighted ? 3.5 : 2.5}
                        className="transition-all duration-300"
                      />
                    </g>

                    {/* Ink double-frame when active */}
                    {isHighlighted && (
                      <circle r={r + 5} fill="none" stroke="hsl(var(--foreground))" strokeWidth={1} opacity={0.85} />
                    )}

                    {/* Category core dot */}
                    <circle r={Math.max(3, r * 0.4)} fill={color} />

                    {/* Node Label — hidden when zoomed out so the overview stays
                        legible, always shown for the highlighted/selected node. */}
                    <text
                      dy={r + 16}
                      textAnchor="middle"
                      fill={isHighlighted ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))"}
                      className={`font-['Space_Mono'] text-[11px] uppercase tracking-wider transition-opacity duration-300 ${isHighlighted ? 'font-bold' : ''}`}
                      style={{
                        pointerEvents: 'none',
                        opacity: isHighlighted || scale >= LABEL_VISIBLE_SCALE ? 1 : 0,
                        paintOrder: 'stroke',
                        stroke: 'hsl(var(--background))',
                        strokeWidth: 3,
                        strokeLinejoin: 'round',
                      }}
                    >
                      {node.title}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </TransformComponent>
      </TransformWrapper>

      {/* Navigation controls: fit-to-view (reset overview) + zoom in/out. */}
      <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-2">
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
