import { useEffect, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, ExternalLink, Network, X } from "lucide-react";
import type { GraphNode, GraphEdge } from "@workspace/api-client-react";
import { getGetGraphNeighborsQueryKey, useGetGraphNeighbors } from "@workspace/api-client-react";
import { iconForNode, nodeColorVar, nodeSemanticLabel, relativeTime, SOURCE_LABEL, RELATION_LABEL, edgeSemantic } from "./graph-model";

export interface NodeDetailPanelProps {
  node: GraphNode;
  onClose: () => void;
  onSelectNode: (id: string) => void;
  onExpand?: (data: { nodes: GraphNode[]; edges: GraphEdge[] }) => void;
}

export default function NodeDetailPanel({ node, onClose, onSelectNode, onExpand }: NodeDetailPanelProps) {
  const reduceMotion = useReducedMotion();
  const { data, isLoading } = useGetGraphNeighbors(node.id, { query: { enabled: true, queryKey: getGetGraphNeighborsQueryKey(node.id) } });
  const rows = useMemo(() => {
    if (!data) return [];
    const byId = new Map(data.nodes.map((item) => [item.id, item]));
    return data.edges.flatMap((edge) => {
      const outgoing = edge.sourceId === node.id;
      const other = byId.get(outgoing ? edge.targetId : edge.sourceId);
      return other ? [{ edge, other, outgoing }] : [];
    });
  }, [data, node.id]);
  const metadata = useMemo(() => Object.entries((node.metadata ?? {}) as Record<string, unknown>).filter(([, value]) => typeof value === "string" || typeof value === "number").slice(0, 8), [node.metadata]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const Icon = iconForNode(node);
  const color = nodeColorVar(node);
  return (
    <motion.aside
      className="atlas-detail"
      aria-label={`Details for ${node.label}`}
      initial={reduceMotion ? { opacity: 0 } : { x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { x: "100%", opacity: 0 }}
      transition={reduceMotion ? { duration: 0.12 } : { x: { duration: 0.42, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 0.22, ease: "easeOut" } }}
    >
      <button className="atlas-detail-close" type="button" onClick={onClose} aria-label="Close node details"><X /></button>
      <p className="atlas-eyebrow">Selected node · {nodeSemanticLabel(node)}</p>
      <div className="atlas-detail-identity"><span style={{ borderColor: color, color }}><Icon /></span><div><h2>{node.label}</h2><p>{SOURCE_LABEL[node.source]} · {node.status ?? "Connected"}</p></div></div>
      <div className="atlas-health"><i />CONNECTED · {node.status?.toUpperCase() ?? "HEALTHY"}</div>
      <section className="atlas-detail-section"><h3>Signal</h3><dl><div><dt>Direct relations</dt><dd>{rows.length}</dd></div><div><dt>Last activity</dt><dd>{relativeTime(node.updatedAt)}</dd></div><div><dt>Source</dt><dd>{SOURCE_LABEL[node.source]}</dd></div></dl></section>
      {metadata.length > 0 && <section className="atlas-detail-section"><h3>Details</h3><dl>{metadata.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl></section>}
      <section className="atlas-detail-section atlas-relations"><h3>Strongest relations</h3>{isLoading && <p>Loading relations...</p>}{!isLoading && rows.length === 0 && <p>No direct relations.</p>}{rows.slice(0, 8).map(({ edge, other, outgoing }) => {
        const OtherIcon = iconForNode(other);
        return <button key={edge.id} type="button" onClick={() => { onExpand?.({ nodes: [other], edges: [edge] }); onSelectNode(other.id); }}><i style={{ background: nodeColorVar(other) }} /><span><b>{other.label}</b><small>{RELATION_LABEL[edge.relation]} · {edgeSemantic(edge)}</small></span>{outgoing ? <ArrowRight /> : <ArrowLeft />}<OtherIcon className="relation-type" /></button>;
      })}</section>
      <div className="atlas-detail-actions">{onExpand && data && <button type="button" onClick={() => onExpand({ nodes: [...data.nodes], edges: [...data.edges] })}><Network /> Show neighbours</button>}{node.url && <a href={node.url} target="_blank" rel="noopener noreferrer">Open in source <ExternalLink /></a>}</div>
    </motion.aside>
  );
}
