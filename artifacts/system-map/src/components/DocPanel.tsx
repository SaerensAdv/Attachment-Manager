import { useMemo } from "react";
import { X, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
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

  // Make inline backtick file refs and relative markdown links jump to the node.
  const markdownComponents: Components = useMemo(() => {
    const resolve = (raw: string): DocNode | undefined => {
      const id = raw.trim().replace(/^\.\//, "");
      return nodeById.get(id) ?? nodeByPath.get(id);
    };
    return {
      code({ className, children, ...props }) {
        const text = String(children ?? "");
        // Block code carries a language-* className; only treat inline code as a ref.
        const target = !className ? resolve(text) : undefined;
        if (target) {
          return (
            <button
              type="button"
              onClick={() => onSelectPath(target.path)}
              className="inline-flex items-center gap-1 align-baseline rounded px-1 py-0.5 font-mono text-[0.85em] text-cat-agent bg-cat-agent/10 hover:bg-cat-agent/20 transition-colors not-prose"
              title={`Open ${target.title}`}
            >
              {text}
            </button>
          );
        }
        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      },
      a({ href, children, ...props }) {
        const target = href ? resolve(href) : undefined;
        if (target) {
          return (
            <button
              type="button"
              onClick={() => onSelectPath(target.path)}
              className="text-cat-agent underline underline-offset-2 hover:text-cat-agent/80 transition-colors not-prose"
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
      <div className="mb-4">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
          <Icon className="w-3.5 h-3.5" />
          {label} ({items.length})
        </div>
        <div className="flex flex-col gap-1">
          {items.map(({ node: n, kind }) => (
            <button
              key={`${label}-${n.id}-${kind}`}
              type="button"
              onClick={() => onSelectPath(n.path)}
              className="group flex items-center gap-2 text-left rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors"
            >
              <CategoryDot category={n.category} />
              <span className="text-sm truncate flex-1">{n.title}</span>
              <span className="text-[10px] font-mono uppercase text-muted-foreground/70 shrink-0">
                {KIND_LABEL[kind] ?? kind}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full bg-card/95 backdrop-blur-xl border border-card-border shadow-2xl rounded-l-2xl overflow-hidden flex flex-col relative">
      {/* Header */}
      <div className="flex-none p-4 border-b border-card-border flex items-center justify-between bg-card/50">
        <div className="flex items-center gap-3 overflow-hidden">
          <div 
            className="w-3 h-3 rounded-full shrink-0" 
            style={{ backgroundColor: node ? `hsl(var(--cat-${node.category}))` : 'hsl(var(--muted))' }} 
          />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider truncate">
              {node?.category || 'Loading...'}
            </span>
            <h2 className="text-sm font-semibold truncate" title={node?.title || path}>
              {node?.title || path.split('/').pop()}
            </h2>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/50 backdrop-blur-sm z-10">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-cat-agent" />
              <span className="font-mono text-xs text-muted-foreground">Reading Document...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="p-6 text-center text-destructive">
            <p>Failed to load document content.</p>
          </div>
        )}

        {doc && !isLoading && (
          <>
            <div className="p-6 prose prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {doc.content}
              </ReactMarkdown>
            </div>

            {(outgoing.length > 0 || incoming.length > 0) && (
              <div className="px-6 pb-6 pt-2 border-t border-card-border mt-2">
                <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3 mt-4">
                  Connections
                </h3>
                {renderConnections(outgoing, "Links to", ArrowRight)}
                {renderConnections(incoming, "Linked from", ArrowLeft)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
