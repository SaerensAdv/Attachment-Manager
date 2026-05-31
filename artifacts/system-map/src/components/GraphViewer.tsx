import { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3-force";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { DocNode, DocEdge, DocCategory } from "@workspace/api-client-react";

interface GraphViewerProps {
  nodes: DocNode[];
  edges: DocEdge[];
  categories: DocCategory[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  searchQuery: string;
}

interface SimNode extends d3.SimulationNodeDatum, DocNode {
  x?: number;
  y?: number;
}

interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
  kind: string;
}

// Map category to CSS variable color
const getCategoryColor = (categoryId: string) => {
  return `hsl(var(--cat-${categoryId}))`;
};

export default function GraphViewer({
  nodes,
  edges,
  categories,
  selectedNodeId,
  onSelectNode,
  searchQuery
}: GraphViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [simEdges, setSimEdges] = useState<SimEdge[]>([]);

  // Update dimensions on resize
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Run D3 Simulation
  useEffect(() => {
    if (!nodes.length) {
      setSimNodes([]);
      setSimEdges([]);
      return;
    }

    const simNodesData: SimNode[] = nodes.map(n => ({ ...n }));
    const simEdgesData: SimEdge[] = edges.map(e => ({ ...e }));

    const simulation = d3.forceSimulation<SimNode>(simNodesData)
      .force("link", d3.forceLink<SimNode, SimEdge>(simEdgesData).id(d => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(dimensions.width / 2, dimensions.height / 2))
      .force("collide", d3.forceCollide().radius(50));

    // Update state on each tick
    simulation.on("tick", () => {
      // Force React re-render by creating new arrays
      setSimNodes([...simNodesData]);
      setSimEdges([...simEdgesData]);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, dimensions.width, dimensions.height]);

  // Derived styling helpers
  const lowerSearchQuery = searchQuery.toLowerCase();
  
  const isNodeHighlighted = (node: SimNode) => {
    if (selectedNodeId) return node.id === selectedNodeId;
    if (lowerSearchQuery) return node.title.toLowerCase().includes(lowerSearchQuery);
    return false;
  };

  const isNodeDimmed = (node: SimNode) => {
    if (selectedNodeId) return node.id !== selectedNodeId;
    if (lowerSearchQuery) return !node.title.toLowerCase().includes(lowerSearchQuery);
    return false;
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-background relative overflow-hidden">
      {/* Grid Pattern Background */}
      <div className="absolute inset-0 pointer-events-none opacity-20" 
           style={{
             backgroundImage: 'radial-gradient(circle at 2px 2px, hsl(var(--border)) 1px, transparent 0)',
             backgroundSize: '32px 32px'
           }} 
      />

      <TransformWrapper
        initialScale={1}
        minScale={0.1}
        maxScale={4}
        centerOnInit
        limitToBounds={false}
      >
        <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full">
          <svg width={dimensions.width} height={dimensions.height} className="overflow-visible">
            <defs>
              {/* Reference edge arrow */}
              <marker id="arrow-reference" viewBox="0 -5 10 10" refX="25" refY="0" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,-5L10,0L0,5" fill="hsl(var(--muted-foreground))" opacity={0.6} />
              </marker>
              {/* Mention edge arrow */}
              <marker id="arrow-mention" viewBox="0 -5 10 10" refX="25" refY="0" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,-5L10,0L0,5" fill="hsl(var(--muted-foreground))" opacity={0.3} />
              </marker>
            </defs>

            {/* Edges Layer */}
            <g className="edges">
              {simEdges.map((edge, i) => {
                const source = edge.source as SimNode;
                const target = edge.target as SimNode;
                if (source.x === undefined || source.y === undefined || target.x === undefined || target.y === undefined) return null;

                const isReference = edge.kind === "reference";
                const isEdgeHighlighted = selectedNodeId && (source.id === selectedNodeId || target.id === selectedNodeId);
                const isEdgeDimmed = selectedNodeId && !isEdgeHighlighted;

                return (
                  <line
                    key={`edge-${i}`}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={isReference ? 2 : 1}
                    strokeDasharray={isReference ? "none" : "4,4"}
                    opacity={isEdgeDimmed ? 0.1 : isEdgeHighlighted ? 0.8 : (isReference ? 0.4 : 0.2)}
                    markerEnd={`url(#arrow-${isReference ? 'reference' : 'mention'})`}
                    className="transition-opacity duration-300"
                  />
                );
              })}
            </g>

            {/* Nodes Layer */}
            <g className="nodes">
              {simNodes.map((node) => {
                if (node.x === undefined || node.y === undefined) return null;
                
                const isHighlighted = isNodeHighlighted(node);
                const isDimmed = isNodeDimmed(node);
                const color = getCategoryColor(node.category);

                return (
                  <g 
                    key={node.id}
                    transform={`translate(${node.x},${node.y})`}
                    onClick={() => onSelectNode(node.id)}
                    className="cursor-pointer transition-all duration-300"
                    style={{ 
                      opacity: isDimmed ? 0.2 : 1,
                      transform: `translate(${node.x}px,${node.y}px) scale(${isHighlighted ? 1.2 : 1})`
                    }}
                  >
                    {/* Glow effect for highlighted nodes */}
                    {isHighlighted && (
                      <circle r={24} fill={color} opacity={0.2} className="animate-pulse" />
                    )}
                    
                    {/* Main Node Circle */}
                    <circle 
                      r={16} 
                      fill="hsl(var(--card))"
                      stroke={color}
                      strokeWidth={isHighlighted ? 4 : 2}
                      className="transition-all duration-300 shadow-xl"
                    />
                    
                    {/* Inner core color */}
                    <circle r={8} fill={color} opacity={isHighlighted ? 1 : 0.8} />

                    {/* Node Label */}
                    <text
                      dy={28}
                      textAnchor="middle"
                      fill={isHighlighted ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))"}
                      className={`font-mono text-xs transition-colors duration-300 ${isHighlighted ? 'font-bold' : ''}`}
                      style={{ pointerEvents: 'none' }}
                    >
                      {node.title}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
