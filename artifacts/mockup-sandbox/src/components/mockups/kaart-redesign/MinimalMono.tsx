import React, { useMemo, useState, useEffect } from "react";
import { NODES, EDGES, CAT_META, organicLayout, degreeOf, LAYER_ORDER } from "./_data";

export function MinimalMono() {
  const [dimensions, setDimensions] = useState({ width: 1280, height: 900 });

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth || 1280,
        height: window.innerHeight || 900,
      });
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const layout = useMemo(
    () => organicLayout(dimensions.width, dimensions.height),
    [dimensions]
  );

  // Swiss Minimal Mono concept
  const ACCENT = "#3d737f"; // Soothing cyan/teal accent
  const INK = "#1a1a19";
  const BG = "#fcfbf9";

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden"
      style={{
        backgroundColor: BG,
        color: INK,
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* Subtle grid background for precision feel */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(#1a1a19 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Header */}
      <div className="absolute top-8 left-8 z-10">
        <h1
          className="text-sm uppercase tracking-[0.2em] font-medium"
          style={{ fontFamily: "'Space Mono', monospace" }}
        >
          Systeemkaart
        </h1>
        <p className="text-[10px] text-[#1a1a19]/50 mt-1 uppercase tracking-widest">
          Saerens.Agency
        </p>
      </div>

      {/* Legend */}
      <div className="absolute bottom-8 left-8 p-6 bg-[#fcfbf9]/90 backdrop-blur-sm border border-[#1a1a19]/10 flex flex-col gap-3 z-10">
        <h3
          className="text-xs uppercase tracking-[0.2em] font-medium text-[#1a1a19]/60 mb-2"
          style={{ fontFamily: "'Space Mono', monospace" }}
        >
          Legende
        </h3>
        {LAYER_ORDER.map((cat) => (
          <div key={cat} className="flex items-center gap-4">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: cat === "core" ? ACCENT : INK }}
            />
            <span className="text-[10px] tracking-[0.15em] uppercase">
              {CAT_META[cat].labelNl}
            </span>
          </div>
        ))}
      </div>

      {/* Graph */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {/* Edges */}
        {EDGES.map((edge, i) => {
          const source = layout[edge.source];
          const target = layout[edge.target];
          if (!source || !target) return null;

          let strokeOpacity = 0.15;
          let strokeWidth = 0.5;
          let strokeDasharray = "none";

          if (edge.kind === "routing") {
            strokeOpacity = 0.2;
            strokeWidth = 0.5;
          } else if (edge.kind === "flow") {
            strokeOpacity = 0.35;
            strokeWidth = 1;
          } else if (edge.kind === "reference") {
            strokeOpacity = 0.15;
            strokeWidth = 0.5;
            strokeDasharray = "3 4";
          } else if (edge.kind === "mention") {
            strokeOpacity = 0.05;
            strokeWidth = 0.5;
            strokeDasharray = "1 6";
          }

          return (
            <line
              key={`edge-${i}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke={INK}
              strokeWidth={strokeWidth}
              strokeOpacity={strokeOpacity}
              strokeDasharray={strokeDasharray}
            />
          );
        })}

        {/* Nodes */}
        {NODES.map((node) => {
          const pos = layout[node.id];
          if (!pos) return null;

          const isCore = node.cat === "core";
          const deg = degreeOf(node.id);
          const r = isCore ? 3.5 : deg > 5 ? 2.5 : 1.5;
          const color = isCore ? ACCENT : INK;

          return (
            <g key={`node-${node.id}`} transform={`translate(${pos.x}, ${pos.y})`}>
              {/* Outer ring for high degree nodes to show importance without clutter */}
              {deg > 3 && !isCore && (
                <circle
                  r={r + 3.5}
                  fill="none"
                  stroke={color}
                  strokeOpacity={0.2}
                  strokeWidth={0.5}
                />
              )}

              <circle
                r={r}
                fill={color}
                stroke={isCore ? "none" : BG}
                strokeWidth={isCore ? 0 : 1}
              />

              {/* Text outline for legibility over lines */}
              <text
                x={isCore ? 8 : 6}
                y={isCore ? 4 : 3}
                fill={BG}
                stroke={BG}
                strokeWidth={3}
                strokeLinejoin="round"
                fontSize={isCore ? "10px" : "9px"}
                fontFamily={
                  isCore ? "'Space Mono', monospace" : "Inter, sans-serif"
                }
                fontWeight={isCore ? 600 : 400}
                letterSpacing="0.06em"
                className="uppercase"
              >
                {node.label}
              </text>

              {/* Text content */}
              <text
                x={isCore ? 8 : 6}
                y={isCore ? 4 : 3}
                fill={color}
                fontSize={isCore ? "10px" : "9px"}
                fontFamily={
                  isCore ? "'Space Mono', monospace" : "Inter, sans-serif"
                }
                fontWeight={isCore ? 600 : 400}
                letterSpacing="0.06em"
                className="uppercase"
                style={{ pointerEvents: "auto", userSelect: "none" }}
              >
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
