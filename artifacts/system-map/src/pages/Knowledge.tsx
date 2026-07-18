import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useGetDocGraph, useGetDocValidation, getGetDocGraphQueryKey, getGetDocValidationQueryKey, getAtlasKnowledgeItem, getBrainHierarchy, type AtlasKnowledgeItem, type BrainHierarchyNode } from "@workspace/api-client-react";
import { AlertTriangle, ArrowUpRight, BookOpen, Bot, CheckCircle2, ChevronRight, FileCode2, Folder, GitBranch, Library, Link2, Loader2, Network, Search, ShieldCheck, X } from "lucide-react";
import AtlasShell from "@/components/atlas/AtlasShell";
import MarkdownView from "@/components/MarkdownView";
import { buildKnowledgeTree, filterHierarchyTree, hierarchyBreadcrumbs, hierarchyRuntimeId, hierarchySourceId, type KnowledgeTreeNode } from "@/components/knowledge-hierarchy-model";
import "./Knowledge.css";

const CATEGORY_LABEL: Record<string, string> = { core: "Core", agent: "Agents", workflow: "Workflows", knowledge: "Standards", template: "Templates", client: "Clients" };
const ICON = { master: Network, hub: Folder, registry: Library, object: Library, source: FileCode2, runtime: Network } as const;
function formatDate(value: string | null): string { if (!value) return "Unknown"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Unknown" : new Intl.DateTimeFormat("en-BE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date); }

function KnowledgeReader({ item, hierarchy, onOpen }: { item: AtlasKnowledgeItem; hierarchy: readonly BrainHierarchyNode[]; onOpen: (id: string) => void }) {
  const relations = useMemo(() => item.relations.map((relation) => { const outgoing = relation.source === item.nodeId; return { id: outgoing ? relation.target : relation.source, kind: relation.kind }; }), [item]);
  const clean = useMemo(() => item.content.replace(/<!--[\s\S]*?-->/g, ""), [item.content]);
  const hierarchyId = hierarchySourceId(hierarchy, item.path); const crumbs = hierarchyId ? hierarchyBreadcrumbs(hierarchy, hierarchyId) : [];
  return <article className="knowledge-reader">
    {crumbs.length > 0 && <nav className="knowledge-breadcrumbs" aria-label="Knowledge hierarchy">{crumbs.map((crumb, index) => <span key={crumb.id}><button type="button" onClick={() => onOpen(crumb.id)}>{crumb.label}</button>{index < crumbs.length - 1 && <ChevronRight />}</span>)}</nav>}
    <header className="knowledge-reader-head"><div className="knowledge-reader-title"><p>{CATEGORY_LABEL[item.category] ?? item.category} · {item.source === "github" ? "GitHub canonical" : "Runtime cache"}</p><h2>{item.title}</h2><span>{item.path}</span></div>{item.canonicalUrl && <a href={item.canonicalUrl} target="_blank" rel="noopener noreferrer" className="knowledge-source-link">Open source <ArrowUpRight /></a>}</header>
    <div className="knowledge-provenance"><span><GitBranch />Read-only</span><span><ShieldCheck />Canonical source protected</span><span>Updated {formatDate(item.updatedAt)}</span></div>
    <div className="knowledge-markdown prose prose-invert max-w-none"><MarkdownView content={clean} /></div>
    {hierarchyId && <section className="knowledge-mapping"><h3>Hierarchy mapping</h3>{crumbs.slice(-3).map((crumb) => <div key={crumb.id}><code>{crumb.kind}</code><b>{crumb.label}</b><em>{crumb.canonicalOwner}</em></div>)}<div><code>runtime id</code><b>{item.path}</b><em>preserved</em></div></section>}
    {relations.length > 0 && <footer className="knowledge-relations"><h3><Link2 />Direct relations</h3><div>{relations.slice(0, 16).map((relation) => <button key={`${relation.kind}-${relation.id}`} type="button" onClick={() => onOpen(relation.id)}><span>{relation.kind.replace("_", " ")}</span>{relation.id}</button>)}</div></footer>}
  </article>;
}

