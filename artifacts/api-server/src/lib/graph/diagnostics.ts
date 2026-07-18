import type { Graph, GraphRelation, GraphSource, GraphSourceType } from "./types";
import type { RuntimeProvenance } from "../runtime-provenance";

export type GraphLens = "structure" | "knowledge" | "agents" | "active" | "flows";
export interface GraphDiagnostics {
  totalNodes: number;
  totalEdges: number;
  nodesBySource: Partial<Record<GraphSource, number>>;
  nodesByType: Partial<Record<GraphSourceType, number>>;
  nodesByLens: Record<GraphLens, number>;
  edgesByRelation: Partial<Record<GraphRelation, number>>;
  invariantFailures: string[];
}
const lens = (type: GraphSourceType): GraphLens => ["workspace","space","folder","list"].includes(type) ? "structure" : ["doc","page","sop"].includes(type) ? "knowledge" : ["agent","workflow"].includes(type) ? "agents" : ["task","client","run"].includes(type) ? "active" : "flows";
const increment = <K extends string>(record: Partial<Record<K, number>>, key: K) => { record[key] = (record[key] ?? 0) + 1; };

export function diagnoseGraph(graph: Graph, runtime?: RuntimeProvenance): GraphDiagnostics {
  const nodesBySource: Partial<Record<GraphSource, number>> = {};
  const nodesByType: Partial<Record<GraphSourceType, number>> = {};
  const nodesByLens: Record<GraphLens, number> = { structure: 0, knowledge: 0, agents: 0, active: 0, flows: 0 };
  const edgesByRelation: Partial<Record<GraphRelation, number>> = {};
  for (const node of graph.nodes) { increment(nodesBySource, node.source); increment(nodesByType, node.sourceType); nodesByLens[lens(node.sourceType)] += 1; }
  for (const edge of graph.edges) increment(edgesByRelation, edge.relation);
  const invariantFailures: string[] = [];
  if ((nodesByType.workspace ?? 0) > 0 && (nodesByType.integration ?? 0) === 0) invariantFailures.push("workspace_without_integration");
  if ((runtime?.counts.agents ?? 0) > 0 && (nodesByType.agent ?? 0) === 0) invariantFailures.push("packaged_agents_missing_from_graph");
  if ((runtime?.counts.workflows ?? 0) > 0 && (nodesByType.workflow ?? 0) === 0) invariantFailures.push("packaged_workflows_missing_from_graph");
  return { totalNodes: graph.nodes.length, totalEdges: graph.edges.length, nodesBySource, nodesByType, nodesByLens, edgesByRelation, invariantFailures };
}
