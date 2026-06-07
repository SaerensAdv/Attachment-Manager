import React, { useMemo, useState, useEffect } from "react";
import { NODES, EDGES, CAT_META, layeredLayout, degreeOf } from "./_data";
import "./Blueprint.css";

const INK = "#1a1a1a";
const INDIGO = "#4338ca";
const STONE = "#78716c";
const STONE_LIGHT = "#a8a29e";

export function Blueprint() {
  const [dimensions, setDimensions] = useState({ w: 1280, h: 900 });

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        w: window.innerWidth || 1280,
        h: window.innerHeight || 900,
      });
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const layout = useMemo(() => {
    return layeredLayout(dimensions.w, dimensions.h);
  }, [dimensions.w, dimensions.h]);

  const renderOrthogonalPath = (sourceId: string, targetId: string) => {
    const s = layout[sourceId];
    const t = layout[targetId];
    if (!s || !t) return null;

    const midY = s.y + (t.y - s.y) / 2;

    return `M ${s.x} ${s.y} L ${s.x} ${midY} L ${t.x} ${midY} L ${t.x} ${t.y}`;
  };

  const getEdgeStyle = (kind: string) => {
    switch (kind) {
      case "flow":
        return { stroke: INDIGO, strokeWidth: 2, strokeDasharray: "none", marker: "url(#arrow-indigo)" };
      case "routing":
        return { stroke: INK, strokeWidth: 1.4, strokeDasharray: "5 3", marker: "url(#arrow-ink)" };
      case "reference":
        return { stroke: STONE, strokeWidth: 1, strokeDasharray: "2 4", marker: undefined };
      case "mention":
        return { stroke: STONE_LIGHT, strokeWidth: 1, strokeDasharray: "1 6", marker: undefined };
      default:
        return { stroke: STONE, strokeWidth: 1, strokeDasharray: "none", marker: undefined };
    }
  };

  return (
    <div className="blueprint-container font-['Space_Mono'] min-h-screen w-full relative overflow-hidden">
      <div className="blueprint-grid absolute inset-0 pointer-events-none"></div>

      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <marker id="arrow-indigo" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
            <polygon points="0 0, 7 3, 0 6" fill={INDIGO} />
          </marker>
          <marker id="arrow-ink" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
            <polygon points="0 0, 7 3, 0 6" fill={INK} />
          </marker>
        </defs>

        {EDGES.map((edge, idx) => {
          const style = getEdgeStyle(edge.kind);
          return (
            <path
              key={idx}
              d={renderOrthogonalPath(edge.source, edge.target) || ""}
              fill="none"
              stroke={style.stroke}
              strokeWidth={style.strokeWidth}
              strokeDasharray={style.strokeDasharray}
              markerEnd={style.marker}
              className="blueprint-edge"
            />
          );
        })}
      </svg>

      {NODES.map((node) => {
        const pos = layout[node.id];
        if (!pos) return null;

        const meta = CAT_META[node.cat];
        const isCore = node.cat === "core";

        return (
          <div
            key={node.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 blueprint-node flex flex-col items-center justify-center text-center"
            style={{ left: pos.x, top: pos.y }}
          >
            <div className="text-[8px] text-[#a8a29e] uppercase tracking-wider mb-1 w-full flex justify-between px-1 gap-2">
              <span>{Math.round(pos.x)},{Math.round(pos.y)}</span>
              <span>{node.id.split("-")[0]}</span>
            </div>
            <div
              className={`px-2.5 py-1.5 border bg-white whitespace-nowrap shadow-[0_1px_2px_rgba(26,26,26,0.08)] ${
                isCore ? "font-bold" : ""
              }`}
              style={{
                borderColor: meta.color,
                borderWidth: isCore ? 2 : 1,
                color: INK,
                backgroundColor: isCore ? `${meta.color}0d` : "#ffffff",
              }}
            >
              <span className="text-[10px] uppercase tracking-[0.12em]">{node.label}</span>
            </div>
            <div className="absolute -left-1 -top-1 w-2 h-2 border-t border-l" style={{ borderColor: STONE }}></div>
            <div className="absolute -right-1 -top-1 w-2 h-2 border-t border-r" style={{ borderColor: STONE }}></div>
            <div className="absolute -left-1 -bottom-1 w-2 h-2 border-b border-l" style={{ borderColor: STONE }}></div>
            <div className="absolute -right-1 -bottom-1 w-2 h-2 border-b border-r" style={{ borderColor: STONE }}></div>
          </div>
        );
      })}

      {/* Category legend */}
      <div className="absolute bottom-6 left-6 border border-[#d6d3d1] bg-white/90 p-4 backdrop-blur-sm shadow-[0_1px_3px_rgba(26,26,26,0.08)]">
        <div className="text-[11px] text-[#57534e] uppercase tracking-[0.2em] mb-3 border-b border-[#e7e5e4] pb-2">
          Legende
        </div>
        <div className="space-y-2">
          {(Object.entries(CAT_META) as [keyof typeof CAT_META, typeof CAT_META[keyof typeof CAT_META]][]).map(
            ([cat, meta]) => (
              <div key={cat} className="flex items-center gap-3">
                <div className="w-3 h-3 border" style={{ borderColor: meta.color, backgroundColor: `${meta.color}1f` }}></div>
                <span className="text-[10px] uppercase text-[#44403c] tracking-wider">{meta.labelNl}</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Edge legend */}
      <div className="absolute bottom-6 right-6 border border-[#d6d3d1] bg-white/90 p-4 backdrop-blur-sm text-right shadow-[0_1px_3px_rgba(26,26,26,0.08)]">
        <div className="text-[11px] text-[#57534e] uppercase tracking-[0.2em] mb-3 border-b border-[#e7e5e4] pb-2">
          Verbindingen
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-end gap-3">
            <span className="text-[10px] uppercase text-[#44403c] tracking-wider">Flow</span>
            <svg width="30" height="4"><line x1="0" y1="2" x2="30" y2="2" stroke={INDIGO} strokeWidth="2" /></svg>
          </div>
          <div className="flex items-center justify-end gap-3">
            <span className="text-[10px] uppercase text-[#44403c] tracking-wider">Routing</span>
            <svg width="30" height="4"><line x1="0" y1="2" x2="30" y2="2" stroke={INK} strokeWidth="1.4" strokeDasharray="5 3" /></svg>
          </div>
          <div className="flex items-center justify-end gap-3">
            <span className="text-[10px] uppercase text-[#44403c] tracking-wider">Referentie</span>
            <svg width="30" height="4"><line x1="0" y1="2" x2="30" y2="2" stroke={STONE} strokeWidth="1" strokeDasharray="2 4" /></svg>
          </div>
          <div className="flex items-center justify-end gap-3">
            <span className="text-[10px] uppercase text-[#44403c] tracking-wider">Vermelding</span>
            <svg width="30" height="4"><line x1="0" y1="2" x2="30" y2="2" stroke={STONE_LIGHT} strokeWidth="1" strokeDasharray="1 6" /></svg>
          </div>
        </div>
      </div>

      {/* Title */}
      <div className="absolute top-6 left-6">
        <div className="text-2xl text-[#1a1a1a] font-bold tracking-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
          Saerens
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[10px] text-[#57534e] uppercase tracking-[0.25em]">Systeemkaart</span>
          <div className="w-8 h-px" style={{ backgroundColor: INDIGO }}></div>
          <span className="text-[10px] uppercase tracking-[0.25em]" style={{ color: INDIGO }}>Schematisch</span>
        </div>
      </div>
    </div>
  );
}
