import { useEffect, useRef, useState, useCallback } from "react";
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
  routing: { color: "hsl(var(--cat-agent))", width: 2.5, dash: "none", opacity: 0.7, marker: "arrow-routing" },
  flow: { color: "hsl(var(--cat-core))", width: 2.5, dash: "none", opacity: 0.6, marker: "arrow-flow" },
  reference: { color: "hsl(var(--muted-foreground))", width: 2, dash: "none", opacity: 0.4, marker: "arrow-reference" },
  mention: { color: "hsl(var(--muted-foreground))", width: 1, dash: "4,4", opacity: 0.2, marker: "arrow-mention" },
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

  // Derived styling helpers
  const lowerSearchQuery = searchQuery.toLowerCase();
  
  const isNodeHighlighted = (node: SimNode) => {
    if (selectedNodeId) return node.id === selectedNodeId;
    if (lowerSearchQuery) return node.title.toLowerCase().includes(lowerSearchQuery);
    return false;
  };

  const isNodeDimmed = (node: SimNode) => {
    if (selectedNodeId) return node.id !== selectedNodeId;
    if (lowerSearchQuery) return !node.title.toLowerCase().includes(lowerSearchQuery);
    return false;
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-background relative overflow-hidden">
      {/* Grid Pattern Background */}
      <div className="absolute inset-0 pointer-events-none opacity-20" 
           style={{
             backgroundImage: 'radial-gradient(circle at 2px 2px, hsl(var(--border)) 1px, transparent 0)',
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
              {/* Routing edge arrow (orchestrator hand-off) */}
              <marker id="arrow-routing" viewBox="0 -5 10 10" refX="25" refY="0" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,-5L10,0L0,5" fill="hsl(var(--cat-agent))" opacity={0.85} />
              </marker>
              {/* Flow edge arrow (five-layer pipeline) */}
              <marker id="arrow-flow" viewBox="0 -5 10 10" refX="25" refY="0" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,-5L10,0L0,5" fill="hsl(var(--cat-core))" opacity={0.85} />
              </marker>
              {/* Reference edge arrow */}
              <marker id="arrow-reference" viewBox="0 -5 10 10" refX="25" refY="0" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,-5L10,0L0,5" fill="hsl(var(--muted-foreground))" opacity={0.6} />
              </marker>
              {/* Mention edge arrow */}
              <marker id="arrow-mention" viewBox="0 -5 10 10" refX="25" refY="0" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,-5L10,0L0,5" fill="hsl(var(--muted-foreground))" opacity={0.3} />
              </marker>
            </defs>

            {/* Edges Layer */}
            <g className="edges">
              {simEdges.map((edge, i) => {
                const source = edge.source as SimNode;
                const target = edge.target as SimNode;
                if (source.x === undefined || source.y === undefined || target.x === undefined || target.y === undefined) return null;

                const style = edgeStyleFor(edge.kind);
                const isEdgeHighlighted = selectedNodeId && (source.id === selectedNodeId || target.id === selectedNodeId);
                const isEdgeDimmed = selectedNodeId && !isEdgeHighlighted;

                return (
                  <line
                    key={`edge-${i}`}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke={style.color}
                    strokeWidth={isEdgeHighlighted ? style.width + 1 : style.width}
                    strokeDasharray={style.dash}
                    opacity={isEdgeDimmed ? 0.08 : isEdgeHighlighted ? 0.9 : style.opacity}
                    markerEnd={`url(#${style.marker})`}
                    className="transition-opacity duration-300"
                  />
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

                return (
                  <g 
                    key={node.id}
                    transform={`translate(${node.x},${node.y})`}
                    onClick={() => onSelectNode(node.id)}
                    className="cursor-pointer transition-all duration-300"
                    style={{ 
                      opacity: isDimmed ? 0.2 : 1,
                      transform: `translate(${node.x}px,${node.y}px) scale(${isHighlighted ? 1.2 : 1})`
                    }}
                  >
                    {/* Glow effect for highlighted nodes */}
                    {isHighlighted && (
                      <circle r={24} fill={color} opacity={0.2} className="animate-pulse" />
                    )}
                    
                    {/* Main Node Circle */}
                    <circle 
                      r={16} 
                      fill="hsl(var(--card))"
                      stroke={color}
                      strokeWidth={isHighlighted ? 4 : 2}
                      className="transition-all duration-300 shadow-xl"
                    />
                    
                    {/* Inner core color */}
                    <circle r={8} fill={color} opacity={isHighlighted ? 1 : 0.8} />

                    {/* Node Label — hidden when zoomed out so the overview stays
                        legible, always shown for the highlighted/selected node. */}
                    <text
                      dy={28}
                      textAnchor="middle"
                      fill={isHighlighted ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))"}
                      className={`font-mono text-xs transition-opacity duration-300 ${isHighlighted ? 'font-bold' : ''}`}
                      style={{
                        pointerEvents: 'none',
                        opacity: isHighlighted || scale >= LABEL_VISIBLE_SCALE ? 1 : 0,
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
          title="Zoom to fit"
          aria-label="Zoom to fit"
          className="flex items-center justify-center w-10 h-10 rounded-lg bg-card/80 backdrop-blur-md border border-card-border shadow-2xl text-muted-foreground hover:text-cat-agent hover:border-cat-agent transition-colors"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <div className="flex flex-col rounded-lg bg-card/80 backdrop-blur-md border border-card-border shadow-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => transformRef.current?.zoomIn(0.3)}
            title="Zoom in"
            aria-label="Zoom in"
            className="flex items-center justify-center w-10 h-10 text-muted-foreground hover:text-cat-agent transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
          <div className="h-px bg-card-border" />
          <button
            type="button"
            onClick={() => transformRef.current?.zoomOut(0.3)}
            title="Zoom out"
            aria-label="Zoom out"
            className="flex items-center justify-center w-10 h-10 text-muted-foreground hover:text-cat-agent transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
