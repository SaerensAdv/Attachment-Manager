import React, { useMemo, useState, useEffect } from "react";
import { NODES, EDGES, CAT_META, LAYER_ORDER, Cat, XY } from "./_data";

export function Swimlanes() {
  const [size, setSize] = useState({ width: 1280, height: 900 });

  useEffect(() => {
    const handleResize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const { width, height } = size;

  // Calculate layout
  const layout = useMemo(() => {
    const pos: Record<string, XY> = {};
    const laneHeight = height / LAYER_ORDER.length;
    const lanePadY = laneHeight * 0.5;
    
    // We want the nodes in each lane to be spread horizontally
    // To give it a "left-to-right" feel as requested, we could stagger them,
    // but just spreading them evenly is fine.
    
    LAYER_ORDER.forEach((cat, r) => {
      const list = NODES.filter((n) => n.cat === cat);
      // Leave space on the left for the lane label
      const startX = 250;
      const endX = width - 50;
      const colW = list.length > 1 ? (endX - startX) / (list.length - 1) : 0;
      
      list.forEach((n, i) => {
        pos[n.id] = {
          x: list.length === 1 ? startX + (endX - startX) / 2 : startX + colW * i,
          y: r * laneHeight + lanePadY,
        };
      });
    });

    return pos;
  }, [width, height]);

  // Edges
  // For a pipeline look, we can draw stepped edges (orthogonal)
  const renderEdge = (e: typeof EDGES[0]) => {
    const s = layout[e.source];
    const t = layout[e.target];
    if (!s || !t) return null;

    let stroke = "var(--edge-color, #94a3b8)";
    let strokeWidth = 1.5;
    let strokeDasharray = "none";
    let opacity = 0.6;

    if (e.kind === "routing") {
      stroke = "#3b82f6"; // blue
      strokeWidth = 2;
      opacity = 0.8;
    } else if (e.kind === "flow") {
      stroke = "#10b981"; // green
      strokeWidth = 2.5;
      opacity = 0.9;
    } else if (e.kind === "reference") {
      stroke = "#f59e0b"; // amber
      strokeWidth = 1.5;
      strokeDasharray = "4 4";
    } else if (e.kind === "mention") {
      stroke = "#94a3b8"; // slate
      strokeWidth = 1;
      strokeDasharray = "2 4";
      opacity = 0.3;
    }

    // Step routing: go down halfway, then horizontal, then down
    const midY = (s.y + t.y) / 2;
    const path = `M ${s.x} ${s.y} L ${s.x} ${midY} L ${t.x} ${midY} L ${t.x} ${t.y}`;

    return (
      <path
        key={`${e.source}-${e.target}-${e.kind}`}
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
        opacity={opacity}
        className="transition-all duration-300 ease-in-out"
      />
    );
  };

  return (
    <div 
      className="min-h-screen w-full relative overflow-hidden bg-slate-50 text-slate-900"
      style={{ fontFamily: "'Space Mono', monospace" }}
    >
      {/* Background grid lines for industrial feel */}
      <div 
        className="absolute inset-0 pointer-events-none" 
        style={{
          backgroundImage: 'linear-gradient(#cbd5e1 1px, transparent 1px), linear-gradient(90deg, #cbd5e1 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          opacity: 0.2
        }}
      />

      {/* Swimlane backgrounds and labels */}
      {LAYER_ORDER.map((cat, i) => {
        const meta = CAT_META[cat];
        const laneHeight = height / LAYER_ORDER.length;
        const top = i * laneHeight;
        
        return (
          <div 
            key={cat}
            className="absolute left-0 w-full border-t border-slate-300/50 pointer-events-none flex items-center"
            style={{ 
              top, 
              height: laneHeight,
              backgroundColor: i % 2 === 0 ? 'rgba(241, 245, 249, 0.5)' : 'transparent'
            }}
          >
            <div className="pl-8 flex items-center space-x-4 w-[220px]">
              <div 
                className="w-3 h-3 rounded-full shadow-sm"
                style={{ backgroundColor: meta.color }}
              />
              <div className="font-bold tracking-widest text-xs uppercase text-slate-500">
                {meta.labelNl}
              </div>
            </div>
          </div>
        );
      })}

      {/* Edges */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {EDGES.map(renderEdge)}
      </svg>

      {/* Nodes */}
      {NODES.map((n) => {
        const pos = layout[n.id];
        const meta = CAT_META[n.cat];
        if (!pos) return null;

        return (
          <div
            key={n.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center group"
            style={{ left: pos.x, top: pos.y }}
          >
            <div 
              className="bg-white border-2 px-4 py-2 text-xs font-semibold shadow-sm transition-transform duration-200 group-hover:scale-105 group-hover:shadow-md whitespace-nowrap z-10"
              style={{ borderColor: meta.color, color: meta.color }}
            >
              {n.label}
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="absolute bottom-8 right-8 bg-white/90 backdrop-blur border border-slate-200 p-4 shadow-lg text-xs z-20">
        <div className="font-bold mb-3 uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-2">
          Systeemkaart
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {LAYER_ORDER.map((cat) => {
            const meta = CAT_META[cat];
            return (
              <div key={cat} className="flex items-center space-x-2">
                <div 
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: meta.color }}
                />
                <span className="text-slate-600">{meta.labelNl}</span>
              </div>
            );
          })}
        </div>
        
        <div className="mt-4 pt-3 border-t border-slate-200 grid gap-2">
           <div className="flex items-center space-x-2">
              <div className="w-4 h-[2.5px] bg-[#10b981]" />
              <span className="text-slate-500">Flow</span>
           </div>
           <div className="flex items-center space-x-2">
              <div className="w-4 h-[2px] bg-[#3b82f6]" />
              <span className="text-slate-500">Routing</span>
           </div>
           <div className="flex items-center space-x-2">
              <div className="w-4 h-[1.5px] bg-[#f59e0b] border-dashed border-b-2" style={{ borderBottomStyle: 'dashed' }}/>
              <span className="text-slate-500">Referentie</span>
           </div>
        </div>
      </div>
    </div>
  );
}
