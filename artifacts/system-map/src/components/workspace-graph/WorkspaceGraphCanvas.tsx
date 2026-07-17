import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as d3 from "d3-force";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import type { GraphNode, GraphEdge } from "@workspace/api-client-react";
import {
  nodeColorVar,
  edgeColorVar,
  edgeIsWeak,
  isFlowRelation,
  groupForNode,
  SOURCE_TYPE_ICON,
  type FilterGroupId,
} from "./graph-model";
import { LABEL_LOD, lodFactor, PLATE, plateWidth } from "../graph-viewer-utils";

// ---------------------------------------------------------------------------
// The interactive canvas for the Workspace Graph (Fase 3.5 §7.6/§7.7).
//
// Layout is computed ONCE per node/edge set with d3-force run to completion (no
// per-tick animation — the dense graph would jitter and frame badly). Existing
// nodes are warm-started AND pinned from the previous layout so a sync or an
// expand nudges only the newcomers into place instead of reshuffling the whole
// map. Pan/zoom is delegated to react-zoom-pan-pinch; node labels fade in with
// zoom (LOD) so the overview reads as clean marks and annotates up close.
// ---------------------------------------------------------------------------

interface WGSimNode extends d3.SimulationNodeDatum, GraphNode {
  x?: number;
  y?: number;
}

interface WGSimEdge extends d3.SimulationLinkDatum<WGSimNode> {
  id: string;
  source: string | WGSimNode;
  target: string | WGSimNode;
  relation: GraphEdge["relation"];
  active?: boolean;
  weak: boolean;
}

interface Dimensions {
  width: number;
  height: number;
}

export interface WorkspaceGraphCanvasProps {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  /** Groups toggled off in the legend — their nodes + touching edges hide. */
  hiddenGroups: ReadonlySet<FilterGroupId>;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  /** Re-arms the auto-fit only when the underlying snapshot changes (not on
      an incremental expand, so expanding never yanks the viewport). */
  fitKey?: string;
  /** Search picks a node → pan/centre it. The nonce lets a repeat pick of the
      same id re-centre without changing the target. */
  focusRequest?: { id: string; nonce: number } | null;
}

const NODE_MAX_LABEL = 26;
const truncate = (s: string, n = NODE_MAX_LABEL) =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

