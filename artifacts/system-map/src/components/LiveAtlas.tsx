import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3-force";
import type { DocNode, DocEdge } from "@workspace/api-client-react";

// A non-interactive, ambient version of the Operations Atlas used as a living
// backdrop on the Generate page. It reuses the same force layout and editorial
// "seal" node language as GraphViewer, but instead of zoom/pan it gently pulses
// at rest and — while a run is active — lights up the orchestrator + the team
// that is working and streams "hand-off" beads from one agent to the next, so
// the user literally sees the team passing the work along on the map.

interface LiveAtlasProps {
  nodes: DocNode[];
  edges: DocEdge[];
  orchestratorId: string | null;
  // The working team in hand-off order (lead first, then members), by node id.
  teamIds: string[];
  // The node currently doing the work (orchestrator while routing).
  activeId: string | null;
  doneIds: string[];
  // True while routing/generating or once a team has been assigned.
  active: boolean;
  // Overall layer opacity — lowered once a lot of output text covers the map.
  baseOpacity: number;
}

interface SimNode extends d3.SimulationNodeDatum, DocNode {
  x?: number;
  y?: number;
}
interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
  kind: string;
}

const catColor = (c: string) => `hsl(var(--cat-${c}))`;

const EDGE_STYLE: Record<string, { color: string; width: number; opacity: number }> = {
  routing: { color: "hsl(var(--cat-agent))", width: 1.5, opacity: 0.45 },
  flow: { color: "hsl(var(--cat-core))", width: 1.5, opacity: 0.4 },
  reference: { color: "hsl(var(--foreground))", width: 1, opacity: 0.18 },
  mention: { color: "hsl(var(--foreground))", width: 1, opacity: 0.1 },
};
const edgeStyleFor = (k: string) => EDGE_STYLE[k] ?? EDGE_STYLE.mention;

