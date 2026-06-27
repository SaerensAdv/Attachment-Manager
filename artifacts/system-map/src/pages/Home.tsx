import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useSearch, useLocation } from "wouter";
import { AnimatePresence } from "framer-motion";
import { useGetDocGraph, useGetTeam } from "@workspace/api-client-react";
import GraphViewer from "@/components/GraphViewer";
import GraphLegend from "@/components/GraphLegend";
import RunLegend from "@/components/RunLegend";
import GraphSearch from "@/components/GraphSearch";
import DocPanel from "@/components/DocPanel";
import CommandBar from "@/components/CommandBar";
import GenerationPanel from "@/components/GenerationPanel";
import { useGeneration } from "@/hooks/useGeneration";
import { Loader2 } from "lucide-react";

export default function Home() {
  const { data: graphData, isLoading, error } = useGetDocGraph();
  // Portraits are best-effort: the graph stays fully functional without them.
  const { data: teamData } = useGetTeam();

  const portraits = useMemo(() => {
    const map: Record<string, string> = {};
    for (const member of teamData?.employees ?? []) {
      // Prefer the small thumbnail so the tiny round nodes paint instantly;
      // fall back to the full portrait if a thumbnail isn't available.
      const url = member.portraitThumbUrl ?? member.portraitUrl;
      if (url) map[member.path] = url;
    }
    return map;
  }, [teamData]);

  const [selectedNodePath, setSelectedNodePath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());
  // Service-line lens: when set, the map dims down to one service line's cluster.
  // Opt-in and frontend-only; the default (null) is exactly today's full view.
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  // Bumped whenever a node should be (re)focused, so re-selecting the same node
  // still pans/zooms to it.
  const [focusNonce, setFocusNonce] = useState(0);

  const selectNodeByPath = (path: string) => {
    setSelectedNodePath(path);
    setFocusNonce((n) => n + 1);
  };

  // The generation flow lives docked on the map. It is driven from the full node
  // set (not the category-filtered view) so clients/agents/workflows are always
  // available regardless of which legend categories are toggled off.
  const gen = useGeneration(graphData?.nodes, graphData?.edges);

  const involvedNodeIds = useMemo(
    () => new Set(gen.involvedPaths),
    [gen.involvedPaths],
  );

  // Spotlight the routed team the moment a run becomes live (involved set goes
  // from empty to populated), without re-framing on every subsequent change so
  // it never fights the user's own pan/zoom.
  const [spotlight, setSpotlight] = useState<{ ids: string[]; nonce: number }>({
    ids: [],
    nonce: 0,
  });
  const prevInvolvedCount = useRef(0);
  useEffect(() => {
    const count = gen.involvedPaths.length;
    if (prevInvolvedCount.current === 0 && count > 0) {
      setSpotlight((s) => ({ ids: gen.involvedPaths, nonce: s.nonce + 1 }));
    }
    prevInvolvedCount.current = count;
  }, [gen.involvedPaths]);

  // Measure the docked command bar + generation panel so the map can frame the
  // spotlighted team into the area NOT covered by them during a live run.
  const dockRef = useRef<HTMLDivElement>(null);
  const [dockHeight, setDockHeight] = useState(0);
  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const update = () => setDockHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Open/focus a node when arriving via the command palette (/?node=<path>).
  const search = useSearch();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!graphData) return;
    const param = new URLSearchParams(search).get("node");
    if (!param) return;
    if (!graphData.nodes.some((n) => n.path === param)) return;
    selectNodeByPath(param);
    navigate("/", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, graphData]);

  const toggleCategory = (categoryId: string) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const activeNodes = useMemo(() => {
    if (!graphData) return [];
    return graphData.nodes.filter(n => !hiddenCategories.has(n.category));
  }, [graphData, hiddenCategories]);

  const activeEdges = useMemo(() => {
    if (!graphData) return [];
    const activeNodeIds = new Set(activeNodes.map(n => n.id));
    return graphData.edges.filter(
      e => activeNodeIds.has(e.source) && activeNodeIds.has(e.target)
    );
  }, [graphData, activeNodes]);

  // The selectable service lines are the delivery + client departments of the
  // agency org model (Direction & Quality are cross-cutting hubs, not lines).
  const lines = useMemo(() => {
    return (teamData?.departments ?? [])
      .filter((d) => d.kind === "delivery" || d.kind === "client")
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((d) => ({ id: d.id, title: d.title }));
  }, [teamData]);

  // Resolve the chosen line to the set of nodes that should stay lit: its agents
  // (seeds), the workflows/templates/knowledge those agents touch (1 hop over
  // non-flow edges), the templates/knowledge those workflows pull in (a 2nd hop),
  // and the always-on Orchestrator + Quality hubs. flow edges are skipped on
  // purpose — they are the combinatorial layer mesh that makes the hairball.
  const lensNodeIds = useMemo(() => {
    if (!selectedLine || !graphData || !teamData) return null;
    const employees = teamData.employees;
    const seeds = new Set(
      employees.filter((e) => e.department.id === selectedLine).map((e) => e.path),
    );
    if (seeds.size === 0) return null;
    const hubs = employees
      .filter(
        (e) =>
          e.department.kind === "direction" || e.department.kind === "quality",
      )
      .map((e) => e.path);
    const catById = new Map(graphData.nodes.map((n) => [n.id, n.category]));
    const adj = new Map<string, Set<string>>();
    const link = (a: string, b: string) => {
      if (!adj.has(a)) adj.set(a, new Set());
      adj.get(a)!.add(b);
    };
    for (const e of graphData.edges) {
      if (e.kind === "flow") continue;
      link(e.source, e.target);
      link(e.target, e.source);
    }
    const carriesContent = (cat?: string) =>
      cat === "workflow" || cat === "template" || cat === "knowledge";
    const members = new Set<string>(seeds);
    const workflows: string[] = [];
    for (const seed of seeds) {
      for (const nb of adj.get(seed) ?? []) {
        if (members.has(nb)) continue;
        if (carriesContent(catById.get(nb))) {
          members.add(nb);
          if (catById.get(nb) === "workflow") workflows.push(nb);
        }
      }
    }
    for (const w of workflows) {
      for (const nb of adj.get(w) ?? []) {
        const c = catById.get(nb);
        if ((c === "template" || c === "knowledge") && !members.has(nb)) {
          members.add(nb);
        }
      }
    }
    for (const h of hubs) members.add(h);
    return members;
  }, [selectedLine, graphData, teamData]);

  const selectedNode = useMemo(() => {
    if (!graphData || !selectedNodePath) return null;
    return graphData.nodes.find(n => n.path === selectedNodePath) || null;
  }, [graphData, selectedNodePath]);

  // Stable identity so the memoized GraphSearch doesn't re-render on every map
  // tick. setState updaters are stable, so we inline the selection here rather
  // than depend on the non-memoized selectNodeByPath helper.
  const focusFirstMatch = useCallback(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !graphData) return;
    const match =
      activeNodes.find((n) => n.title.toLowerCase() === q) ??
      activeNodes.find((n) => n.title.toLowerCase().includes(q)) ??
      activeNodes.find((n) => n.id.toLowerCase().includes(q));
    if (match) {
      setSelectedNodePath(match.path);
      setFocusNonce((n) => n + 1);
    }
  }, [searchQuery, graphData, activeNodes]);

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-5">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
          <p className="font-['Space_Mono'] text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Atlas initialiseren...
          </p>
        </div>
      </div>
    );
  }

  if (error || !graphData) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground p-6">
        <div className="bg-card border border-foreground shadow-[4px_4px_0px_hsl(var(--foreground))] max-w-md w-full p-8 text-center">
          <p className="font-['Space_Mono'] text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-4">
            Editie No. 001 — Storing
          </p>
          <h1 className="font-['Playfair_Display'] text-3xl font-black uppercase tracking-tight text-foreground">
            Kaart Niet Geladen
          </h1>
          <p className="mt-4 font-['Inter'] text-sm text-muted-foreground">
            Controleer uw verbinding of de status van de API.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-background text-foreground flex">
      {/* Background Graph Layer */}
      <div className="absolute inset-0 z-0">
        <GraphViewer 
          nodes={activeNodes} 
          edges={activeEdges} 
          categories={graphData.categories}
          selectedNodeId={selectedNode?.id || null}
          onSelectNode={(nodeId) => {
            const node = graphData.nodes.find(n => n.id === nodeId);
            if (node) selectNodeByPath(node.path);
          }}
          searchQuery={searchQuery}
          focusNonce={focusNonce}
          portraits={portraits}
          involvedNodeIds={involvedNodeIds}
          activeNodeId={gen.activePath}
          handoff={gen.handoff}
          nodeStatus={gen.nodeStatus}
          spotlightNodeIds={spotlight.ids}
          spotlightNonce={spotlight.nonce}
          frameBottomInset={dockHeight}
          lensNodeIds={lensNodeIds}
        />
      </div>

      {/* Command bar + generation panel — docked bottom-center over the map. The
          stack itself ignores pointer events so the map stays pannable; only the
          bar and panel capture interaction. */}
      <div ref={dockRef} className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 px-4 pb-4 sm:px-6 sm:pb-6 pointer-events-none">
        <AnimatePresence>
          {gen.hasActiveFlow && <GenerationPanel key="gen-panel" gen={gen} />}
        </AnimatePresence>
        <CommandBar gen={gen} />
      </div>

      {/* Foreground UI Layer */}
      <div className="absolute inset-0 z-10 pointer-events-none p-4 pt-16 sm:p-6 sm:pt-20 flex items-start">
        
        {/* Left column: Legend & Search */}
        <div className="w-72 sm:w-80 max-w-[calc(100vw-2rem)] flex flex-col gap-6 pointer-events-none">
          <div className="pointer-events-auto bg-card border border-foreground shadow-[4px_4px_0px_hsl(var(--foreground))] overflow-hidden flex flex-col">
            <div className="p-5 border-b border-foreground">
              <div className="flex items-baseline justify-between mb-1">
                <span className="font-['Space_Mono'] text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  Editie No. 042
                </span>
                <span className="font-['Space_Mono'] text-[10px] uppercase tracking-[0.3em] text-accent">
                  Live
                </span>
              </div>
              <h1 className="font-['Playfair_Display'] font-black tracking-tight text-2xl text-foreground uppercase leading-none mt-2">
                Operations Atlas
              </h1>
              <p className="font-['Inter'] text-xs text-muted-foreground mt-2">
                Saerens Advertising AI Team Map
              </p>
            </div>
            
            <div className="p-5">
              <GraphSearch 
                query={searchQuery} 
                onQueryChange={setSearchQuery} 
                onSubmit={focusFirstMatch}
              />
            </div>
            
            <div className="px-5 pb-5">
              <GraphLegend 
                categories={graphData.categories} 
                hiddenCategories={hiddenCategories}
                onToggleCategory={toggleCategory}
                lines={lines}
                selectedLine={selectedLine}
                onSelectLine={setSelectedLine}
              />
            </div>
          </div>

          {/* Run-state legend: only present while a run is live, so the moving
              rings/pulses on the map become self-explanatory. */}
          <AnimatePresence>
            {involvedNodeIds.size > 0 && <RunLegend key="run-legend" />}
          </AnimatePresence>
        </div>

      </div>

      {/* Document Panel — overlay pinned to the right, above the legend and the
          docked command bar. Full-width on mobile (covers the legend so it never
          overflows), fixed 32rem from sm up. On mobile its height stops above the
          command-bar dock (reusing the measured dockHeight) so the command bar
          stays reachable while a doc is open; from sm up the panel is only 32rem
          wide so the centred command bar is reachable beside it. */}
      <div
        style={{ "--dock-h": `${dockHeight}px` } as React.CSSProperties}
        className={`absolute right-0 top-0 z-30 h-[calc(100dvh-var(--dock-h))] sm:h-full w-[min(32rem,100vw)] p-4 pt-16 sm:p-6 sm:pt-20 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${selectedNodePath ? 'translate-x-0 pointer-events-auto' : 'translate-x-[110%] pointer-events-none'}`}
      >
        {selectedNodePath && (
          <DocPanel 
            path={selectedNodePath} 
            onClose={() => setSelectedNodePath(null)}
            node={selectedNode}
            nodes={graphData.nodes}
            edges={graphData.edges}
            onSelectPath={selectNodeByPath}
          />
        )}
      </div>
    </div>
  );
}
