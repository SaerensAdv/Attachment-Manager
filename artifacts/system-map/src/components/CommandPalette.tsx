import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { create, insertMultiple, search, type AnyOrama } from "@orama/orama";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import type { DocGraph, DocNode } from "@workspace/api-client-react";

// Orama schema for the in-memory doc index. The category is stored as its human
// label so a search for e.g. "kennis" matches knowledge documents.
const SCHEMA = {
  id: "string",
  path: "string",
  title: "string",
  summary: "string",
  category: "string",
} as const;

type DocIndex = Awaited<ReturnType<typeof create>>;

export default function CommandPalette() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DocNode[]>([]);

  const nodesRef = useRef<Map<string, DocNode>>(new Map());
  const catLabelRef = useRef<Map<string, string>>(new Map());
  const dbRef = useRef<DocIndex | null>(null);
  const loadedRef = useRef(false);

  // Global Cmd/Ctrl-K toggle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Build the index lazily the first time the palette opens.
  useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}api/docs/graph`, {
          headers: { accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const graph = (await res.json()) as DocGraph;
        if (cancelled) return;

        const catLabel = new Map<string, string>();
        for (const c of graph.categories ?? []) catLabel.set(c.id, c.label);
        catLabelRef.current = catLabel;

        const nodeMap = new Map<string, DocNode>();
        for (const n of graph.nodes ?? []) nodeMap.set(n.id, n);
        nodesRef.current = nodeMap;

        const db = await create({ schema: SCHEMA });
        await insertMultiple(
          db,
          (graph.nodes ?? []).map((n) => ({
            id: n.id,
            path: n.path,
            title: n.title,
            summary: n.summary ?? "",
            category: catLabel.get(n.category) ?? n.category,
          })),
        );
        if (cancelled) return;

        dbRef.current = db;
        setResults(graph.nodes ?? []);
      } catch {
        // Allow a retry the next time the palette opens.
        loadedRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Re-run the Orama search whenever the query changes.
  useEffect(() => {
    const db = dbRef.current;
    if (!db) return;
    let cancelled = false;
    const term = query.trim();

    (async () => {
      if (!term) {
        if (!cancelled) setResults([...nodesRef.current.values()]);
        return;
      }
      try {
        const out = await search(db as AnyOrama, {
          term,
          properties: ["title", "summary", "category"],
          limit: 50,
        });
        if (cancelled) return;
        const hits = out.hits
          .map((h) => nodesRef.current.get(String(h.document.id)))
          .filter((n): n is DocNode => Boolean(n));
        setResults(hits);
      } catch {
        if (!cancelled) setResults([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [query]);

  const handleSelect = (node: DocNode) => {
    setOpen(false);
    setQuery("");
    // The Kaart (Home) selects a node by path; pass it via the `node` query
    // param so the map can focus/open it on arrival.
    navigate(`/?node=${encodeURIComponent(node.path)}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 gap-0 rounded-none border border-foreground bg-card shadow-[6px_6px_0px_hsl(var(--foreground))]">
        <DialogTitle className="sr-only">Zoeken in de kaart</DialogTitle>
        {/* Orama drives the filtering, so cmdk's own filter is disabled. */}
        <Command
          shouldFilter={false}
          className="rounded-none bg-card"
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Zoek een agent, workflow, klant of kennisdoc..."
            className="font-['Inter'] text-sm"
          />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>
              <span className="font-['Space_Mono'] text-[11px] uppercase tracking-widest text-muted-foreground">
                Geen resultaten
              </span>
            </CommandEmpty>
            <CommandGroup>
              {results.map((node) => (
                <CommandItem
                  key={node.id}
                  value={node.id}
                  onSelect={() => handleSelect(node)}
                  className="rounded-none cursor-pointer flex items-center gap-3 data-[selected=true]:bg-foreground data-[selected=true]:text-background"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: `hsl(var(--cat-${node.category}))` }}
                  />
                  <span className="flex flex-col min-w-0 flex-1">
                    <span className="font-['Inter'] text-sm truncate">
                      {node.title}
                    </span>
                    {node.summary && (
                      <span className="font-['Inter'] text-xs text-muted-foreground truncate data-[selected=true]:text-background/70">
                        {node.summary}
                      </span>
                    )}
                  </span>
                  <span className="font-['Space_Mono'] text-[9px] uppercase tracking-widest text-muted-foreground shrink-0">
                    {catLabelRef.current.get(node.category) ?? node.category}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