export default function LiveAtlas({
  nodes,
  edges,
  orchestratorId,
  teamIds,
  activeId,
  doneIds,
  active,
  baseOpacity,
}: LiveAtlasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState({ width: 800, height: 600 });
  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [simEdges, setSimEdges] = useState<SimEdge[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setDim({ width: e.contentRect.width, height: e.contentRect.height });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Settle the force layout synchronously, same configuration as GraphViewer so
  // the backdrop reads as the very same map the user knows from "Kaart".
  useEffect(() => {
    if (!nodes.length) {
      setSimNodes([]);
      setSimEdges([]);
      return;
    }
    const sn: SimNode[] = nodes.map((n) => ({ ...n }));
    const se: SimEdge[] = edges.map((e) => ({ ...e }));

    const degree = new Map<string, number>();
    for (const e of se) {
      degree.set(e.source as string, (degree.get(e.source as string) ?? 0) + 1);
      degree.set(e.target as string, (degree.get(e.target as string) ?? 0) + 1);
    }
    const deg = (n: SimNode) => degree.get(n.id) ?? 0;

    const sim = d3
      .forceSimulation<SimNode>(sn)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimEdge>(se)
          .id((d) => d.id)
          .distance((l) => {
            const d = Math.max(deg(l.source as SimNode), deg(l.target as SimNode));
            return 130 + Math.min(d, 12) * 12;
          }),
      )
      .force("charge", d3.forceManyBody<SimNode>().strength((n) => -500 - deg(n) * 90))
      .force("center", d3.forceCenter(dim.width / 2, dim.height / 2))
      .force(
        "collide",
        d3
          .forceCollide<SimNode>()
          .radius((n) => 16 + 34 + Math.min(deg(n), 12) * 3)
          .strength(1)
          .iterations(3),
      )
      .stop();

    const ticks = Math.ceil(
      Math.log(sim.alphaMin()) / Math.log(1 - sim.alphaDecay()),
    );
    for (let i = 0; i < ticks; i++) sim.tick();

    setSimNodes([...sn]);
    setSimEdges([...se]);
    return () => {
      sim.stop();
    };
  }, [nodes, edges, dim.width, dim.height]);

  const posById = useMemo(() => {
    const m = new Map<string, SimNode>();
    for (const n of simNodes) m.set(n.id, n);
    return m;
  }, [simNodes]);

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
  const radiusOf = (n: SimNode) => 12 + Math.min(degreeMap.get(n.id) ?? 0, 14);

  // Frame the whole map within the backdrop (no manual pan/zoom).
  const transform = useMemo(() => {
    const pts = simNodes.filter((n) => n.x !== undefined && n.y !== undefined);
    if (!pts.length) return { k: 1, tx: 0, ty: 0 };
    const xs = pts.map((n) => n.x as number);
    const ys = pts.map((n) => n.y as number);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 70;
    const gw = maxX - minX + pad * 2;
    const gh = maxY - minY + pad * 2;
    const k = Math.max(0.1, Math.min(dim.width / gw, dim.height / gh, 1.5));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return { k, tx: dim.width / 2 - cx * k, ty: dim.height / 2 - cy * k };
  }, [simNodes, dim.width, dim.height]);

  const runSet = useMemo(() => {
    const s = new Set<string>();
    if (orchestratorId) s.add(orchestratorId);
    for (const id of teamIds) s.add(id);
    return s;
  }, [orchestratorId, teamIds]);
  const doneSet = useMemo(() => new Set(doneIds), [doneIds]);

  // The hand-off chain: orchestrator first, then the team in execution order.
  const chain = useMemo(() => {
    const c: string[] = [];
    if (orchestratorId) c.push(orchestratorId);
    for (const id of teamIds) c.push(id);
    return c.filter((id) => posById.has(id));
  }, [orchestratorId, teamIds, posById]);
  const activeIndex = activeId ? chain.indexOf(activeId) : -1;

  const curve = (a: SimNode, b: SimNode) => {
    const ra = radiusOf(a);
    const rb = radiusOf(b);
    const dx = b.x! - a.x!;
    const dy = b.y! - a.y!;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const x1 = a.x! + ux * (ra + 2);
    const y1 = a.y! + uy * (ra + 2);
    const x2 = b.x! - ux * (rb + 7);
    const y2 = b.y! - uy * (rb + 7);
    const bow = Math.min(len * 0.12, 56);
    const cx = (x1 + x2) / 2 - uy * bow;
    const cy = (y1 + y2) / 2 + ux * bow;
    return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
  };

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden">
      {/* Faint ink dots on cream paper — same texture as the Kaart page. */}
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 2px 2px, hsl(var(--foreground) / 0.14) 1px, transparent 0)",
          backgroundSize: "30px 30px",
        }}
      />
      <svg width={dim.width} height={dim.height} className="absolute inset-0">
        <defs>
          <filter id="atlas-node-shadow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#1A1A1A" floodOpacity="0.18" />
          </filter>
        </defs>

        <g
          opacity={baseOpacity}
          style={{
            transform: `translate(${transform.tx}px,${transform.ty}px) scale(${transform.k})`,
            transition: "transform 1.2s cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          {/* Structural edges — ambient at rest, dimmed away from the team while
              a run is in progress so the hand-off chain reads clearly. */}
          <g fill="none">
            {simEdges.map((edge, i) => {
              const s = edge.source as SimNode;
              const t = edge.target as SimNode;
              if (s.x === undefined || s.y === undefined || t.x === undefined || t.y === undefined)
                return null;
              const style = edgeStyleFor(edge.kind);
              const bothInRun = runSet.has(s.id) && runSet.has(t.id);
              const opacity = active
                ? bothInRun
                  ? 0.45
                  : 0.05
                : style.opacity * 0.7;
              if (opacity < 0.02) return null;
              const d = curve(s, t);
              const isPipe = edge.kind === "routing" || edge.kind === "flow";
              return (
                <g key={`e-${i}`}>
                  <path d={d} stroke={style.color} strokeWidth={style.width} opacity={opacity} strokeLinecap="round" />
                  {isPipe && opacity > 0.12 && (
                    <path
                      d={d}
                      stroke="hsl(var(--accent))"
                      strokeWidth={style.width + 0.5}
                      strokeDasharray="0,16"
                      strokeLinecap="round"
                      opacity={opacity * 0.9}
                      className="atlas-flow-line"
                    />
                  )}
                </g>
              );
            })}
          </g>

          {/* Hand-off chain — the team relaying the work along the map. */}
          {active && chain.length > 1 && (
            <g fill="none">
              {chain.slice(0, -1).map((id, i) => {
                const a = posById.get(id);
                const b = posById.get(chain[i + 1]);
                if (!a || !b) return null;
                const d = curve(a, b);
                const reached = activeIndex < 0 || i < activeIndex;
                const isActiveSeg = i + 1 === activeIndex;
                return (
                  <g key={`chain-${i}`}>
                    <path
                      d={d}
                      stroke="hsl(var(--accent))"
                      strokeWidth={isActiveSeg ? 2.5 : 1.75}
                      opacity={reached || isActiveSeg ? 0.55 : 0.2}
                      strokeLinecap="round"
                    />
                    <path
                      d={d}
                      stroke="hsl(var(--accent))"
                      strokeWidth={isActiveSeg ? 3.5 : 2.5}
                      strokeDasharray="0,14"
                      strokeLinecap="round"
                      opacity={isActiveSeg ? 1 : reached ? 0.5 : 0.15}
                      className="atlas-flow-line"
                    />
                  </g>
                );
              })}
            </g>
          )}

          {/* Nodes */}
          <g>
            {simNodes.map((node) => {
              if (node.x === undefined || node.y === undefined) return null;
              const r = radiusOf(node);
              const inRun = runSet.has(node.id);
              const isActiveNode = node.id === activeId;
              const isDone = doneSet.has(node.id);
              const isAgent = node.category === "agent";
              const color = isActiveNode ? "hsl(var(--accent))" : catColor(node.category);

              const opacity = active ? (inRun ? 1 : 0.12) : isAgent ? 0.75 : 0.45;
              const showLabel = active && inRun;

              return (
                <g
                  key={node.id}
                  style={{
                    opacity,
                    transform: `translate(${node.x}px,${node.y}px) scale(${isActiveNode ? 1.2 : 1})`,
                    transition: "opacity 0.6s ease, transform 0.6s ease",
                  }}
                >
                  {/* Active worker — strong pulsing halo in the accent. */}
                  {isActiveNode && (
                    <circle r={r + 13} fill="hsl(var(--accent))" opacity={0.22} className="animate-pulse" />
                  )}
                  {/* Idle ambient breathing on agent nodes when nothing runs. */}
                  {!active && isAgent && (
                    <circle r={r + 8} fill={color} className="atlas-idle-pulse" />
                  )}
                  {/* Queued / waiting team members carry a soft steady ring. */}
                  {active && inRun && !isActiveNode && !isDone && (
                    <circle r={r + 6} fill="none" stroke="hsl(var(--accent))" strokeWidth={1} opacity={0.35} />
                  )}

                  <g filter="url(#atlas-node-shadow)">
                    <circle
                      r={r}
                      fill="hsl(var(--card))"
                      stroke={color}
                      strokeWidth={isActiveNode || isDone ? 3.5 : 2.25}
                    />
                  </g>

                  {/* Completed team member — filled accent core. */}
                  {active && isDone ? (
                    <circle r={Math.max(4, r * 0.5)} fill="hsl(var(--accent))" />
                  ) : (
                    <circle r={Math.max(3, r * 0.4)} fill={color} />
                  )}

                  {showLabel && (
                    <text
                      dy={r + 15}
                      textAnchor="middle"
                      fill="hsl(var(--foreground))"
                      className="font-['Space_Mono'] text-[10px] uppercase tracking-wider"
                      style={{
                        pointerEvents: "none",
                        paintOrder: "stroke",
                        stroke: "hsl(var(--card))",
                        strokeWidth: 3,
                        strokeLinejoin: "round",
                        fontWeight: isActiveNode ? 700 : 400,
                      }}
                    >
                      {node.title}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}
