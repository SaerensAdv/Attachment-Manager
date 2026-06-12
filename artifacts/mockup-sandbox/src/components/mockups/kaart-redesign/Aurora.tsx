import React, { useMemo, useEffect, useState, useRef } from "react";
import { Search, Send, ChevronRight, Menu, Zap, Globe, MessageSquare, Briefcase, Activity, CheckCircle, Database } from "lucide-react";
import { NODES, EDGES, CAT_META, organicLayout, degreeOf, LAYER_ORDER } from "./_data";
import "./Aurora.css";

const TABS = ["Kaart", "Dashboard", "Team", "Klanten", "Crawl", "Archief", "Planning", "Controle"];
const SERVICE_LINES = ["Overzicht", "Paid Media", "SEO & Web", "Content & Creative", "Client Growth"];

export function Aurora() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });

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

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    NODES.forEach(n => {
      counts[n.cat] = (counts[n.cat] || 0) + 1;
    });
    return counts;
  }, []);

  return (
    <div className="relative min-h-screen w-full overflow-hidden text-slate-200 font-['Inter'] flex flex-col bg-[#03050a] aurora-bg">
      {/* Texture / Noise */}
      <div className="absolute inset-0 aurora-noise z-0" />
      
      {/* Deep Background Glows */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] max-w-[1200px] max-h-[1200px] bg-cyan-900/10 rounded-full blur-[120px] glow-breathe mix-blend-screen pointer-events-none z-0" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[50vw] h-[50vw] max-w-[800px] max-h-[800px] bg-indigo-600/10 rounded-full blur-[100px] mix-blend-screen pointer-events-none z-0" />
      
      {/* Top Bar */}
      <header className="relative z-20 flex items-center justify-between px-6 py-4 glass-panel border-b-0 border-x-0 border-t-0 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-8">
          <div className="flex flex-col">
            <span className="font-['Playfair_Display'] text-xl font-medium tracking-wide text-white glow-text">Saerens AI</span>
            <span className="font-['Space_Mono'] text-[10px] uppercase tracking-[0.2em] text-cyan-400/70">Operations Atlas</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 ml-8">
            {TABS.map((tab, i) => (
              <button 
                key={tab} 
                className={`text-sm tracking-wide transition-colors ${
                  i === 0 
                    ? "text-cyan-400 font-medium drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" 
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="flex-1 flex relative z-10 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-72 flex-shrink-0 glass-panel border-y-0 border-l-0 border-r border-white/5 flex flex-col p-6 overflow-y-auto">
          <div className="relative mb-8">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              type="text" 
              placeholder="Documenten doorzoeken..." 
              className="w-full bg-white/5 border border-white/10 rounded-full py-2 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50 focus:bg-white/10 transition-all font-['Space_Mono']"
            />
          </div>

          <div className="mb-8">
            <h3 className="text-[11px] uppercase tracking-[0.15em] font-['Space_Mono'] text-slate-500 mb-4">Categorieën</h3>
            <ul className="space-y-3">
              {LAYER_ORDER.map(cat => {
                const meta = CAT_META[cat];
                const count = categoryCounts[cat] || 0;
                return (
                  <li key={cat} className="flex items-center justify-between group cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-2 h-2 rounded-full transition-all group-hover:scale-125"
                        style={{ 
                          backgroundColor: meta.color,
                          boxShadow: `0 0 8px ${meta.color}`
                        }}
                      />
                      <span className="text-sm text-slate-300 group-hover:text-white transition-colors">{meta.labelNl}</span>
                    </div>
                    <span className="text-xs font-['Space_Mono'] text-slate-600 group-hover:text-cyan-400/80 transition-colors">{count}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mb-auto">
            <h3 className="text-[11px] uppercase tracking-[0.15em] font-['Space_Mono'] text-slate-500 mb-4">Service-lijn</h3>
            <ul className="space-y-1">
              {SERVICE_LINES.map((line, i) => (
                <li key={line}>
                  <button className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                    i === 0 
                      ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20" 
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  }`}>
                    {line}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between bg-white/5 rounded-full p-1 relative overflow-hidden">
            <div className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] bg-cyan-500/20 border border-cyan-500/30 rounded-full shadow-[0_0_10px_rgba(34,211,238,0.2)]" />
            <button className="flex-1 relative z-10 text-xs font-medium py-1.5 text-cyan-300 text-center">Organisch</button>
            <button className="flex-1 relative z-10 text-xs font-medium py-1.5 text-slate-400 text-center">Gelaagd</button>
          </div>
        </aside>

        {/* Map Area */}
        <main ref={containerRef} className="flex-1 relative overflow-hidden">
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
            <defs>
              <linearGradient id="edge-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#818cf8" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#0f172a" stopOpacity="0.1" />
              </linearGradient>
            </defs>
            {EDGES.map((edge, i) => {
              const s = layout[edge.source];
              const t = layout[edge.target];
              if (!s || !t) return null;
              
              const dx = t.x - s.x;
              const dy = t.y - s.y;
              const dist = Math.sqrt(dx*dx + dy*dy);
              
              // Curve calculation for "woven" feel
              const curve = dist * 0.3;
              let pathData = "";
              
              if (edge.kind === "routing") {
                // Outward arcs from hub
                pathData = `M ${s.x},${s.y} Q ${s.x + dx/2 - dy*0.2} ${s.y + dy/2 + dx*0.2} ${t.x},${t.y}`;
              } else if (edge.kind === "flow") {
                // Smoother S-curves
                pathData = `M ${s.x},${s.y} C ${s.x + dx/3} ${s.y}, ${t.x - dx/3} ${t.y}, ${t.x},${t.y}`;
              } else {
                // Gentle bows for references
                pathData = `M ${s.x},${s.y} Q ${s.x + dx/2} ${s.y + dy/2 - curve*0.3} ${t.x},${t.y}`;
              }

              let strokeColor = "url(#edge-grad)";
              let opacity = 0.5;
              let strokeWidth = 1;
              let isAnimated = false;

              if (edge.kind === "flow") {
                strokeWidth = 2;
                opacity = 0.7;
                isAnimated = true;
              } else if (edge.kind === "routing") {
                strokeColor = "rgba(129, 140, 248, 0.4)";
                strokeWidth = 1.5;
              } else if (edge.kind === "mention") {
                strokeColor = "rgba(51, 65, 85, 0.3)";
                opacity = 0.2;
              }

              return (
                <path
                  key={`edge-${i}`}
                  d={pathData}
                  className={`edge-path ${isAnimated ? 'animated-flow' : ''}`}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  opacity={opacity}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>

          {/* Nodes */}
          {NODES.map((node) => {
            const pos = layout[node.id];
            if (!pos) return null;
            const deg = degreeOf(node.id);
            const meta = CAT_META[node.cat];
            
            // Orchestrator / Core gets special styling
            const isHub = node.id === "a-orch" || node.cat === "core";
            
            // Adjust radius based on degree
            const radius = isHub ? 32 : Math.max(12, Math.min(24, 10 + deg * 3));

            return (
              <div
                key={node.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center z-10 cursor-pointer group"
                style={{ left: pos.x, top: pos.y }}
              >
                <div 
                  className={`
                    relative rounded-full flex items-center justify-center
                    transition-transform duration-300 group-hover:scale-110
                    ${isHub ? 'hub-pulse backdrop-blur-md bg-cyan-500/10 border border-cyan-400/50' : 'bg-[#0a101d] border border-white/10'}
                  `}
                  style={{ 
                    width: radius * 2, 
                    height: radius * 2,
                    boxShadow: isHub ? `0 0 30px ${meta.color}60` : `0 0 15px ${meta.color}30`
                  }}
                >
                  <div 
                    className="rounded-full shadow-lg"
                    style={{ 
                      width: isHub ? radius : radius * 0.5,
                      height: isHub ? radius : radius * 0.5,
                      backgroundColor: meta.color,
                      boxShadow: `0 0 ${isHub ? 20 : 10}px ${meta.color}`
                    }}
                  />
                </div>
                <div className={`mt-2 px-2 py-1 rounded-md glass-panel ${isHub ? 'bg-cyan-900/40 border-cyan-500/30' : ''} transition-opacity duration-300`}>
                  <span className={`whitespace-nowrap ${isHub ? 'text-xs font-semibold text-cyan-50 drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]' : 'text-[10px] font-medium text-slate-300'}`}>
                    {node.label}
                  </span>
                </div>
              </div>
            );
          })}
        </main>
      </div>

      {/* Bottom Command Bar */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[800px] max-w-[90vw] z-30">
        <div className="glass-panel rounded-full p-2 flex items-center gap-3 shadow-[0_10px_40px_rgba(0,0,0,0.8)] border-white/10">
          <button className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/5 whitespace-nowrap">
            <Briefcase className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-medium text-slate-200">Kies klant</span>
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
          <input 
            type="text" 
            placeholder="Beschrijf de opdracht en druk op Enter..." 
            className="flex-1 bg-transparent border-none text-white placeholder:text-slate-500 focus:outline-none px-2 text-sm"
          />
          <button className="w-10 h-10 rounded-full bg-cyan-500 hover:bg-cyan-400 flex items-center justify-center transition-colors shadow-[0_0_15px_rgba(34,211,238,0.5)] flex-shrink-0">
            <Send className="w-4 h-4 text-[#03050a] ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
