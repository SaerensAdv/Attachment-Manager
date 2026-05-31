import { useState, useMemo } from "react";
import { useGetDocGraph } from "@workspace/api-client-react";
import GraphViewer from "@/components/GraphViewer";
import GraphLegend from "@/components/GraphLegend";
import GraphSearch from "@/components/GraphSearch";
import DocPanel from "@/components/DocPanel";
import { Loader2 } from "lucide-react";

export default function Home() {
  const { data: graphData, isLoading, error } = useGetDocGraph();
  
  const [selectedNodePath, setSelectedNodePath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());
  // Bumped whenever a node should be (re)focused, so re-selecting the same node
  // still pans/zooms to it.
  const [focusNonce, setFocusNonce] = useState(0);

  const selectNodeByPath = (path: string) => {
    setSelectedNodePath(path);
    setFocusNonce((n) => n + 1);
  };

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

  const selectedNode = useMemo(() => {
    if (!graphData || !selectedNodePath) return null;
    return graphData.nodes.find(n => n.path === selectedNodePath) || null;
  }, [graphData, selectedNodePath]);

  const focusFirstMatch = () => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !graphData) return;
    const match =
      activeNodes.find((n) => n.title.toLowerCase() === q) ??
      activeNodes.find((n) => n.title.toLowerCase().includes(q)) ??
      activeNodes.find((n) => n.id.toLowerCase().includes(q));
    if (match) selectNodeByPath(match.path);
  };

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
        />
      </div>

      {/* Foreground UI Layer */}
      <div className="absolute inset-0 z-10 pointer-events-none p-6 pt-20 flex justify-between items-start">
        
        {/* Left column: Legend & Search */}
        <div className="w-80 flex flex-col gap-6 pointer-events-auto">
          <div className="bg-card border border-foreground shadow-[4px_4px_0px_hsl(var(--foreground))] overflow-hidden flex flex-col">
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
              />
            </div>
          </div>
        </div>

        {/* Right column: Document Panel */}
        <div className={`w-[32rem] h-full transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${selectedNodePath ? 'translate-x-0' : 'translate-x-[110%]'} pointer-events-auto`}>
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
    </div>
  );
}
