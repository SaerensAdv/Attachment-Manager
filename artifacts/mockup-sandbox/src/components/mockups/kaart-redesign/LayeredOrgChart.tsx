import React, { useMemo } from "react";
import { NODES, EDGES, CAT_META, LAYER_ORDER, layeredLayout, type MapEdge, type MapNode } from "./_data";

export function LayeredOrgChart() {
  const width = 1280;
  const height = 900;

  // We use layeredLayout for positions
  const pos = useMemo(() => layeredLayout(width, height), []);

  const getEdgePath = (edge: MapEdge) => {
    const s = pos[edge.source];
    const t = pos[edge.target];
    if (!s || !t) return "";

    const isTopDown = Math.abs(t.y - s.y) > Math.abs(t.x - s.x);

    if (isTopDown) {
      // Vertical elbow
      const midY = (s.y + t.y) / 2;
      return `M ${s.x} ${s.y} L ${s.x} ${midY} L ${t.x} ${midY} L ${t.x} ${t.y}`;
    } else {
      // Horizontal elbow (fallback)
      const midX = (s.x + t.x) / 2;
      return `M ${s.x} ${s.y} L ${midX} ${s.y} L ${midX} ${t.y} L ${t.x} ${t.y}`;
    }
  };

  const getEdgeStyle = (edge: MapEdge) => {
    switch (edge.kind) {
      case "flow":
        return { stroke: "#475569", strokeWidth: 2 };
      case "routing":
        return { stroke: "#64748b", strokeWidth: 1.5 };
      case "reference":
        return { stroke: "#94a3b8", strokeWidth: 1.5, strokeDasharray: "4 4" };
      case "mention":
        return { stroke: "#cbd5e1", strokeWidth: 1, strokeDasharray: "2 4" };
      default:
        return { stroke: "#cbd5e1", strokeWidth: 1 };
    }
  };

  // Determine row positions based on LAYER_ORDER and layeredLayout math
  const padY = 70;
  const rowH = (height - padY * 2) / (LAYER_ORDER.length - 1);

  return (
    <div
      className="min-h-screen w-full bg-[#f8fafc] text-slate-900 overflow-auto relative font-['Inter']"
      style={{ WebkitFontSmoothing: "antialiased" }}
    >
      <div className="w-[1280px] h-[900px] relative mx-auto my-8 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        
        {/* Row Backgrounds & Labels */}
        {LAYER_ORDER.map((cat, r) => {
          const y = padY + rowH * r;
          const meta = CAT_META[cat];
          return (
            <div key={cat} className="absolute left-0 w-full" style={{ top: y - rowH / 2, height: rowH }}>
              {/* Optional faint alternating background */}
              {r % 2 === 0 && <div className="absolute inset-0 bg-slate-50/50" />}
              
              <div className="absolute left-8 top-1/2 -translate-y-1/2 flex items-center gap-4 w-40">
                <div 
                  className="w-1.5 h-12 rounded-full" 
                  style={{ backgroundColor: meta.color }} 
                />
                <div>
                  <div className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                    TIER 0{r + 1}
                  </div>
                  <div className="text-sm font-semibold text-slate-700">
                    {meta.labelNl}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Edges SVG */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {EDGES.map((e, i) => {
            const style = getEdgeStyle(e);
            return (
              <path
                key={i}
                d={getEdgePath(e)}
                fill="none"
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
                strokeDasharray={style.strokeDasharray}
                className="transition-all duration-300"
              />
            );
          })}
        </svg>

        {/* Nodes */}
        {NODES.map((n) => {
          const p = pos[n.id];
          if (!p) return null;
          const meta = CAT_META[n.cat];

          return (
            <div
              key={n.id}
              className="absolute group hover:z-10 transition-transform duration-200 hover:-translate-y-1 cursor-default"
              style={{
                left: p.x,
                top: p.y,
                transform: "translate(-50%, -50%)",
              }}
            >
              <div 
                className="bg-white px-4 py-2.5 rounded-lg shadow-sm border border-slate-200 flex items-center gap-3 min-w-[140px] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)]"
                style={{
                  borderLeftWidth: "4px",
                  borderLeftColor: meta.color,
                }}
              >
                <div 
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: meta.color }}
                />
                <span className="text-xs font-medium text-slate-700 whitespace-nowrap">
                  {n.label}
                </span>
              </div>
            </div>
          );
        })}

        {/* Legend */}
        <div className="absolute top-6 right-8 bg-white/90 backdrop-blur border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-3">Legende</div>
          <div className="flex flex-col gap-2">
            {LAYER_ORDER.map((cat) => {
              const meta = CAT_META[cat];
              return (
                <div key={cat} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.color }} />
                  <span className="text-xs text-slate-600">{meta.labelNl}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-slate-600 rounded" />
              <span className="text-[10px] text-slate-500">Flow</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-[1.5px] bg-slate-500 rounded" />
              <span className="text-[10px] text-slate-500">Routing</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-[1.5px] bg-slate-400 rounded border-dashed border-b border-slate-400 bg-transparent" />
              <span className="text-[10px] text-slate-500">Reference</span>
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="absolute top-8 left-[180px]">
          <h1 className="text-xl font-['Playfair_Display'] font-semibold text-slate-900 tracking-tight">
            Saerens Systeemkaart
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-mono">ORG-STRUCTUUR V2.4</p>
        </div>

      </div>
    </div>
  );
}
