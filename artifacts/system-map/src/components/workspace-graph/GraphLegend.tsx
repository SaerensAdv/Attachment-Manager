import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Search, X } from "lucide-react";
import { getAtlasGraphDiagnostics, useSearchGraph, getSearchGraphQueryKey } from "@workspace/api-client-react";
import { FILTER_GROUPS, SOURCE_TYPE_ICON, nodeColorVar, type FilterGroupId } from "./graph-model";

export interface GraphLegendProps { activeGroup: FilterGroupId | null; onSelectGroup: (id: FilterGroupId | null) => void; onPick: (nodeId: string) => void; }
function useDebounced<T>(value: T, delay: number): T { const [debounced, setDebounced] = useState(value); useEffect(() => { const timer = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(timer); }, [value, delay]); return debounced; }
const label = (id: FilterGroupId) => FILTER_GROUPS.find((group) => group.id === id)?.label.replace("Actief werk", "Active").replace("Live-flows", "Flows") ?? id;

export default function GraphLegend({ activeGroup, onSelectGroup, onPick }: GraphLegendProps) {
  const [term, setTerm] = useState(""); const [open, setOpen] = useState(false); const debounced = useDebounced(term.trim(), 220); const boxRef = useRef<HTMLDivElement | null>(null); const enabled = debounced.length >= 2;
  const { data, isFetching } = useSearchGraph({ q: debounced, limit: 20 }, { query: { enabled, queryKey: getSearchGraphQueryKey({ q: debounced, limit: 20 }) } });
  const diagnostics = useQuery({ queryKey: ["atlas-graph-diagnostics"], queryFn: ({ signal }) => getAtlasGraphDiagnostics(signal), refetchInterval: 30_000 });
  const results = useMemo(() => data?.results ?? [], [data]); const counts = diagnostics.data?.active?.nodesByLens; const unhealthy = diagnostics.data && diagnostics.data.state !== "healthy";
  useEffect(() => { if (!open) return; const close = (event: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false); }; document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close); }, [open]);
  return <>
    <div ref={boxRef} className="atlas-search"><Search aria-hidden="true" /><input value={term} onChange={(event) => { setTerm(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Zoek een Space, Doc, agent of taak..." aria-label="Zoek in de workspace" />{term ? <button type="button" onClick={() => { setTerm(""); setOpen(false); }} aria-label="Zoekopdracht wissen"><X /></button> : <kbd>⌘K</kbd>}{open && enabled && <div className="atlas-search-results">{isFetching && results.length === 0 && <p>Zoeken...</p>}{!isFetching && results.length === 0 && <p>Geen resultaten</p>}{results.map((node) => { const Icon = SOURCE_TYPE_ICON[node.sourceType]; return <button key={node.id} type="button" onClick={() => { onPick(node.id); setTerm(""); setOpen(false); }}><Icon style={{ color: nodeColorVar(node) }} /><span>{node.label}</span><small>{node.sourceType}</small></button>; })}</div>}</div>
    <div className="atlas-modes" aria-label="Graph lenses"><button type="button" className={activeGroup === null ? "is-active" : ""} aria-pressed={activeGroup === null} onClick={() => onSelectGroup(null)}>All{diagnostics.data?.active ? ` · ${diagnostics.data.active.totalNodes}` : ""}</button>{FILTER_GROUPS.map((group) => { const count = counts?.[group.id]; const missing = diagnostics.data?.state !== "unknown" && count === 0; return <button key={group.id} type="button" className={`${activeGroup === group.id ? "is-active" : ""}${missing ? " is-missing" : ""}`} aria-pressed={activeGroup === group.id} onClick={() => onSelectGroup(group.id)} title={missing ? `${label(group.id)} source missing from the active snapshot` : group.help}>{label(group.id)}{count != null ? ` · ${count}` : ""}</button>; })}</div>
    {unhealthy && <div className="atlas-graph-warning" role="status" title={diagnostics.data.sourceErrors.join(" · ")}><AlertTriangle /><span><b>{diagnostics.data.state === "failed" ? "Graph evidence failed" : "Graph partially available"}</b><small>{diagnostics.data.sourceErrors.length ? `${diagnostics.data.sourceErrors.length} source error(s)` : diagnostics.data.active?.invariantFailures.join(", ") || "Count parity not verified"}</small></span></div>}
    <div className="atlas-legend" aria-label="Graph legend"><span><i className="structure" />STRUCTURE</span><span><i className="knowledge" />KNOWLEDGE</span><span><i className="agents" />AGENTS</span><span><i className="live" />LIVE</span></div>
  </>;
}
