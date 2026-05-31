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

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <Loader2 className="w-8 h-8 animate-spin text-cat-agent" />
          <p className="font-mono text-sm tracking-widest text-muted-foreground">INITIALIZING ATLAS...</p>
        </div>
      </div>
    );
  }

  if (error || !graphData) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">Failed to load system map</h1>
          <p className="mt-2 text-sm text-muted-foreground">Check your connection or API status.</p>
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
            if (node) setSelectedNodePath(node.path);
          }}
          searchQuery={searchQuery}
        />
      </div>

      {/* Foreground UI Layer */}
      <div className="absolute inset-0 z-10 pointer-events-none p-6 flex justify-between items-start">
        
        {/* Left column: Legend & Search */}
        <div className="w-80 flex flex-col gap-6 pointer-events-auto">
          <div className="bg-card/80 backdrop-blur-md border border-card-border rounded-lg shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-card-border bg-card/50">
              <h1 className="font-mono font-bold tracking-tight text-lg text-foreground uppercase">
                Operations Atlas
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                Saerens Advertising AI Team Map
              </p>
            </div>
            
            <div className="p-4">
              <GraphSearch 
                query={searchQuery} 
                onQueryChange={setSearchQuery} 
              />
            </div>
            
            <div className="p-4 pt-0">
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
            />
          )}
        </div>

      </div>
    </div>
  );
}
