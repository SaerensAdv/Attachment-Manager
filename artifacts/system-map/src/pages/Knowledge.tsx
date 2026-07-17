import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useGetDocGraph, useGetDocValidation, getGetDocGraphQueryKey, getGetDocValidationQueryKey, getAtlasKnowledgeItem, type AtlasKnowledgeItem, type DocNode } from "@workspace/api-client-react";
import { AlertTriangle, ArrowUpRight, BookOpen, CheckCircle2, FileCode2, GitBranch, Link2, Loader2, Search, ShieldCheck, X } from "lucide-react";
import AtlasShell from "@/components/atlas/AtlasShell";
import MarkdownView from "@/components/MarkdownView";
import "./Knowledge.css";

const CATEGORY_LABEL: Record<string, string> = { core: "Core", agent: "Agents", workflow: "Workflows", knowledge: "Standards", template: "Templates", client: "Clients" };
const FILTERS = ["all", "core", "agent", "workflow", "knowledge", "template", "client"] as const;
function formatDate(value: string | null): string { if (!value) return "Unknown"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Unknown" : new Intl.DateTimeFormat("en-BE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date); }

function KnowledgeReader({ item, onOpen }: { item: AtlasKnowledgeItem; onOpen: (id: string) => void }) {
  const relations = useMemo(() => item.relations.map((relation) => { const outgoing = relation.source === item.nodeId; return { id: outgoing ? relation.target : relation.source, kind: relation.kind }; }), [item]);
  const clean = useMemo(() => item.content.replace(/<!--[\s\S]*?-->/g, ""), [item.content]);
  return <article className="knowledge-reader">
    <header className="knowledge-reader-head"><div className="knowledge-reader-title"><p>{CATEGORY_LABEL[item.category] ?? item.category} · {item.source === "github" ? "GitHub canonical" : "Runtime cache"}</p><h2>{item.title}</h2><span>{item.path}</span></div>{item.canonicalUrl && <a href={item.canonicalUrl} target="_blank" rel="noopener noreferrer" className="knowledge-source-link">Open source <ArrowUpRight /></a>}</header>
    <div className="knowledge-provenance"><span><GitBranch />Read-only</span><span><ShieldCheck />Canonical source protected</span><span>Updated {formatDate(item.updatedAt)}</span></div>
    <div className="knowledge-markdown prose prose-invert max-w-none"><MarkdownView content={clean} /></div>
    {relations.length > 0 && <footer className="knowledge-relations"><h3><Link2 />Direct relations</h3><div>{relations.slice(0, 16).map((relation) => <button key={`${relation.kind}-${relation.id}`} type="button" onClick={() => onOpen(relation.id)}><span>{relation.kind.replace("_", " ")}</span>{relation.id}</button>)}</div></footer>}
  </article>;
}

