import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3-force";
import { LocateFixed, Minus, Plus } from "lucide-react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import type { GraphNode, GraphEdge } from "@workspace/api-client-react";
import {
  edgeColorVar,
  edgeIsWeak,
  groupForNode,
  isFlowRelation,
  nodeColorVar,
  type FilterGroupId,
} from "./graph-model";

interface SimNode extends d3.SimulationNodeDatum, GraphNode {
  x?: number;
  y?: number;
}

interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  id: string;
  source: string | SimNode;
  target: string | SimNode;
  relation: GraphEdge["relation"];
  active?: boolean;
  weak: boolean;
}

export interface WorkspaceGraphCanvasProps {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  hiddenGroups: ReadonlySet<FilterGroupId>;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  fitKey?: string;
  focusRequest?: { id: string; nonce: number } | null;
}

function radius(node: GraphNode) {
  if (node.sourceType === "workspace") return 17;
  if (["space", "client", "integration"].includes(node.sourceType)) return 12;
  if (["folder", "doc", "agent", "workflow"].includes(node.sourceType)) return 9;
  return 6;
}

function useSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
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
  const container = useRef<HTMLDivElement | null>(null);
  const api = useRef<ReactZoomPanPinchRef | null>(null);
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const size = useSize(container);
  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [simEdges, setSimEdges] = useState<SimEdge[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [scale, setScale] = useState(0.7);
  const [settled, setSettled] = useState(0);
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const [, redraw] = useState(0);

  const signature = useMemo(
    () =>
      `${fitKey ?? ""}:${nodes.map((node) => node.id).sort().join("|")}:${edges
        .map((edge) => edge.id)
        .sort()
        .join("|")}`,
    [fitKey, nodes, edges],
  );

  useEffect(() => {
    if (!size.width || !size.height || !nodes.length) return;
    const nextNodes: SimNode[] = nodes.map((node) => ({
      ...node,
      ...(positions.current.get(node.id) ?? {}),
    }));
    const byId = new Map(nextNodes.map((node) => [node.id, node]));
    const nextEdges: SimEdge[] = edges
      .filter((edge) => byId.has(edge.sourceId) && byId.has(edge.targetId))
      .map((edge) => ({
        id: edge.id,
        source: edge.sourceId,
        target: edge.targetId,
        relation: edge.relation,
        active: edge.active,
        weak: edgeIsWeak(edge.relation),
      }));
    const degree = new Map<string, number>();
    nextEdges.forEach((edge) => {
      degree.set(edge.source as string, (degree.get(edge.source as string) ?? 0) + 1);
      degree.set(edge.target as string, (degree.get(edge.target as string) ?? 0) + 1);
    });
    const simulation = d3
      .forceSimulation(nextNodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimEdge>(nextEdges)
          .id((node) => node.id)
          .distance(
            (edge) =>
              78 +
              Math.min(
                12,
                Math.max(
                  degree.get((edge.source as SimNode).id) ?? 0,
                  degree.get((edge.target as SimNode).id) ?? 0,
                ),
              ) *
                6,
          )
          .strength(0.72),
      )
      .force(
        "charge",
        d3
          .forceManyBody<SimNode>()
          .strength((node) => -280 - (degree.get(node.id) ?? 0) * 45),
      )
      .force("center", d3.forceCenter(size.width / 2, size.height / 2))
      .force(
        "collide",
        d3
          .forceCollide<SimNode>()
          .radius((node) => radius(node) + 28)
          .iterations(2),
      )
      .stop();
    for (let index = 0; index < 260; index += 1) simulation.tick();
    nextNodes.forEach((node) => {
      if (node.x != null && node.y != null) {
        positions.current.set(node.id, { x: node.x, y: node.y });
      }
    });
    setSimNodes([...nextNodes]);
    setSimEdges([...nextEdges]);
    setSettled((value) => value + 1);
    return () => {
      simulation.stop();
    };
  }, [signature, size.width, size.height, nodes, edges]);

  const fit = useCallback(
    (duration = 380) => {
      if (!api.current || !simNodes.length || !size.width || !size.height) return;
      const xs = simNodes.map((node) => node.x ?? 0);
      const ys = simNodes.map((node) => node.y ?? 0);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const nextScale = Math.min(
        0.94,
        size.width / (maxX - minX + 260),
        size.height / (maxY - minY + 220),
      );
      api.current.setTransform(
        size.width / 2 - ((minX + maxX) / 2) * nextScale,
        size.height / 2 - ((minY + maxY) / 2) * nextScale,
        nextScale,
        duration,
      );
      setScale(nextScale);
    },
    [simNodes, size],
  );

  useEffect(() => {
    if (settled) fit(0);
  }, [settled, fit]);

  useEffect(() => {
    if (!focusRequest || !api.current) return;
    const node = simNodes.find((item) => item.id === focusRequest.id);
    if (node?.x == null || node.y == null) return;
    const nextScale = Math.max(scale, 0.9);
    api.current.setTransform(
      size.width / 2 - node.x * nextScale,
      size.height / 2 - node.y * nextScale,
      nextScale,
      380,
    );
  }, [focusRequest, simNodes, size, scale]);

  const hidden = (node: GraphNode) => hiddenGroups.has(groupForNode(node));
  const connected = useMemo(() => {
    if (!selectedNodeId) return null;
    const result = new Set([selectedNodeId]);
    simEdges.forEach((edge) => {
      const source = edge.source as SimNode;
      const target = edge.target as SimNode;
      if (source.id === selectedNodeId) result.add(target.id);
      if (target.id === selectedNodeId) result.add(source.id);
    });
    return result;
  }, [selectedNodeId, simEdges]);

  return (
    <div ref={container} className="atlas-canvas">
      <TransformWrapper
        ref={api}
        minScale={0.18}
        maxScale={3.4}
        initialScale={0.7}
        limitToBounds={false}
        centerZoomedOut={false}
        doubleClick={{ disabled: true }}
        wheel={{ step: 0.1 }}
        panning={{ velocityDisabled: true }}
        onTransformed={(_, state) => setScale(state.scale)}
      >
        <TransformComponent
          wrapperStyle={{ width: "100%", height: "100%" }}
          contentStyle={{ width: size.width, height: size.height }}
        >
          <svg width={size.width} height={size.height} role="img" aria-label="Interactieve workspace graph">
            <defs>
              <marker id="atlas-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="4" markerHeight="4" orient="auto">
                <path d="M0 0L10 5L0 10Z" fill="context-stroke" />
              </marker>
            </defs>
            <rect x={-size.width * 3} y={-size.height * 3} width={size.width * 7} height={size.height * 7} fill="transparent" onClick={() => onSelectNode(null)} />
            <g>
              {simEdges.map((edge) => {
                const source = edge.source as SimNode;
                const target = edge.target as SimNode;
                if (hidden(source) || hidden(target) || source.x == null || source.y == null || target.x == null || target.y == null) return null;
                const active = selectedNodeId === source.id || selectedNodeId === target.id || hovered === source.id || hovered === target.id;
                const dim = connected && (!connected.has(source.id) || !connected.has(target.id));
                const mx = (source.x + target.x) / 2 + (target.y - source.y) * 0.08;
                const my = (source.y + target.y) / 2 - (target.x - source.x) * 0.08;
                return <path key={edge.id} d={`M${source.x},${source.y} Q${mx},${my} ${target.x},${target.y}`} fill="none" stroke={edgeColorVar(edge)} strokeWidth={active ? 1.8 : 1} strokeDasharray={edge.weak ? "3 6" : isFlowRelation(edge.relation) ? "5 7" : undefined} markerEnd="url(#atlas-arrow)" opacity={dim ? 0.05 : active ? 0.94 : edge.weak ? 0.22 : 0.48} className={isFlowRelation(edge.relation) && edge.active !== false ? "atlas-flow-line" : undefined} />;
              })}
            </g>
            <g>
              {simNodes.map((node) => {
                if (hidden(node) || node.x == null || node.y == null) return null;
                const r = radius(node);
                const selected = node.id === selectedNodeId;
                const isHovered = node.id === hovered;
                const dim = connected && !connected.has(node.id);
                const showLabel = selected || isHovered || scale > 0.54 || r >= 12;
                return (
                  <g key={node.id} transform={`translate(${node.x},${node.y})`} role="button" tabIndex={0} aria-label={`${node.label}, ${node.sourceType}`} className="atlas-node" opacity={dim ? 0.12 : 1}
                    onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: node.id, x: event.clientX, y: event.clientY, moved: false }; }}
                    onPointerMove={(event) => { if (!drag.current || drag.current.id !== node.id) return; const dx = (event.clientX - drag.current.x) / scale; const dy = (event.clientY - drag.current.y) / scale; node.x = (node.x ?? 0) + dx; node.y = (node.y ?? 0) + dy; drag.current.x = event.clientX; drag.current.y = event.clientY; drag.current.moved ||= Math.hypot(dx, dy) > 2; positions.current.set(node.id, { x: node.x, y: node.y }); redraw((value) => value + 1); }}
                    onPointerUp={(event) => { event.currentTarget.releasePointerCapture(event.pointerId); dragged.current = Boolean(drag.current?.moved); drag.current = null; }}
                    onClick={(event) => { event.stopPropagation(); if (dragged.current) { dragged.current = false; return; } onSelectNode(node.id); }}
                    onMouseEnter={() => setHovered(node.id)} onMouseLeave={() => setHovered(null)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelectNode(node.id); }}
                  >
                    {selected && <circle r={r + 8} fill="none" stroke={nodeColorVar(node)} strokeWidth="1.4" opacity=".75" className="atlas-node-pulse" />}
                    <circle r={r} fill="hsl(var(--card))" stroke={nodeColorVar(node)} strokeWidth={selected ? 2.4 : isHovered ? 2 : 1.25} />
                    <circle r={Math.max(2.2, r * 0.2)} fill={nodeColorVar(node)} />
                    {showLabel && <g className="atlas-node-copy"><text x={r + 8} y="-2" fill="hsl(var(--foreground))">{node.label.length > 30 ? `${node.label.slice(0, 29)}…` : node.label}</text><text x={r + 8} y="10" className="meta">{node.sourceType.toUpperCase()}</text></g>}
                  </g>
                );
              })}
            </g>
          </svg>
        </TransformComponent>
      </TransformWrapper>
      <div className="atlas-zoom">
        <button onClick={() => api.current?.zoomIn(0.28)} aria-label="Inzoomen"><Plus /></button>
        <button onClick={() => api.current?.zoomOut(0.28)} aria-label="Uitzoomen"><Minus /></button>
        <button onClick={() => fit()} aria-label="Passend maken"><LocateFixed /></button>
      </div>
    </div>
  );
}