function HierarchyRow({ node, depth, open, selected, onToggle, onSelect }: { node: KnowledgeTreeNode; depth: number; open: Set<string>; selected: string | null; onToggle: (id: string) => void; onSelect: (node: KnowledgeTreeNode) => void }) {
  const Icon = ICON[node.kind]; const expanded = open.has(node.id); const hasChildren = node.children.length > 0;
  return <div><button type="button" data-kind={node.kind} className={`knowledge-tree-row${expanded ? " is-open" : ""}${selected === node.id ? " is-active" : ""}`} style={{ paddingLeft: `${8 + depth * 10}px` }} onClick={() => hasChildren ? onToggle(node.id) : onSelect(node)}><i className="knowledge-tree-chevron">{hasChildren && <ChevronRight />}</i><i className="knowledge-tree-icon"><Icon /></i><span><b>{node.label}</b><small>{node.kind} · {node.canonicalOwner}</small></span>{node.status !== "active" && <em>{node.status}</em>}</button>{hasChildren && <div className={`knowledge-tree-children${expanded ? " is-open" : ""}`}><div>{node.children.map((child) => <HierarchyRow key={child.id} node={child} depth={depth + 1} open={open} selected={selected} onToggle={onToggle} onSelect={onSelect} />)}</div></div>}</div>;
}

