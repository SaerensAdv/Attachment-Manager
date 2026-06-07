import React, { useMemo } from "react";
import { NODES, EDGES, CAT_META, organicLayout, degreeOf } from "./_data";

export function RefinedNewsroom() {
  const width = 1280;
  const height = 900;
  
  // Get positions using organic layout
  const positions = useMemo(() => organicLayout(width, height), [width, height]);

  // Edges
  const edgeElements = EDGES.map((edge, i) => {
    const sourcePos = positions[edge.source];
    const targetPos = positions[edge.target];
    if (!sourcePos || !targetPos) return null;

    let stroke = "#1c1917"; // ink
    let strokeWidth = 1;
    let strokeDasharray = "none";
    let opacity = 1;

    switch (edge.kind) {
      case "flow":
        stroke = "#3730a3"; // deep indigo
        strokeWidth = 2;
        break;
      case "routing":
        stroke = "#1c1917";
        strokeWidth = 1.5;
        break;
      case "reference":
        stroke = "#57534e";
        strokeWidth = 1;
        strokeDasharray = "4 4";
        opacity = 0.6;
        break;
      case "mention":
        stroke = "#a8a29e";
        strokeWidth = 0.5;
        strokeDasharray = "2 4";
        opacity = 0.3;
        break;
    }

    return (
      <line
        key={`edge-${i}`}
        x1={sourcePos.x}
        y1={sourcePos.y}
        x2={targetPos.x}
        y2={targetPos.y}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
        opacity={opacity}
        vectorEffect="non-scaling-stroke"
      />
    );
  });

  // Nodes
  const nodeElements = NODES.map((node) => {
    const pos = positions[node.id];
    if (!pos) return null;

    const degree = degreeOf(node.id);
    const isHub = degree >= 5 || node.id === "a-orch";
    const r = isHub ? 12 : 6;
    const catColor = CAT_META[node.cat].color;
    
    // For hub nodes, give them a more prominent style
    return (
      <g key={node.id} transform={`translate(${pos.x}, ${pos.y})`}>
        {isHub && (
          <circle r={r + 8} fill="none" stroke={catColor} strokeWidth={1} opacity={0.3} />
        )}
        <circle
          r={r}
          fill="#fdfbf7"
          stroke={catColor}
          strokeWidth={isHub ? 3 : 2}
        />
        <text
          y={isHub ? r + 18 : r + 12}
          textAnchor="middle"
          fill="#1c1917"
          style={{
            fontFamily: isHub ? "'Playfair Display', serif" : "'Space Mono', monospace",
            fontSize: isHub ? "16px" : "10px",
            fontWeight: isHub ? 700 : 400,
            letterSpacing: isHub ? "0" : "-0.02em",
          }}
        >
          {node.label}
        </text>
        {!isHub && (
          <text
            y={r + 24}
            textAnchor="middle"
            fill="#78716c"
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: "8px",
              textTransform: "uppercase",
            }}
          >
            {CAT_META[node.cat].labelNl}
          </text>
        )}
      </g>
    );
  });

  return (
    <div className="min-h-screen w-full bg-[#fdfbf7] text-[#1c1917] flex flex-col items-center justify-center p-8 relative overflow-hidden" style={{ fontFamily: "'Playfair Display', serif" }}>
      {/* Background noise texture */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')" }}></div>
      
      {/* Header */}
      <div className="absolute top-8 left-8 z-10 flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tight text-[#1c1917] uppercase">SAERENS</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm tracking-widest text-[#57534e]" style={{ fontFamily: "'Space Mono', monospace" }}>SYSTEMEN KAART</span>
          <div className="w-12 h-px bg-[#3730a3]"></div>
          <span className="text-xs text-[#3730a3] font-semibold" style={{ fontFamily: "'Space Mono', monospace" }}>EDITIE 01</span>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-8 right-8 z-10 bg-[#fdfbf7]/80 backdrop-blur-sm p-4 border border-[#e7e5e4] shadow-sm">
        <h3 className="text-sm font-bold mb-3 uppercase tracking-wider border-b border-[#e7e5e4] pb-2" style={{ fontFamily: "'Space Mono', monospace" }}>Legende</h3>
        <div className="flex flex-col gap-2" style={{ fontFamily: "'Space Mono', monospace" }}>
          {Object.entries(CAT_META).map(([key, meta]) => (
            <div key={key} className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full border-2 bg-[#fdfbf7]" style={{ borderColor: meta.color }}></div>
              <span className="text-xs uppercase text-[#57534e]">{meta.labelNl}</span>
            </div>
          ))}
          
          <div className="mt-2 pt-2 border-t border-[#e7e5e4] flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="w-3 h-0.5 bg-[#3730a3]"></div>
              <span className="text-xs text-[#57534e]">Flow</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-px bg-[#1c1917]"></div>
              <span className="text-xs text-[#57534e]">Routing</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-px bg-[#57534e] border-dashed" style={{ borderTopWidth: '1px', borderTopStyle: 'dashed' }}></div>
              <span className="text-xs text-[#57534e]">Referentie</span>
            </div>
          </div>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="w-full max-w-7xl aspect-[1280/900] mx-auto relative z-0">
        <svg 
          viewBox={`0 0 ${width} ${height}`} 
          className="w-full h-full drop-shadow-sm"
          preserveAspectRatio="xMidYMid meet"
        >
          <g>
            {edgeElements}
          </g>
          <g>
            {nodeElements}
          </g>
        </svg>
      </div>
    </div>
  );
}
