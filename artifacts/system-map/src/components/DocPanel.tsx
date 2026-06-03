import { useMemo, type ReactNode } from "react";
import { X, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { type Components } from "react-markdown";
import MarkdownView from "@/components/MarkdownView";
import { useGetDocContent, type DocNode, type DocEdge } from "@workspace/api-client-react";
import { getGetDocContentQueryKey } from "@workspace/api-client-react";

interface DocPanelProps {
  path: string;
  node: DocNode | null;
  nodes: DocNode[];
  edges: DocEdge[];
  onClose: () => void;
  onSelectPath: (path: string) => void;
}

const KIND_LABEL: Record<string, string> = {
  routing: "routes to",
  flow: "feeds",
  reference: "references",
  mention: "mentions",
};

function CategoryDot({ category }: { category: string }) {
  return (
    <span
      className="w-2 h-2 rounded-full shrink-0"
      style={{ backgroundColor: `hsl(var(--cat-${category}))` }}
    />
  );
}

export default function DocPanel({ path, node, nodes, edges, onClose, onSelectPath }: DocPanelProps) {
  const { data: doc, isLoading, error } = useGetDocContent(
    { path },
    { query: { enabled: !!path, queryKey: getGetDocContentQueryKey({ path }) } }
  );

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const nodeByPath = useMemo(() => new Map(nodes.map((n) => [n.path, n])), [nodes]);

  // Direct connections for the selected doc, derived from the graph edges.
  const { outgoing, incoming } = useMemo(() => {
    const out: { node: DocNode; kind: string }[] = [];
    const inc: { node: DocNode; kind: string }[] = [];
    if (!node) return { outgoing: out, incoming: inc };
    for (const e of edges) {
      if (e.source === node.id) {
        const t = nodeById.get(e.target);
        if (t) out.push({ node: t, kind: e.kind });
      } else if (e.target === node.id) {
        const s = nodeById.get(e.source);
        if (s) inc.push({ node: s, kind: e.kind });
      }
    }
    return { outgoing: out, incoming: inc };
  }, [edges, node, nodeById]);

  const resolveRef = useMemo(() => {
    return (raw: string): DocNode | undefined => {
      const id = raw.trim().replace(/^\.\//, "");
      return nodeById.get(id) ?? nodeByPath.get(id);
    };
  }, [nodeById, nodeByPath]);

  // Inline backtick file refs become clickable jumps to the matching node.
  const renderInlineCode = useMemo(() => {
    return (text: string): ReactNode | null => {
      const target = resolveRef(text);
      if (!target) return null;
      return (
        <button
          type="button"
          onClick={() => onSelectPath(target.path)}
          className="inline-flex items-center gap-1 align-baseline rounded-none px-1 py-0.5 font-['Space_Mono'] text-[0.8em] text-accent bg-accent/10 hover:bg-accent hover:text-accent-foreground transition-colors not-prose"
          title={`Open ${target.title}`}
        >
          {text}
        </button>
      );
    };
  }, [resolveRef, onSelectPath]);

  // Relative markdown links jump to the node too.
  const markdownComponents: Components = useMemo(() => {
    const resolve = resolveRef;
    return {
      a({ href, children, ...props }) {
        const target = href ? resolve(href) : undefined;
        if (target) {
          return (
            <button
              type="button"
              onClick={() => onSelectPath(target.path)}
              className="text-accent underline underline-offset-2 hover:text-accent/80 transition-colors not-prose"
              title={`Open ${target.title}`}
            >
              {children}
            </button>
          );
        }
        return (
          <a href={href} target="_blank" rel="noreferrer noopener" {...props}>
            {children}
          </a>
        );
      },
    };
  }, [nodeById, nodeByPath, onSelectPath]);

  const renderConnections = (
    items: { node: DocNode; kind: string }[],
    label: string,
    Icon: typeof ArrowRight
  ) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-5">
        <div className="flex items-center gap-2 text-[10px] font-['Space_Mono'] uppercase tracking-[0.2em] text-muted-foreground mb-2 border-b border-foreground/20 pb-1">
          <Icon className="w-3.5 h-3.5" />
          {label} ({items.length})
        </div>
        <div className="flex flex-col">
          {items.map(({ node: n, kind }) => (
            <button
              key={`${label}-${n.id}-${kind}`}
              type="button"
              onClick={() => onSelectPath(n.path)}
              className="group flex items-center gap-2 text-left rounded-none px-2 py-1.5 border-l-2 border-transparent hover:border-accent hover:bg-accent/5 transition-colors"
            >
              <CategoryDot category={n.category} />
              <span className="font-['Inter'] text-sm truncate flex-1">{n.title}</span>
              <span className="text-[10px] font-['Space_Mono'] uppercase tracking-wider text-muted-foreground/70 shrink-0">
                {KIND_LABEL[kind] ?? kind}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full bg-card border border-foreground shadow-[4px_4px_0px_hsl(var(--foreground))] overflow-hidden flex flex-col relative">
      {/* Header */}
      <div className="flex-none p-5 border-b border-foreground flex items-center justify-between">
        <div className="flex items-center gap-3 overflow-hidden">
          <div 
            className="w-3 h-3 rounded-none shrink-0" 
            style={{ backgroundColor: node ? `hsl(var(--cat-${node.category}))` : 'hsl(var(--muted))' }} 
          />
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-['Space_Mono'] text-muted-foreground uppercase tracking-[0.25em] truncate">
              {node?.category || 'Laden...'}
            </span>
            <h2 className="font-['Playfair_Display'] text-lg font-bold tracking-tight truncate" title={node?.title || path}>
              {node?.title || path.split('/').pop()}
            </h2>
          </div>
        </div>
        <button 
          onClick={onClose}
          aria-label="Sluiten"
          className="p-2 border border-foreground rounded-none hover:bg-foreground hover:text-background transition-colors text-foreground shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/80 backdrop-blur-sm z-10">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
              <span className="font-['Space_Mono'] text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                Document lezen...
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="p-6 text-center">
            <p className="font-['Space_Mono'] text-xs uppercase tracking-widest text-destructive">
              Documentinhoud niet geladen.
            </p>
          </div>
        )}

        {doc && !isLoading && (
          <>
            <div className="p-6 prose max-w-none prose-headings:font-['Playfair_Display'] prose-headings:font-bold prose-headings:tracking-tight prose-h1:uppercase prose-p:font-['Inter'] prose-li:font-['Inter'] prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-a:text-accent first-letter:font-['Playfair_Display']">
              <MarkdownView
                content={doc.content.replace(/<!--[\s\S]*?-->/g, "")}
                components={markdownComponents}
                renderInlineCode={renderInlineCode}
              />
            </div>

            {(outgoing.length > 0 || incoming.length > 0) && (
              <div className="px-6 pb-6 pt-2 border-t border-foreground mt-2">
                <h3 className="font-['Space_Mono'] text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-4 mt-4">
                  Verbindingen
                </h3>
                {renderConnections(outgoing, "Verwijst naar", ArrowRight)}
                {renderConnections(incoming, "Verwezen vanuit", ArrowLeft)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
