import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  X,
  ArrowRight,
  ArrowLeft,
  Loader2,
  ListTree,
  Quote,
  Pencil,
  Save,
} from "lucide-react";
import { type Components } from "react-markdown";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { useQueryClient } from "@tanstack/react-query";
import MarkdownView from "@/components/MarkdownView";
import {
  useGetDocContent,
  useGetDocBacklinks,
  useUpdateDocContent,
  getGetDocContentQueryKey,
  getGetDocGraphQueryKey,
  getGetDocValidationQueryKey,
  getGetDocBacklinksQueryKey,
  type DocNode,
  type DocEdge,
} from "@workspace/api-client-react";

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

// DB-backed client docs are synthetic (generated from the clients table) and
// have no file on disk, so they cannot be edited in place.
function isEditablePath(path: string): boolean {
  return !path.startsWith("clients/db/");
}

interface Heading {
  depth: number;
  text: string;
  id: string;
}

function CategoryDot({ category }: { category: string }) {
  return (
    <span
      className="w-2 h-2 rounded-full shrink-0"
      style={{ backgroundColor: `hsl(var(--cat-${category}))` }}
    />
  );
}

export default function DocPanel({ path, node, nodes, edges, onClose, onSelectPath }: DocPanelProps) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [headings, setHeadings] = useState<Heading[]>([]);

  const { data: doc, isLoading, error } = useGetDocContent(
    { path },
    { query: { enabled: !!path, queryKey: getGetDocContentQueryKey({ path }) } }
  );

  const { data: backlinksData } = useGetDocBacklinks(
    { path },
    { query: { enabled: !!path, queryKey: getGetDocBacklinksQueryKey({ path }) } }
  );
  const backlinks = backlinksData?.backlinks ?? [];

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const editable = !!doc && isEditablePath(path);

  const update = useUpdateDocContent({
    mutation: {
      onSuccess: () => {
        // Content, the graph (edges/titles may change), validation and backlinks
        // can all shift after an edit, so refresh them.
        void queryClient.invalidateQueries({ queryKey: getGetDocContentQueryKey({ path }) });
        void queryClient.invalidateQueries({ queryKey: getGetDocGraphQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetDocValidationQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetDocBacklinksQueryKey({ path }) });
        setEditing(false);
      },
    },
  });

  // Leaving a document always exits edit mode.
  useEffect(() => {
    setEditing(false);
  }, [path]);

  // The markdown that is actually rendered (HTML comments stripped); both the
  // view and the table of contents derive from this exact string.
  const cleanContent = useMemo(
    () => (doc ? doc.content.replace(/<!--[\s\S]*?-->/g, "") : ""),
    [doc]
  );

  // Derive the table of contents from the headings the markdown renderer
  // actually produced, reading the exact ids rehype-slug assigned. This keeps
  // the ToC links perfectly in sync with the rendered anchors (no slug guessing)
  // and is scoped to the document body so the panel's own h3 section titles are
  // excluded.
  useEffect(() => {
    if (!doc || isLoading || editing) {
      setHeadings([]);
      return;
    }
    const root = contentRef.current;
    if (!root) return;
    const found: Heading[] = Array.from(
      root.querySelectorAll<HTMLHeadingElement>("h2, h3, h4")
    )
      .filter((el) => el.id)
      .map((el) => ({
        depth: Number(el.tagName.slice(1)),
        text: el.textContent?.trim() ?? "",
        id: el.id,
      }))
      .filter((h) => h.text.length > 0);
    setHeadings(found);
  }, [doc, cleanContent, isLoading, editing]);

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
  }, [resolveRef, onSelectPath]);

  const scrollToHeading = (slug: string) => {
    const container = scrollRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(`#${CSS.escape(slug)}`);
    if (!el) return;
    const top =
      container.scrollTop +
      el.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      12;
    container.scrollTo({ top, behavior: "smooth" });
  };

  const startEditing = () => {
    if (!doc) return;
    setDraft(doc.content);
    setEditing(true);
  };

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
      <div className="flex-none p-5 border-b border-foreground flex items-center justify-between gap-3">
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
        <div className="flex items-center gap-2 shrink-0">
          {editing ? (
            <>
              <button
                onClick={() => update.mutate({ data: { path, content: draft } })}
                disabled={update.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-2 border border-foreground rounded-none bg-foreground text-background hover:bg-foreground/85 transition-colors font-['Space_Mono'] text-[10px] uppercase tracking-[0.2em] disabled:opacity-60"
              >
                {update.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">Opslaan</span>
              </button>
              <button
                onClick={() => setEditing(false)}
                disabled={update.isPending}
                className="px-3 py-2 border border-foreground rounded-none hover:bg-foreground hover:text-background transition-colors font-['Space_Mono'] text-[10px] uppercase tracking-[0.2em] disabled:opacity-60"
              >
                Annuleren
              </button>
            </>
          ) : (
            editable && (
              <button
                onClick={startEditing}
                aria-label="Bewerken"
                title="Bewerken"
                className="inline-flex items-center gap-1.5 px-3 py-2 border border-foreground rounded-none hover:bg-foreground hover:text-background transition-colors font-['Space_Mono'] text-[10px] uppercase tracking-[0.2em] text-foreground"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Bewerken</span>
              </button>
            )
          )}
          <button
            onClick={onClose}
            aria-label="Sluiten"
            className="p-2 border border-foreground rounded-none hover:bg-foreground hover:text-background transition-colors text-foreground shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content Area */}
      {editing ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {update.isError && (
            <p className="flex-none px-4 pt-3 font-['Space_Mono'] text-[10px] uppercase tracking-widest text-destructive">
              Opslaan mislukt. Probeer opnieuw.
            </p>
          )}
          <div className="flex-1 min-h-0 p-4">
            <CodeMirror
              value={draft}
              onChange={setDraft}
              extensions={[markdown()]}
              theme="light"
              height="100%"
              basicSetup={{ lineNumbers: true, highlightActiveLine: false, foldGutter: false }}
              className="h-full border border-foreground text-sm [&_.cm-editor]:h-full [&_.cm-scroller]:font-['Space_Mono']"
            />
          </div>
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
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
              {headings.length >= 3 && (
                <nav className="px-6 pt-6">
                  <div className="border border-foreground/30 bg-background/40 p-4">
                    <div className="flex items-center gap-2 text-[10px] font-['Space_Mono'] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                      <ListTree className="w-3.5 h-3.5" />
                      Inhoud
                    </div>
                    <ul className="flex flex-col">
                      {headings.map((h, i) => (
                        <li key={`${h.id}-${i}`}>
                          <button
                            type="button"
                            onClick={() => scrollToHeading(h.id)}
                            className="block w-full text-left font-['Inter'] text-sm text-foreground/80 hover:text-accent transition-colors py-0.5 truncate"
                            style={{ paddingLeft: `${(h.depth - 2) * 14}px` }}
                            title={h.text}
                          >
                            {h.text}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </nav>
              )}

              <div ref={contentRef} className="p-6 prose max-w-none prose-headings:font-['Playfair_Display'] prose-headings:font-bold prose-headings:tracking-tight prose-h1:uppercase prose-p:font-['Inter'] prose-li:font-['Inter'] prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-a:text-accent first-letter:font-['Playfair_Display'] scroll-smooth">
                <MarkdownView
                  content={cleanContent}
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

              {backlinks.length > 0 && (
                <div className="px-6 pb-8 pt-2 border-t border-foreground mt-2">
                  <h3 className="flex items-center gap-2 font-['Space_Mono'] text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-4 mt-4">
                    <Quote className="w-3.5 h-3.5" />
                    Genoemd door ({backlinks.length})
                  </h3>
                  <div className="flex flex-col gap-4">
                    {backlinks.map((b) => (
                      <div key={b.path} className="border-l-2 border-foreground/30 pl-3">
                        <button
                          type="button"
                          onClick={() => onSelectPath(b.path)}
                          className="group flex items-center gap-2 text-left mb-1.5"
                        >
                          <CategoryDot category={b.category} />
                          <span className="font-['Inter'] text-sm font-medium group-hover:text-accent transition-colors truncate">
                            {b.title}
                          </span>
                        </button>
                        <ul className="flex flex-col gap-1.5">
                          {b.snippets.map((s, i) => (
                            <li
                              key={i}
                              className="font-['Inter'] text-xs text-muted-foreground leading-relaxed"
                            >
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