export default function Knowledge() {
  const searchString = useSearch(); const [, navigate] = useLocation();
  const [selectedId, setSelectedId] = useState<string | null>(new URLSearchParams(searchString).get("node")); const [selectedHierarchyId, setSelectedHierarchyId] = useState<string | null>(null);
  const [query, setQuery] = useState(""); const [showValidation, setShowValidation] = useState(false); const [open, setOpen] = useState<Set<string>>(() => new Set(["brain", "knowledge", "knowledge.registry"]));
  const graph = useGetDocGraph({ query: { queryKey: getGetDocGraphQueryKey() } });
  const hierarchy = useQuery({ queryKey: ["brain-hierarchy"], queryFn: ({ signal }) => getBrainHierarchy(signal) });
  const validation = useGetDocValidation({ query: { queryKey: getGetDocValidationQueryKey(), enabled: showValidation } });
  const hierarchyNodes = hierarchy.data?.nodes ?? []; const tree = useMemo(() => hierarchy.data ? filterHierarchyTree(buildKnowledgeTree(hierarchyNodes, hierarchy.data.manifest.rootId)!, query) : null, [hierarchy.data, hierarchyNodes, query]);
  useEffect(() => { if (!selectedId && graph.data?.nodes.length) setSelectedId((graph.data.nodes.find((node) => node.path === "AGENTS.md") ?? graph.data.nodes[0]).id); }, [graph.data, selectedId]);
  useEffect(() => { if (selectedId && hierarchyNodes.length) setSelectedHierarchyId(hierarchySourceId(hierarchyNodes, selectedId)); }, [selectedId, hierarchyNodes]);
  const item = useQuery({ queryKey: ["atlas-knowledge-item", selectedId], queryFn: ({ signal }) => getAtlasKnowledgeItem(selectedId!, signal), enabled: Boolean(selectedId) });
  const openNode = (id: string) => { const runtime = hierarchyRuntimeId(hierarchyNodes, id) ?? id; const target = graph.data?.nodes.find((node) => node.id === runtime || node.path === runtime); if (!target) { setSelectedHierarchyId(id); return; } setSelectedId(target.id); setSelectedHierarchyId(hierarchySourceId(hierarchyNodes, target.path)); navigate(`/controle?node=${encodeURIComponent(target.id)}`, { replace: true }); };
  const selectHierarchy = (node: KnowledgeTreeNode) => openNode(node.id);
  const hierarchyCrumbs = selectedHierarchyId ? hierarchyBreadcrumbs(hierarchyNodes, selectedHierarchyId) : hierarchyNodes.length ? [hierarchyNodes.find((node) => node.id === "brain")!].filter(Boolean) : [];
  const actions = <button type="button" className={`atlas-action${showValidation ? " is-active" : ""}`} onClick={() => setShowValidation((value) => !value)}><ShieldCheck />Validation{validation.data ? ` · ${validation.data.issues.length}` : ""}</button>;

  return <AtlasShell title="Knowledge" subtitle="Master, hubs, registries and versioned sources" actions={actions}><main className="knowledge-stage">
    <aside className="knowledge-index"><div className="knowledge-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the brain..." aria-label="Search knowledge hierarchy" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X /></button>}</div>
      <nav className="knowledge-index-trail">{hierarchyCrumbs.map((crumb, index) => <span key={crumb.id}><button type="button" onClick={() => { setOpen((current) => new Set(current).add(crumb.id)); setSelectedHierarchyId(crumb.id); }}>{crumb.label}</button>{index < hierarchyCrumbs.length - 1 && <ChevronRight />}</span>)}</nav>
      <div className="knowledge-index-meta"><span>{hierarchy.data ? `${hierarchy.data.mappedSourceCount}/${hierarchy.data.sourceCount} sources` : "Loading hierarchy"}</span><span>Read-only</span></div>
      <div className="knowledge-list" data-lenis-prevent>{(graph.isLoading || hierarchy.isLoading) && Array.from({ length: 8 }).map((_, index) => <div className="knowledge-list-skeleton" key={index} />)}
        {(graph.isError || hierarchy.isError) && <div className="knowledge-index-state"><AlertTriangle /><p>Knowledge hierarchy unavailable.</p><button type="button" onClick={() => { graph.refetch(); hierarchy.refetch(); }}>Try again</button></div>}
        {tree && <HierarchyRow node={tree} depth={0} open={open} selected={selectedHierarchyId} onToggle={(id) => setOpen((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; })} onSelect={selectHierarchy} />}
        {!tree && !graph.isLoading && !hierarchy.isLoading && !graph.isError && !hierarchy.isError && <div className="knowledge-index-state"><BookOpen /><p>No matching hierarchy nodes.</p></div>}
      </div></aside>
    <section className="knowledge-content" data-lenis-prevent>{item.isLoading && <div className="knowledge-reader-state"><Loader2 className="atlas-rotating" /><p>Loading document</p></div>}{item.isError && <div className="knowledge-reader-state is-error"><AlertTriangle /><h2>Document unavailable</h2><p>This source may have moved or been removed.</p><button type="button" onClick={() => item.refetch()}>Try again</button></div>}{item.data && <KnowledgeReader item={item.data} hierarchy={hierarchyNodes} onOpen={openNode} />}</section>
    {showValidation && <aside className="knowledge-validation" data-lenis-prevent><header><div><p>Integrity check</p><h2>Validation</h2></div><button type="button" onClick={() => setShowValidation(false)} aria-label="Close validation"><X /></button></header>{validation.isLoading && <div className="knowledge-reader-state"><Loader2 className="atlas-rotating" /></div>}{validation.isError && <div className="knowledge-reader-state is-error"><AlertTriangle /><p>Validation unavailable.</p></div>}{validation.data?.issues.length === 0 && <div className="knowledge-validation-clear"><CheckCircle2 /><h3>No integrity issues</h3><p>Knowledge references and required sources are consistent.</p></div>}{validation.data && validation.data.issues.length > 0 && <div className="knowledge-issues">{validation.data.issues.map((issue, index) => <button type="button" key={`${issue.kind}-${index}`} onClick={() => issue.source && openNode(issue.source)}><i data-severity={issue.severity}><AlertTriangle /></i><span><b>{issue.kind}</b><p>{issue.message}</p>{issue.source && <small>{issue.source}</small>}</span></button>)}</div>}</aside>}
  </main></AtlasShell>;
}
