import React from "react";
import { NODES, EDGES, CAT_META, LAYER_ORDER, degreeOf } from "./_data";

export function EditorialIndex() {
  const byCat = LAYER_ORDER.map((cat) => ({
    cat,
    meta: CAT_META[cat],
    nodes: NODES.filter((n) => n.cat === cat),
  }));

  const nodeMap = new Map(NODES.map((n) => [n.id, n]));

  // Get elegant connection text for a node
  const getConnectionText = (nodeId: string) => {
    const outgoing = EDGES.filter((e) => e.source === nodeId);
    if (outgoing.length === 0) return null;

    // Group by kind
    const byKind: Record<string, string[]> = {};
    outgoing.forEach((e) => {
      if (!byKind[e.kind]) byKind[e.kind] = [];
      byKind[e.kind].push(nodeMap.get(e.target)?.label || e.target);
    });

    const parts = [];
    if (byKind.routing) parts.push(`routes to ${byKind.routing.join(", ")}`);
    if (byKind.flow) parts.push(`flows to ${byKind.flow.join(", ")}`);
    if (byKind.reference) parts.push(`references ${byKind.reference.join(", ")}`);
    if (byKind.mention) parts.push(`mentions ${byKind.mention.join(", ")}`);

    return parts.join(" ; ");
  };

  return (
    <div 
      className="min-h-screen w-full flex justify-center p-12 md:p-24 selection:bg-[#d4cfc4]"
      style={{ 
        backgroundColor: "#f7f5f0", 
        color: "#1a1a1a",
        fontFamily: "'Inter', sans-serif"
      }}
    >
      <div className="w-full max-w-5xl">
        <header className="mb-20 flex items-baseline justify-between border-b border-[#1a1a1a]/20 pb-8">
          <div>
            <h1 
              className="text-6xl md:text-8xl tracking-tight mb-4" 
              style={{ fontFamily: "'Playfair Display', serif", fontWeight: 500 }}
            >
              Inhoud
            </h1>
            <p className="text-sm tracking-widest uppercase opacity-60 mb-6" style={{ fontFamily: "'Space Mono', monospace" }}>
              Systeemkaart &mdash; Saerens AI
            </p>
            <div className="flex flex-wrap gap-4 text-xs">
              {LAYER_ORDER.map((cat) => (
                <div key={cat} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CAT_META[cat].color }}></span>
                  <span style={{ fontFamily: "'Space Mono', monospace" }} className="uppercase opacity-70">
                    {CAT_META[cat].labelNl}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="text-right hidden md:block">
            <p className="text-xs uppercase tracking-widest opacity-40 mb-1" style={{ fontFamily: "'Space Mono', monospace" }}>
              Editie
            </p>
            <p className="text-sm" style={{ fontFamily: "'Space Mono', monospace" }}>
              N&deg; 01
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-24 gap-y-20">
          {byCat.map(({ cat, meta, nodes }, i) => (
            <section key={cat} className="relative">
              <div className="flex items-baseline mb-8 gap-4">
                <span 
                  className="text-sm opacity-40" 
                  style={{ fontFamily: "'Space Mono', monospace" }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h2 
                  className="text-3xl md:text-4xl italic" 
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  {meta.labelNl}
                </h2>
              </div>
              
              <ul className="space-y-6">
                {nodes.map((node) => {
                  const connections = getConnectionText(node.id);
                  const count = degreeOf(node.id);
                  return (
                    <li key={node.id} className="group relative pl-8 border-l border-[#1a1a1a]/10 hover:border-[#1a1a1a]/40 transition-colors duration-300">
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-lg font-medium">{node.label}</span>
                        {count > 0 && (
                          <span 
                            className="text-xs opacity-30 group-hover:opacity-100 transition-opacity"
                            style={{ fontFamily: "'Space Mono', monospace" }}
                            title={`${count} connecties`}
                          >
                            [{count}]
                          </span>
                        )}
                      </div>
                      {connections && (
                        <p 
                          className="text-xs leading-relaxed opacity-60 max-w-[85%]"
                          style={{ fontFamily: "'Space Mono', monospace" }}
                        >
                          &rarr; {connections}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <footer className="mt-32 pt-8 border-t border-[#1a1a1a]/20 flex justify-between items-center text-xs opacity-40 uppercase tracking-widest" style={{ fontFamily: "'Space Mono', monospace" }}>
          <span>Saerens.agency</span>
          <span>Interne Documentatie</span>
        </footer>
      </div>
    </div>
  );
}
