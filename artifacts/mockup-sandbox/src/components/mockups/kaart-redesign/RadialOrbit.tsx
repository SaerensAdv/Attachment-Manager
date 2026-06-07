import React, { useEffect, useRef, useState } from "react";
import {
  NODES,
  EDGES,
  CAT_META,
  LAYER_ORDER,
  radialLayout,
  degreeOf,
  MapNode,
} from "./_data";
import "./RadialOrbit.css";

export function RadialOrbit() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 1280, height: 900 });

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener("resize", updateSize);
    updateSize();
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const layout = radialLayout(dimensions.width, dimensions.height);
  const cx = dimensions.width / 2;
  const cy = dimensions.height / 2;
  const maxR = Math.min(dimensions.width, dimensions.height) / 2 - 60;

  // Calculate rings
  const rings = LAYER_ORDER.map((_, r) => {
    return (r / (LAYER_ORDER.length - 1)) * maxR;
  }).filter((r) => r > 0);

  return (
    <div
      ref={containerRef}
      className="radial-orbit-container relative min-h-screen w-full bg-[#0a0a14] overflow-hidden flex items-center justify-center font-['Inter'] text-slate-300"
    >
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-transparent to-transparent" />
      </div>

      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 0 }}
      >
        <defs>
          {Object.entries(CAT_META).map(([cat, meta]) => (
            <radialGradient key={`glow-${cat}`} id={`glow-${cat}`}>
              <stop offset="0%" stopColor={meta.color} stopOpacity="0.8" />
              <stop offset="100%" stopColor={meta.color} stopOpacity="0" />
            </radialGradient>
          ))}
          <filter id="blur">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>

        {/* Orbit Rings */}
        {rings.map((r, i) => (
          <circle
            key={`ring-${i}`}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="1"
            strokeDasharray="4 6"
          />
        ))}

        {/* Edges */}
        {EDGES.map((edge, i) => {
          const s = layout[edge.source];
          const t = layout[edge.target];
          if (!s || !t) return null;

          let stroke = "rgba(255, 255, 255, 0.15)";
          let strokeWidth = 1;
          let strokeDasharray = "none";
          let opacity = 0.5;

          if (edge.kind === "routing") {
            stroke = CAT_META["agent"].color;
            opacity = 0.6;
            strokeWidth = 1.5;
            strokeDasharray = "2 4";
          } else if (edge.kind === "flow") {
            stroke = CAT_META["core"].color;
            opacity = 0.8;
            strokeWidth = 2;
          } else if (edge.kind === "reference") {
            stroke = "rgba(255,255,255,0.2)";
            strokeDasharray = "3 3";
          } else if (edge.kind === "mention") {
            stroke = "rgba(255,255,255,0.05)";
            opacity = 0.3;
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
              strokeDasharray={strokeDasharray}
              opacity={opacity}
            />
          );
        })}
      </svg>

      {/* Nodes */}
      {NODES.map((node) => {
        const pos = layout[node.id];
        if (!pos) return null;
        const color = CAT_META[node.cat].color;
        const deg = degreeOf(node.id);
        const size = Math.max(12, Math.min(32, 12 + deg * 2));

        return (
          <div
            key={node.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center group"
            style={{ left: pos.x, top: pos.y, zIndex: 10 }}
          >
            <div
              className="relative rounded-full flex items-center justify-center transition-transform duration-500 hover:scale-125 cursor-default"
              style={{
                width: size,
                height: size,
                backgroundColor: color,
                boxShadow: `0 0 ${size}px ${color}`,
              }}
            >
              {/* Inner core for larger nodes */}
              {deg > 4 && (
                <div className="absolute inset-1 bg-white/30 rounded-full" />
              )}
            </div>

            <div
              className="absolute top-full mt-2 whitespace-nowrap text-xs font-medium tracking-wide bg-[#0a0a14]/80 backdrop-blur px-2 py-0.5 rounded border border-white/10 opacity-70 group-hover:opacity-100 transition-opacity"
              style={{
                fontFamily: "Space Mono",
                color: color,
              }}
            >
              {node.label}
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="absolute bottom-8 right-8 bg-black/40 backdrop-blur-md border border-white/10 p-5 rounded-xl text-sm font-['Space_Mono'] shadow-2xl z-20">
        <h3 className="text-white/80 font-bold mb-4 uppercase tracking-widest text-xs">
          Systeemkaart
        </h3>
        <div className="flex flex-col gap-3">
          {LAYER_ORDER.map((cat) => {
            const meta = CAT_META[cat];
            return (
              <div key={cat} className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: meta.color,
                    boxShadow: `0 0 8px ${meta.color}`,
                  }}
                />
                <span className="text-slate-300">{meta.labelNl}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
