import { useMemo } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, Network, X } from "lucide-react";
import type { GraphNode, GraphEdge } from "@workspace/api-client-react";
import { getGetGraphNeighborsQueryKey, useGetGraphNeighbors } from "@workspace/api-client-react";
import { nodeColorVar, relativeTime, SOURCE_TYPE_ICON, SOURCE_TYPE_LABEL, SOURCE_LABEL, RELATION_LABEL } from "./graph-model";

export interface NodeDetailPanelProps {
  node: GraphNode | null;
  onClose: () => void;
  onSelectNode: (id: string) => void;
  onExpand?: (data: { nodes: GraphNode[]; edges: GraphEdge[] }) => void;
}

export default function NodeDetailPanel({ node, onClose, onSelectNode, onExpand }: NodeDetailPanelProps) {
  const nodeId = node?.id ?? "";
  const { data, isLoading } = useGetGraphNeighbors(nodeId, {
    query: {
      enabled: Boolean(node),
      queryKey: getGetGraphNeighborsQueryKey(nodeId),
    },
  });
  const rows = useMemo(() => {
    if (!node || !data) return [];
    const byId = new Map(data.nodes.map((item) => [item.id, item]));
    return data.edges.flatMap((edge) => {
      const outgoing = edge.sourceId === node.id;
      const other = byId.get(outgoing ? edge.targetId : edge.sourceId);
      return other ? [{ edge, other, outgoing }] : [];
    });
  }, [data, node]);

  const metadata = useMemo(() => Object.entries((node?.metadata ?? {}) as Record<string, unknown>).filter(([, value]) => typeof value === "string" || typeof value === "number").slice(0, 5), [node]);

  if (!node) return <aside className="atlas-detail is-empty"><div className="atlas-empty-detail"><Network /><span>Selecteer een node</span><p>Bekijk context, relaties en de canonieke bron.</p></div></aside>;
  const Icon = SOURCE_TYPE_ICON[node.sourceType];
  const color = nodeColorVar(node);

  return (
    <aside className="atlas-detail">
      <button className="atlas-detail-close" type="button" onClick={onClose} aria-label="Sluiten"><X /></button>
      <p className="atlas-eyebrow">Selected node · {SOURCE_TYPE_LABEL[node.sourceType]}</p>
      <div className="atlas-detail-identity"><span style={{ borderColor: color, color }}><Icon /></span><div><h2>{node.label}</h2><p>{SOURCE_LABEL[node.source]} · {node.status ?? "Connected"}</p></div></div>
      <div className="atlas-health"><i />CONNECTED · {node.status?.toUpperCase() ?? "HEALTHY"}</div>

      <section className="atlas-detail-section"><h3>Signal</h3><dl><div><dt>Direct relations</dt><dd>{rows.length}</dd></div><div><dt>Last activity</dt><dd>{relativeTime(node.updatedAt)}</dd></div><div><dt>Source</dt><dd>{SOURCE_LABEL[node.source]}</dd></div></dl></section>

      {metadata.length > 0 && <section className="atlas-detail-section"><h3>Details</h3><dl>{metadata.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl></section>}

      <section className="atlas-detail-section atlas-relations"><h3>Strongest relations</h3>{isLoading && <p>Relaties laden...</p>}{!isLoading && rows.length === 0 && <p>Geen directe relaties.</p>}{rows.slice(0, 8).map(({ edge, other, outgoing }) => { const OtherIcon = SOURCE_TYPE_ICON[other.sourceType]; return <button key={edge.id} type="button" onClick={() => { onExpand?.({ nodes: [other], edges: [edge] }); onSelectNode(other.id); }}><i style={{ background: nodeColorVar(other) }} /> <span><b>{other.label}</b><small>{RELATION_LABEL[edge.relation]}</small></span>{outgoing ? <ArrowRight /> : <ArrowLeft />}<OtherIcon className="relation-type" /></button>; })}</section>

      <div className="atlas-detail-actions">
        {onExpand && data && <button type="button" onClick={() => onExpand({ nodes: [...data.nodes], edges: [...data.edges] })}><Network /> Show neighbours</button>}
        {node.url && <a href={node.url} target="_blank" rel="noopener noreferrer">Open in source <ExternalLink /></a>}
      </div>
    </aside>
  );
}
