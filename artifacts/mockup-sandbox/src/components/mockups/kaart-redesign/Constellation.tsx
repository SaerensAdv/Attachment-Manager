import React, { useMemo } from "react";
import { NODES, EDGES, CAT_META, organicLayout, degreeOf, LAYER_ORDER } from "./_data";

export function Constellation() {
  const width = 1280;
  const height = 900;

  const layout = useMemo(() => organicLayout(width, height), []);

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden text-slate-200 select-none bg-[#030712]"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Background glow & stars effect via SVG */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0 w-full h-full pointer-events-none"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1e293b" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#030712" stopOpacity="0" />
          </radialGradient>
          {Object.entries(CAT_META).map(([cat, meta]) => (
            <radialGradient key={cat} id={`glow-${cat}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={meta.color} stopOpacity="1" />
              <stop offset="20%" stopColor={meta.color} stopOpacity="0.8" />
              <stop offset="100%" stopColor={meta.color} stopOpacity="0" />
            </radialGradient>
          ))}
          {Object.entries(CAT_META).map(([cat, meta]) => (
            <filter key={`blur-${cat}`} id={`blur-${cat}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          ))}
        </defs>

        <rect width="100%" height="100%" fill="#030712" />
        <circle cx={width / 2} cy={height / 2} r={Math.min(width, height) * 0.6} fill="url(#core-glow)" />

        {/* Draw Edges */}
        {EDGES.map((edge, i) => {
          const s = layout[edge.source];
          const t = layout[edge.target];
          if (!s || !t) return null;

          let stroke = "rgba(255, 255, 255, 0.1)";
          let strokeWidth = 1;
          let dash = "";

          switch (edge.kind) {
            case "flow":
              stroke = "rgba(255, 255, 255, 0.25)";
              strokeWidth = 1.5;
              break;
            case "routing":
              stroke = "rgba(148, 163, 184, 0.2)";
              strokeWidth = 1;
              dash = "4 4";
              break;
            case "reference":
              stroke = "rgba(148, 163, 184, 0.1)";
              strokeWidth = 0.75;
              dash = "2 4";
              break;
            case "mention":
              stroke = "rgba(255, 255, 255, 0.03)";
              strokeWidth = 0.5;
              dash = "1 6";
              break;
          }

          return (
            <line
              key={`edge-${i}`}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeDasharray={dash}
              className="transition-all duration-1000 ease-in-out"
            />
          );
        })}

        {/* Draw Nodes */}
        {NODES.map((node) => {
          const pos = layout[node.id];
          if (!pos) return null;
          
          const d = degreeOf(node.id);
          const rBase = 2 + Math.sqrt(d) * 1.5;
          const meta = CAT_META[node.cat];

          return (
            <g key={node.id} className="transition-all duration-1000 ease-in-out">
              {/* Outer Glow */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={rBase * 4}
                fill={`url(#glow-${node.cat})`}
                opacity={0.4}
              />
              {/* Core Star */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={rBase}
                fill="#ffffff"
                filter={`url(#blur-${node.cat})`}
              />
              {/* Label */}
              <text
                x={pos.x + rBase + 8}
                y={pos.y + 4}
                fill="#cbd5e1"
                fontSize={11}
                letterSpacing={0.5}
                style={{ fontFamily: "'Space Mono', monospace" }}
                className="pointer-events-none drop-shadow-md"
              >
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend overlay */}
      <div className="absolute bottom-8 left-8 p-6 bg-[#0f172a]/60 backdrop-blur-md border border-white/5 rounded-2xl">
        <h2 
          className="text-sm tracking-widest text-slate-400 mb-6 uppercase"
          style={{ fontFamily: "'Space Mono', monospace" }}
        >
          Constellatie
        </h2>
        <div className="flex flex-col gap-4">
          {LAYER_ORDER.map((cat) => {
            const meta = CAT_META[cat];
            return (
              <div key={cat} className="flex items-center gap-3">
                <div 
                  className="w-2.5 h-2.5 rounded-full" 
                  style={{ 
                    backgroundColor: "#fff", 
                    boxShadow: `0 0 8px 2px ${meta.color}` 
                  }} 
                />
                <span className="text-xs text-slate-300 font-medium tracking-wide">
                  {meta.labelNl}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Title */}
      <div className="absolute top-8 left-8">
        <h1 
          className="text-3xl font-bold text-white/90 drop-shadow-lg tracking-wide"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          Saerens AI
        </h1>
        <p className="text-slate-400 text-sm mt-2 tracking-widest" style={{ fontFamily: "'Space Mono', monospace" }}>
          SYSTEM MAP 1.0
        </p>
      </div>
    </div>
  );
}
