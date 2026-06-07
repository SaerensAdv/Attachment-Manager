import React, { useMemo, useState, useEffect } from "react";
import { NODES, EDGES, CAT_META, layeredLayout, degreeOf } from "./_data";
import "./Blueprint.css";

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
        return { stroke: "rgba(0, 255, 255, 0.8)", strokeWidth: 2, strokeDasharray: "none" };
      case "routing":
        return { stroke: "rgba(0, 255, 255, 0.5)", strokeWidth: 1.5, strokeDasharray: "4 2" };
      case "reference":
        return { stroke: "rgba(0, 200, 255, 0.3)", strokeWidth: 1, strokeDasharray: "2 4" };
      case "mention":
        return { stroke: "rgba(0, 150, 255, 0.15)", strokeWidth: 1, strokeDasharray: "1 6" };
      default:
        return { stroke: "rgba(0, 255, 255, 0.3)", strokeWidth: 1, strokeDasharray: "none" };
    }
  };

  return (
    <div className="blueprint-container font-['Space_Mono'] text-cyan-50 min-h-screen w-full relative overflow-hidden bg-[#040f16]">
      <div className="blueprint-grid absolute inset-0 pointer-events-none opacity-20"></div>
      
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <polygon points="0 0, 6 3, 0 6" fill="rgba(0, 255, 255, 0.6)" />
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
              markerEnd={edge.kind === "flow" || edge.kind === "routing" ? "url(#arrowhead)" : undefined}
              className="blueprint-edge"
            />
          );
        })}
      </svg>

      {NODES.map((node) => {
        const pos = layout[node.id];
        if (!pos) return null;
        
        const deg = degreeOf(node.id);
        const meta = CAT_META[node.cat];
        const isCore = node.cat === "core";

        return (
          <div
            key={node.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 blueprint-node flex flex-col items-center justify-center text-center"
            style={{
              left: pos.x,
              top: pos.y,
              borderColor: meta.color,
              boxShadow: `0 0 10px ${meta.color}33 inset, 0 0 5px ${meta.color}33`,
            }}
          >
            <div className="text-[9px] text-cyan-500/50 uppercase tracking-wider mb-1 w-full flex justify-between px-1">
              <span>{Math.round(pos.x)},{Math.round(pos.y)}</span>
              <span>{node.id.split('-')[0]}</span>
            </div>
            <div className={`px-3 py-1.5 border border-cyan-800/50 bg-[#040f16]/90 backdrop-blur-sm whitespace-nowrap ${isCore ? 'font-bold border-cyan-400/80 text-cyan-300' : 'text-cyan-100'}`}>
              <span className="text-xs uppercase tracking-widest">{node.label}</span>
            </div>
            <div className="absolute -left-1 -top-1 w-2 h-2 border-t border-l border-cyan-500/50"></div>
            <div className="absolute -right-1 -top-1 w-2 h-2 border-t border-r border-cyan-500/50"></div>
            <div className="absolute -left-1 -bottom-1 w-2 h-2 border-b border-l border-cyan-500/50"></div>
            <div className="absolute -right-1 -bottom-1 w-2 h-2 border-b border-r border-cyan-500/50"></div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="absolute bottom-6 left-6 border border-cyan-800/60 bg-[#040f16]/90 p-4 backdrop-blur-md">
        <div className="text-xs text-cyan-500 uppercase tracking-widest mb-3 border-b border-cyan-900/50 pb-2">
          Schematic Legend
        </div>
        <div className="space-y-2">
          {(Object.entries(CAT_META) as [keyof typeof CAT_META, typeof CAT_META[keyof typeof CAT_META]][]).map(([cat, meta]) => (
            <div key={cat} className="flex items-center gap-3">
              <div 
                className="w-3 h-3 border"
                style={{ borderColor: meta.color, backgroundColor: `${meta.color}22` }}
              ></div>
              <span className="text-[10px] uppercase text-cyan-200 tracking-wider">{meta.labelNl}</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Edge legend */}
      <div className="absolute bottom-6 right-6 border border-cyan-800/60 bg-[#040f16]/90 p-4 backdrop-blur-md text-right">
        <div className="text-xs text-cyan-500 uppercase tracking-widest mb-3 border-b border-cyan-900/50 pb-2">
          Connections
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-end gap-3">
            <span className="text-[10px] uppercase text-cyan-200 tracking-wider">Flow</span>
            <svg width="30" height="4"><line x1="0" y1="2" x2="30" y2="2" stroke="rgba(0, 255, 255, 0.8)" strokeWidth="2" /></svg>
          </div>
          <div className="flex items-center justify-end gap-3">
            <span className="text-[10px] uppercase text-cyan-200 tracking-wider">Routing</span>
            <svg width="30" height="4"><line x1="0" y1="2" x2="30" y2="2" stroke="rgba(0, 255, 255, 0.5)" strokeWidth="1.5" strokeDasharray="4 2" /></svg>
          </div>
          <div className="flex items-center justify-end gap-3">
            <span className="text-[10px] uppercase text-cyan-200 tracking-wider">Reference</span>
            <svg width="30" height="4"><line x1="0" y1="2" x2="30" y2="2" stroke="rgba(0, 200, 255, 0.3)" strokeWidth="1" strokeDasharray="2 4" /></svg>
          </div>
          <div className="flex items-center justify-end gap-3">
            <span className="text-[10px] uppercase text-cyan-200 tracking-wider">Mention</span>
            <svg width="30" height="4"><line x1="0" y1="2" x2="30" y2="2" stroke="rgba(0, 150, 255, 0.15)" strokeWidth="1" strokeDasharray="1 6" /></svg>
          </div>
        </div>
      </div>
      
      {/* Title */}
      <div className="absolute top-6 left-6">
        <div className="text-xl text-cyan-300 font-bold uppercase tracking-[0.3em]">Saerens.System</div>
        <div className="text-[10px] text-cyan-600 uppercase tracking-widest mt-1">REV 4.0 // SCHEMATIC OVERVIEW</div>
      </div>
    </div>
  );
}