function useContainerSize(ref: React.RefObject<HTMLElement | null>): Dimensions {
  const [dims, setDims] = useState<Dimensions>({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setDims({ width: r.width, height: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return dims;
}

export default function WorkspaceGraphCanvas({
  nodes,
  edges,
  hiddenGroups,
  selectedNodeId,
  onSelectNode,
  fitKey,
  focusRequest,
}: WorkspaceGraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dimensions = useContainerSize(containerRef);

  const apiRef = useRef<ReactZoomPanPinchRef | null>(null);
  const posRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const [simNodes, setSimNodes] = useState<WGSimNode[]>([]);
  const [simEdges, setSimEdges] = useState<WGSimEdge[]>([]);
  const [settleNonce, setSettleNonce] = useState(0);
  const [viewScale, setViewScale] = useState(0.6);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // ---- Drag-to-pin -------------------------------------------------------
  // Dragging repositions a node in the VIEW only: it writes the layout pins
  // (fx/fy) and the persisted position cache, never the source GraphNode. A
  // moved-past-threshold drag swallows the trailing click so it doesn't also
  // open the detail panel.
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);
  const didDragRef = useRef(false);
  const [, setDragNonce] = useState(0);

  // Layout keys: the identity of the node/edge SETS. Filter toggles never touch
  // these (they only change visibility), so toggling a legend group never
  // recomputes the layout.
  // fitKey (the snapshot contentHash) is folded in so a content-only sync — a
  // ClickUp rename/status change that leaves the id-set untouched — still
  // rebuilds the sim from the fresh node objects instead of rendering stale
  // labels. Positions are preserved via the warm-start below, so this is
  // visually stable when only fields changed.
  const nodesSig = useMemo(
    () => `${fitKey ?? ""}::${nodes.map((n) => n.id).sort().join("|")}`,
    [nodes, fitKey],
  );
  const edgesSig = useMemo(
    () => `${fitKey ?? ""}::${edges.map((e) => e.id).sort().join("|")}`,
    [edges, fitKey],
  );

  // ---- One-shot organic layout -------------------------------------------
  useEffect(() => {
    if (!dimensions.width || !dimensions.height) return;
    if (nodes.length === 0) {
      setSimNodes([]);
      setSimEdges([]);
      return;
    }

    const simNodesData: WGSimNode[] = nodes.map((n) => {
      const prev = posRef.current.get(n.id);
      // Pin previously-placed nodes so only newcomers relax into the gaps.
      return prev
        ? { ...n, x: prev.x, y: prev.y, fx: prev.x, fy: prev.y }
        : { ...n };
    });
    const byId = new Map(simNodesData.map((n) => [n.id, n]));
    const simEdgesData: WGSimEdge[] = edges
      .filter((e) => byId.has(e.sourceId) && byId.has(e.targetId))
      .map((e) => ({
        id: e.id,
        source: e.sourceId,
        target: e.targetId,
        relation: e.relation,
        active: e.active,
        weak: edgeIsWeak(e.relation),
      }));

    const degree = new Map<string, number>();
    for (const e of simEdgesData) {
      degree.set(e.source as string, (degree.get(e.source as string) ?? 0) + 1);
      degree.set(e.target as string, (degree.get(e.target as string) ?? 0) + 1);
    }
    const degreeOf = (n: WGSimNode) => degree.get(n.id) ?? 0;

    const sim = d3
      .forceSimulation<WGSimNode>(simNodesData)
      .force(
        "link",
        d3
          .forceLink<WGSimNode, WGSimEdge>(simEdgesData)
          .id((d) => d.id)
          .distance((link) => {
            const d = Math.max(
              degreeOf(link.source as WGSimNode),
              degreeOf(link.target as WGSimNode),
            );
            return 120 + Math.min(d, 12) * 12;
          }),
      )
      .force(
        "charge",
        d3.forceManyBody<WGSimNode>().strength((n) => -480 - degreeOf(n) * 90),
      )
      .force("center", d3.forceCenter(dimensions.width / 2, dimensions.height / 2))
      .force(
        "collide",
        d3
          .forceCollide<WGSimNode>()
          .radius((n) =>
            Math.max(plateWidth(truncate(n.label)) / 2, PLATE.height / 2) + 20,
          )
          .strength(1)
          .iterations(3),
      )
      .stop();

    const ticks = Math.ceil(
      Math.log(sim.alphaMin()) / Math.log(1 - sim.alphaDecay()),
    );
    for (let i = 0; i < ticks; i++) sim.tick();

    // Persist the settled positions, then release the temporary layout pins so
    // viewport dragging (which sets its own fx/fy) starts from a clean slate.
    const nextPos = new Map<string, { x: number; y: number }>();
    for (const n of simNodesData) {
      if (n.x !== undefined && n.y !== undefined) {
        nextPos.set(n.id, { x: n.x, y: n.y });
      }
      n.fx = null;
      n.fy = null;
    }
    posRef.current = nextPos;

    setSimNodes([...simNodesData]);
    setSimEdges([...simEdgesData]);
    setSettleNonce((v) => v + 1);

    return () => {
      sim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodesSig, edgesSig, dimensions.width, dimensions.height]);

  // ---- Auto-fit ----------------------------------------------------------
  const didFitRef = useRef(false);
  useEffect(() => {
    didFitRef.current = false;
  }, [fitKey]);

  useEffect(() => {
    if (didFitRef.current) return;
    if (!settleNonce || !dimensions.width || !dimensions.height) return;
    const api = apiRef.current;
    if (!api) return;
    const pts = simNodes.filter((n) => n.x != null && n.y != null);
    if (!pts.length) return;

    const xs = pts.map((n) => n.x as number);
    const ys = pts.map((n) => n.y as number);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 140;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;
    const scale = Math.min(dimensions.width / w, dimensions.height / h, 1.1);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const x = dimensions.width / 2 - cx * scale;
    const y = dimensions.height / 2 - cy * scale;
    api.setTransform(x, y, scale, 0);
    setViewScale(scale);
    didFitRef.current = true;
  }, [settleNonce, simNodes, dimensions.width, dimensions.height]);

  // ---- Focus (search pick) → smooth-pan to the node ----------------------
  // A pick of an off-overview node merges its neighbourhood first, which only
  // lands in simNodes after the layout effect re-runs. So we also re-attempt on
  // simNodes changes, but pan at most once per pick via the nonce guard.
  const lastFocusNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!focusRequest) return;
    if (lastFocusNonceRef.current === focusRequest.nonce) return;
    const api = apiRef.current;
    if (!api || !dimensions.width || !dimensions.height) return;
    const node = simNodes.find((n) => n.id === focusRequest.id);
    if (!node || node.x == null || node.y == null) return; // retry when simNodes updates
    const current = api.instance?.transformState?.scale ?? viewScale;
    const scale = Math.max(current, 0.85);
    const x = dimensions.width / 2 - node.x * scale;
    const y = dimensions.height / 2 - node.y * scale;
    // Honour reduced-motion: jump instantly instead of the 400ms pan.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    api.setTransform(x, y, scale, reduced ? 0 : 400);
    setViewScale(scale);
    lastFocusNonceRef.current = focusRequest.nonce;
    // viewScale is read as a fallback only; excluded to avoid re-pan on zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest, simNodes, dimensions.width, dimensions.height]);

  // ---- LOD scale tracking (rAF-throttled) --------------------------------
  const rafRef = useRef<number | null>(null);
  const pendingScaleRef = useRef(viewScale);
  const onTransformed = useCallback(
    (_ref: ReactZoomPanPinchRef, state: { scale: number }) => {
      pendingScaleRef.current = state.scale;
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setViewScale(pendingScaleRef.current);
      });
    },
    [],
  );
  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const labelOpacity = lodFactor(viewScale, LABEL_LOD[0], LABEL_LOD[1]);

  const isHidden = useCallback(
    (n: Pick<GraphNode, "sourceType">) => hiddenGroups.has(groupForNode(n)),
    [hiddenGroups],
  );

  return (
    <div ref={containerRef} className="absolute inset-0">
      <TransformWrapper
        ref={apiRef}
        minScale={0.12}
        maxScale={4}
        initialScale={0.6}
        limitToBounds={false}
        centerZoomedOut={false}
        doubleClick={{ disabled: true }}
        wheel={{ step: 0.12 }}
        panning={{ velocityDisabled: true }}
        onTransformed={onTransformed}
      >
        <TransformComponent
          wrapperStyle={{ width: "100%", height: "100%" }}
          contentStyle={{ width: dimensions.width, height: dimensions.height }}
        >
          <svg
            width={dimensions.width}
            height={dimensions.height}
            style={{ overflow: "visible" }}
            role="presentation"
          >
            <defs>
              <marker
                id="wg-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5.5"
                markerHeight="5.5"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
              </marker>
            </defs>

            {/* Background — a click on empty space clears the selection. */}
            <rect
              x={-dimensions.width * 4}
              y={-dimensions.height * 4}
              width={dimensions.width * 9}
              height={dimensions.height * 9}
              fill="transparent"
              onClick={() => onSelectNode(null)}
            />

            {/* Edges */}
            <g>
              {simEdges.map((e) => {
                const s = e.source as WGSimNode;
                const t = e.target as WGSimNode;
                if (s.x == null || t.x == null) return null;
                if (isHidden(s) || isHidden(t)) return null;

                const color = edgeColorVar(e);
                const flow = isFlowRelation(e.relation) && e.active !== false;
                const emphasised =
                  (hoveredId != null && (s.id === hoveredId || t.id === hoveredId)) ||
                  (selectedNodeId != null &&
                    (s.id === selectedNodeId || t.id === selectedNodeId));
                const opacity = emphasised ? 0.95 : e.weak ? 0.26 : 0.5;

                return (
                  <line
                    key={e.id}
                    x1={s.x}
                    y1={s.y}
                    x2={t.x}
                    y2={t.y}
                    stroke={color}
                    strokeWidth={emphasised ? 2 : 1.25}
                    strokeDasharray={e.weak ? "3,5" : undefined}
                    opacity={opacity}
                    markerEnd="url(#wg-arrow)"
                    className={flow ? "atlas-flow-line" : undefined}
                  />
                );
              })}
            </g>

            {/* Nodes */}
            <g>
              {simNodes.map((n) => {
                if (n.x == null || n.y == null) return null;
                if (isHidden(n)) return null;

                const label = truncate(n.label);
                const w = plateWidth(label);
                const h = PLATE.height;
                const color = nodeColorVar(n);
                const Icon = SOURCE_TYPE_ICON[n.sourceType];
                const selected = n.id === selectedNodeId;
                const hovered = n.id === hoveredId;
                const strokeWidth = selected ? 2.5 : hovered ? 2 : 1.25;
                const textOpacity = selected || hovered ? 1 : labelOpacity;

                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x - w / 2},${n.y - h / 2})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${n.label} — ${n.sourceType}`}
                    className="cursor-grab active:cursor-grabbing outline-none"
                    style={{ touchAction: "none" }}
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      (ev.currentTarget as Element).setPointerCapture(
                        ev.pointerId,
                      );
                      dragRef.current = {
                        id: n.id,
                        startX: ev.clientX,
                        startY: ev.clientY,
                        lastX: ev.clientX,
                        lastY: ev.clientY,
                        moved: false,
                      };
                    }}
                    onPointerMove={(ev) => {
                      const drag = dragRef.current;
                      if (!drag || drag.id !== n.id) return;
                      const px = n.x;
                      const py = n.y;
                      if (px == null || py == null) return;
                      const scale =
                        apiRef.current?.instance?.transformState?.scale ?? 0.6;
                      const nx = px + (ev.clientX - drag.lastX) / scale;
                      const ny = py + (ev.clientY - drag.lastY) / scale;
                      n.x = nx;
                      n.y = ny;
                      n.fx = nx;
                      n.fy = ny;
                      if (
                        !drag.moved &&
                        Math.hypot(
                          ev.clientX - drag.startX,
                          ev.clientY - drag.startY,
                        ) > 3
                      ) {
                        drag.moved = true;
                      }
                      drag.lastX = ev.clientX;
                      drag.lastY = ev.clientY;
                      posRef.current.set(n.id, { x: nx, y: ny });
                      setDragNonce((v) => v + 1);
                    }}
                    onPointerUp={(ev) => {
                      (ev.currentTarget as Element).releasePointerCapture?.(
                        ev.pointerId,
                      );
                      if (dragRef.current?.moved) didDragRef.current = true;
                      dragRef.current = null;
                    }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (didDragRef.current) {
                        didDragRef.current = false;
                        return;
                      }
                      onSelectNode(n.id);
                    }}
                    onMouseEnter={() => setHoveredId(n.id)}
                    onMouseLeave={() =>
                      setHoveredId((cur) => (cur === n.id ? null : cur))
                    }
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        onSelectNode(n.id);
                      }
                    }}
                  >
                    {selected && (
                      <rect
                        x={-4}
                        y={-4}
                        width={w + 8}
                        height={h + 8}
                        fill="none"
                        stroke={color}
                        strokeWidth={1}
                        opacity={0.5}
                      />
                    )}
                    <rect
                      width={w}
                      height={h}
                      fill="hsl(var(--card))"
                      stroke={color}
                      strokeWidth={strokeWidth}
                    />
                    <g
                      transform="translate(9, 7)"
                      style={{ color }}
                      aria-hidden="true"
                    >
                      <Icon width={14} height={14} />
                    </g>
                    <text
                      x={30}
                      y={h / 2}
                      dominantBaseline="central"
                      fontSize={11}
                      fill="hsl(var(--foreground))"
                      opacity={textOpacity}
                      style={{ fontFamily: "'Space Mono', monospace" }}
                    >
                      {label}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
