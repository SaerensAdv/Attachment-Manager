import React, { useMemo, useEffect, useState, useRef } from "react";
import { NODES, EDGES, CAT_META, organicLayout, degreeOf, LAYER_ORDER, EdgeKind } from "./_data";
import "./GlassDepth.css";

const EDGE_STYLES: Record<EdgeKind, { stroke: string; strokeWidth: number; dash?: string; opacity: number }> = {
  routing: { stroke: "#818cf8", strokeWidth: 2, opacity: 0.9 },
  flow: { stroke: "#38bdf8", strokeWidth: 2.5, opacity: 0.7 },
  reference: { stroke: "#94a3b8", strokeWidth: 1.5, dash: "4 4", opacity: 0.4 },
  mention: { stroke: "#475569", strokeWidth: 1, opacity: 0.2 },
};

export function GlassDepth() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1280, h: 900 });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(() => organicLayout(size.w, size.h), [size.w, size.h]);

  return (
    <div
      ref={containerRef}
      className="relative min-h-screen w-full overflow-hidden bg-[#06060f] font-['Inter'] text-slate-200"
    >
      {/* Background gradients and noise */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0f1123] via-[#090914] to-[#120d26]" />
      <div className="absolute inset-0 glass-depth-noise" />
      
      {/* Decorative ambient background glows */}
      <div className="absolute top-1/3 left-1/4 w-[800px] h-[800px] bg-indigo-500/10 rounded-full blur-[140px] pointer-events-none mix-blend-screen" />
      <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-sky-500/10 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />
      
      {/* Edges Layer */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
        <defs>
          <marker id="arrowhead-routing" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <polygon points="0 0, 8 4, 0 8" fill="#818cf8" opacity={0.9} />
          </marker>
          <marker id="arrowhead-flow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <polygon points="0 0, 8 4, 0 8" fill="#38bdf8" opacity={0.7} />
          </marker>
          <marker id="arrowhead-reference" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <polygon points="0 0, 6 3, 0 6" fill="#94a3b8" opacity={0.4} />
          </marker>
        </defs>
        {EDGES.map((edge, i) => {
          const s = layout[edge.source];
          const t = layout[edge.target];
          if (!s || !t) return null;
          const style = EDGE_STYLES[edge.kind];
          
          const dx = t.x - s.x;
          const dy = t.y - s.y;
          // Calculate curved path for non-direct flows
          const pathData = edge.kind === 'flow' || edge.kind === 'mention'
            ? `M ${s.x},${s.y} L ${t.x},${t.y}`
            : `M ${s.x},${s.y} Q ${s.x + dx/2 - dy * 0.15} ${s.y + dy/2 + dx * 0.15} ${t.x},${t.y}`;

          return (
            <path
              key={i}
              d={pathData}
              fill="none"
              stroke={style.stroke}
              strokeWidth={style.strokeWidth}
              strokeDasharray={style.dash}
              opacity={style.opacity}
              markerEnd={edge.kind !== 'mention' ? `url(#arrowhead-${edge.kind})` : undefined}
              className="transition-all duration-700 ease-in-out"
            />
          );
        })}
      </svg>

      {/* Nodes Layer */}
      {NODES.map((node) => {
        const pos = layout[node.id];
        if (!pos) return null;
        const deg = degreeOf(node.id);
        const meta = CAT_META[node.cat];
        const isHub = deg > 4;

        return (
          <div
            key={node.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center transition-all duration-700 ease-in-out z-10"
            style={{ left: pos.x, top: pos.y }}
          >
            <div 
              className={`
                relative group flex items-center justify-center 
                px-5 py-3 rounded-2xl
                bg-white/[0.04] backdrop-blur-xl
                border border-white/[0.08]
                shadow-[0_8px_32px_0_rgba(0,0,0,0.4)]
                transition-all duration-300 hover:bg-white/[0.08] hover:border-white/[0.2] hover:scale-[1.03] hover:shadow-[0_12px_40px_0_rgba(0,0,0,0.6)]
                cursor-default
                ${isHub ? 'ring-1 ring-indigo-400/40 shadow-[0_0_50px_rgba(99,102,241,0.25)]' : ''}
              `}
            >
              {/* Soft inner top reflection */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.12] to-transparent pointer-events-none opacity-50" />
              
              {/* Category indicator dot */}
              <div 
                className="w-2.5 h-2.5 rounded-full mr-3 shadow-lg flex-shrink-0"
                style={{ 
                  backgroundColor: meta.color,
                  boxShadow: `0 0 12px ${meta.color}, 0 0 24px ${meta.color}60`
                }}
              />
              <span className={`font-medium tracking-wide ${isHub ? 'text-sm font-semibold text-white' : 'text-xs text-slate-100'} whitespace-nowrap`}>
                {node.label}
              </span>
            </div>
            {/* Category label for hubs */}
            {isHub && (
              <span className="mt-2.5 text-[10px] uppercase tracking-widest text-indigo-200/70 font-['Space_Mono'] drop-shadow-md">
                {meta.labelNl}
              </span>
            )}
          </div>
        );
      })}

      {/* Legend */}
      <div className="absolute bottom-10 left-10 p-7 rounded-[24px] bg-white/[0.02] backdrop-blur-xl border border-white/[0.05] shadow-2xl z-20">
        <div className="absolute inset-0 rounded-[24px] bg-gradient-to-b from-white/[0.05] to-transparent pointer-events-none" />
        <h3 className="text-xs font-['Space_Mono'] uppercase tracking-[0.2em] text-slate-400 mb-5 relative">
          Systeem
        </h3>
        <div className="flex flex-col gap-3.5 relative">
          {LAYER_ORDER.map(cat => {
            const m = CAT_META[cat];
            return (
              <div key={cat} className="flex items-center gap-4">
                <div 
                  className="w-2.5 h-2.5 rounded-full" 
                  style={{ 
                    backgroundColor: m.color,
                    boxShadow: `0 0 10px ${m.color}80`
                  }} 
                />
                <span className="text-[13px] font-medium tracking-wide text-slate-300">{m.labelNl}</span>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Concept Header */}
      <div className="absolute top-10 left-10 z-20">
         <h1 className="text-3xl font-['Playfair_Display'] font-medium text-white tracking-wide drop-shadow-lg mb-2">
            Saerens Kaart
         </h1>
         <p className="text-sm font-['Space_Mono'] text-indigo-300/80 uppercase tracking-widest">
            Glass Depth / AI Systeem
         </p>
      </div>
    </div>
  );
}
