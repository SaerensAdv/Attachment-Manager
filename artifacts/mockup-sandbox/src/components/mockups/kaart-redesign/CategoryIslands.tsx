import React, { useMemo, useState, useEffect } from "react";
import { NODES, EDGES, CAT_META, organicLayout, Cat, MapNode } from "./_data";

// Simple bounding box with padding
function getCategoryBounds(nodes: MapNode[], positions: Record<string, { x: number; y: number }>, padding = 60) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let count = 0;
  for (const n of nodes) {
    const p = positions[n.id];
    if (!p) continue;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    count++;
  }
  if (count === 0) return null;
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2
  };
}

export function CategoryIslands() {
  const [size, setSize] = useState({ w: 1280, h: 900 });

  useEffect(() => {
    const handleResize = () => {
      setSize({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const layout = useMemo(() => organicLayout(size.w, size.h), [size]);

  // Group nodes by category
  const nodesByCat = useMemo(() => {
    const map: Record<string, MapNode[]> = {};
    for (const n of NODES) {
      if (!map[n.cat]) map[n.cat] = [];
      map[n.cat].push(n);
    }
    return map;
  }, []);

  return (
    <div className="relative min-h-screen w-full bg-[#f8f5f0] overflow-hidden font-['Inter']">
      {/* Background texture/noise for a map feel */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "url('data:image/svg+xml;utf8,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')" }} />

      <svg width={size.w} height={size.h} className="absolute inset-0">
        <defs>
          <filter id="soft-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="30" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Draw Territories (Islands) */}
        {Object.entries(nodesByCat).map(([cat, nodes]) => {
          const bounds = getCategoryBounds(nodes, layout);
          if (!bounds) return null;
          const color = CAT_META[cat as Cat].color;
          return (
            <g key={`island-${cat}`}>
              <rect
                x={bounds.x}
                y={bounds.y}
                width={bounds.width}
                height={bounds.height}
                rx={bounds.width / 2}
                ry={bounds.height / 2}
                fill={color}
                opacity={0.08}
                filter="url(#soft-glow)"
              />
              {/* Territory Label */}
              <text
                x={bounds.cx}
                y={bounds.y - 10}
                textAnchor="middle"
                fill={color}
                opacity={0.6}
                className="font-['Playfair_Display'] text-2xl font-bold tracking-widest uppercase pointer-events-none"
              >
                {CAT_META[cat as Cat].labelNl}
              </text>
            </g>
          );
        })}

        {/* Draw Routes (Edges) */}
        {EDGES.map((e, i) => {
          const s = layout[e.source];
          const t = layout[e.target];
          if (!s || !t) return null;
          const isFlow = e.kind === "flow";
          const isRouting = e.kind === "routing";
          const isMention = e.kind === "mention";

          const strokeWidth = isFlow ? 3 : isRouting ? 2 : 1;
          const opacity = isMention ? 0.15 : isFlow ? 0.4 : 0.25;
          const strokeDasharray = e.kind === "reference" || e.kind === "mention" ? "4 4" : "none";

          return (
            <line
              key={`e-${i}`}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke="#2c2a26"
              strokeWidth={strokeWidth}
              strokeOpacity={opacity}
              strokeDasharray={strokeDasharray}
              strokeLinecap="round"
            />
          );
        })}

        {/* Draw Settlements (Nodes) */}
        {NODES.map((n) => {
          const pos = layout[n.id];
          if (!pos) return null;
          const color = CAT_META[n.cat].color;
          const isCoreOrOrch = n.cat === "core" || n.id === "a-orch";

          return (
            <g key={n.id} transform={`translate(${pos.x}, ${pos.y})`}>
              <circle
                r={isCoreOrOrch ? 8 : 5}
                fill={color}
                stroke="#f8f5f0"
                strokeWidth={2}
              />
              <text
                y={isCoreOrOrch ? 22 : 18}
                textAnchor="middle"
                className="text-[11px] font-medium pointer-events-none"
                fill="#4a4640"
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="absolute bottom-8 left-8 bg-white/80 backdrop-blur-md p-6 rounded-xl shadow-lg border border-[#e8e4db]">
        <h3 className="font-['Playfair_Display'] text-lg font-bold text-[#2c2a26] mb-4">Kaartlegende</h3>
        <div className="flex flex-col gap-3">
          {Object.entries(CAT_META).map(([cat, meta]) => (
            <div key={cat} className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: meta.color }} />
              <span className="text-sm font-medium text-[#4a4640]">{meta.labelNl}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