export default function Knowledge() {
  const searchString = useSearch(); const [, navigate] = useLocation();
  const [selectedId, setSelectedId] = useState<string | null>(new URLSearchParams(searchString).get("node"));
  const [query, setQuery] = useState(""); const [category, setCategory] = useState<(typeof FILTERS)[number]>("all"); const [showValidation, setShowValidation] = useState(false);
  const graph = useGetDocGraph({ query: { queryKey: getGetDocGraphQueryKey() } });
  const validation = useGetDocValidation({ query: { queryKey: getGetDocValidationQueryKey(), enabled: showValidation } });
  const nodes = graph.data?.nodes ?? [];
  const visible = useMemo(() => { const term = query.trim().toLowerCase(); return nodes.filter((node) => (category === "all" || node.category === category) && (!term || node.title.toLowerCase().includes(term) || node.path.toLowerCase().includes(term))).sort((a, b) => a.title.localeCompare(b.title)); }, [nodes, query, category]);
  useEffect(() => { if (!selectedId && nodes.length) setSelectedId((nodes.find((node) => node.path === "AGENTS.md") ?? nodes[0]).id); }, [nodes, selectedId]);
  const item = useQuery({ queryKey: ["atlas-knowledge-item", selectedId], queryFn: ({ signal }) => getAtlasKnowledgeItem(selectedId!, signal), enabled: Boolean(selectedId) });
  const openNode = (id: string) => { const target = nodes.find((node) => node.id === id || node.path === id); const next = target?.id ?? id; setSelectedId(next); navigate(`/controle?node=${encodeURIComponent(next)}`, { replace: true }); };
  const actions = <button type="button" className={`atlas-action${showValidation ? " is-active" : ""}`} onClick={() => setShowValidation((value) => !value)}><ShieldCheck />Validation{validation.data ? ` · ${validation.data.issues.length}` : ""}</button>;

  return <AtlasShell title="Knowledge" subtitle="Versioned sources and operating standards" actions={actions}>
    <main className="knowledge-stage">
      <aside className="knowledge-index">
        <div className="knowledge-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search knowledge..." aria-label="Search knowledge" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X /></button>}</div>
        <div className="knowledge-filters">{FILTERS.map((filter) => <button key={filter} type="button" className={category === filter ? "is-active" : ""} onClick={() => setCategory(filter)}>{filter === "all" ? "All" : CATEGORY_LABEL[filter]}</button>)}</div>
        <div className="knowledge-index-meta"><span>{visible.length} sources</span><span>Read-only</span></div>
        <div className="knowledge-list" data-lenis-prevent>
          {graph.isLoading && Array.from({ length: 8 }).map((_, index) => <div className="knowledge-list-skeleton" key={index} />)}
          {graph.isError && <div className="knowledge-index-state"><AlertTriangle /><p>Knowledge index unavailable.</p><button type="button" onClick={() => graph.refetch()}>Try again</button></div>}
          {!graph.isLoading && !graph.isError && visible.length === 0 && <div className="knowledge-index-state"><BookOpen /><p>No matching sources.</p></div>}
          {visible.map((node: DocNode) => <button key={node.id} type="button" className={`knowledge-list-row${selectedId === node.id ? " is-active" : ""}`} onClick={() => openNode(node.id)}><i data-category={node.category}><FileCode2 /></i><span><b>{node.title}</b><small>{node.path}</small></span>{node.active === false && <em>Paused</em>}</button>)}
        </div>
      </aside>
      <section className="knowledge-content" data-lenis-prevent>
        {item.isLoading && <div className="knowledge-reader-state"><Loader2 className="atlas-rotating" /><p>Loading document</p></div>}
        {item.isError && <div className="knowledge-reader-state is-error"><AlertTriangle /><h2>Document unavailable</h2><p>This source may have moved or been removed from the current knowledge graph.</p><button type="button" onClick={() => item.refetch()}>Try again</button></div>}
        {item.data && <KnowledgeReader item={item.data} onOpen={openNode} />}
      </section>
      {showValidation && <aside className="knowledge-validation" data-lenis-prevent><header><div><p>Integrity check</p><h2>Validation</h2></div><button type="button" onClick={() => setShowValidation(false)} aria-label="Close validation"><X /></button></header>
        {validation.isLoading && <div className="knowledge-reader-state"><Loader2 className="atlas-rotating" /></div>}
        {validation.isError && <div className="knowledge-reader-state is-error"><AlertTriangle /><p>Validation unavailable.</p></div>}
        {validation.data && validation.data.issues.length === 0 && <div className="knowledge-validation-clear"><CheckCircle2 /><h3>No integrity issues</h3><p>Knowledge references and required sources are consistent.</p></div>}
        {validation.data && validation.data.issues.length > 0 && <div className="knowledge-issues">{validation.data.issues.map((issue, index) => <button type="button" key={`${issue.kind}-${index}`} onClick={() => issue.source && openNode(issue.source)}><i data-severity={issue.severity}><AlertTriangle /></i><span><b>{issue.kind}</b><p>{issue.message}</p>{issue.source && <small>{issue.source}</small>}</span></button>)}</div>}
      </aside>}
    </main>
  </AtlasShell>;
}
