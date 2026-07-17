import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Eye, EyeOff } from "lucide-react";
import {
  useSearchGraph,
  getSearchGraphQueryKey,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import {
  FILTER_GROUPS,
  SOURCE_TYPE_ICON,
  nodeColorVar,
  type FilterGroupId,
} from "./graph-model";

export interface GraphLegendProps {
  hiddenGroups: ReadonlySet<FilterGroupId>;
  onToggleGroup: (id: FilterGroupId) => void;
  /** A search result was chosen — select + focus it on the canvas. */
  onPick: (nodeId: string) => void;
}

// Node colour families (§7.6) — colour is a secondary encoding of type, so the
// key doubles the always-present Dutch labels + glyphs.
const FAMILY_KEY: readonly { label: string; varName: string }[] = [
  { label: "Structuur", varName: "--wg-structure" },
  { label: "Kennis", varName: "--wg-knowledge" },
  { label: "Uitvoering", varName: "--wg-execution" },
  { label: "Klant", varName: "--wg-client" },
];

const EDGE_KEY: readonly { label: string; varName: string; dashed?: boolean }[] =
  [
    { label: "Live-flow", varName: "--wg-flow" },
    { label: "Fout / verbroken", varName: "--wg-error" },
    { label: "Verwijzing", varName: "--wg-edge", dashed: true },
  ];

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function GraphLegend({
  hiddenGroups,
  onToggleGroup,
  onPick,
}: GraphLegendProps) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(term.trim(), 250);
  const enabled = debounced.length >= 2;
  const boxRef = useRef<HTMLDivElement | null>(null);

  const { data, isFetching } = useSearchGraph(
    { q: debounced, limit: 20 },
    {
      query: {
        enabled,
        queryKey: getSearchGraphQueryKey({ q: debounced, limit: 20 }),
      },
    },
  );

  const results = useMemo(() => data?.results ?? [], [data]);
  const total = data?.total ?? 0;

  // Close the results dropdown on an outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (id: string) => {
    onPick(id);
    setTerm("");
    setOpen(false);
  };

  return (
    <div className="absolute bottom-3 left-3 sm:bottom-5 sm:left-5 z-40 w-[calc(100vw-1.5rem)] max-w-[16rem] pointer-events-auto">
      <div className="bg-card/85 backdrop-blur-sm border border-border flex flex-col max-h-[70vh]">
        {/* Search */}
        <div ref={boxRef} className="relative p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={term}
              onChange={(e) => {
                setTerm(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder="Zoek in de werkruimte…"
              className="h-8 pl-7 pr-7 text-xs font-['Space_Mono']"
              data-testid="input-graph-search"
            />
            {term && (
              <button
                type="button"
                onClick={() => {
                  setTerm("");
                  setOpen(false);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Zoekopdracht wissen"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {open && enabled && (
            <div className="absolute left-2 right-2 top-full mt-1 z-50 bg-popover border border-border shadow-md max-h-64 overflow-y-auto">
              {isFetching && results.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  Zoeken…
                </p>
              )}
              {!isFetching && results.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  Geen resultaten voor "{debounced}".
                </p>
              )}
              {results.map((n) => {
                const Icon = SOURCE_TYPE_ICON[n.sourceType];
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => pick(n.id)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-foreground/5"
                    data-testid={`search-result-${n.id}`}
                  >
                    <Icon
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: nodeColorVar(n) }}
                    />
                    <span className="text-xs truncate">{n.label}</span>
                  </button>
                );
              })}
              {results.length > 0 && total > results.length && (
                <p className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border">
                  {results.length} van {total} treffers
                </p>
              )}
            </div>
          )}
        </div>

        {/* Filters + keys (scrolls if cramped) */}
        <div className="overflow-y-auto p-2 flex flex-col gap-3">
          <section>
            <h3 className="font-['Space_Mono'] text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">
              Filters
            </h3>
            <ul className="flex flex-col gap-0.5">
              {FILTER_GROUPS.map((g) => {
                const hidden = hiddenGroups.has(g.id);
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => onToggleGroup(g.id)}
                      title={g.help}
                      aria-pressed={!hidden}
                      className="w-full flex items-center gap-2 px-1.5 py-1 text-left hover:bg-foreground/5"
                      data-testid={`filter-${g.id}`}
                    >
                      {hidden ? (
                        <EyeOff className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <Eye className="w-3.5 h-3.5 shrink-0 text-foreground" />
                      )}
                      <span
                        className={`text-xs ${
                          hidden
                            ? "text-muted-foreground line-through"
                            : "text-foreground"
                        }`}
                      >
                        {g.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h3 className="font-['Space_Mono'] text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">
              Kleur = type
            </h3>
            <ul className="grid grid-cols-2 gap-x-2 gap-y-1">
              {FAMILY_KEY.map((f) => (
                <li key={f.varName} className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 shrink-0 border"
                    style={{
                      backgroundColor: `hsl(var(${f.varName}) / 0.25)`,
                      borderColor: `hsl(var(${f.varName}))`,
                    }}
                  />
                  <span className="text-[11px] text-foreground truncate">
                    {f.label}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="font-['Space_Mono'] text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">
              Lijnen
            </h3>
            <ul className="flex flex-col gap-1">
              {EDGE_KEY.map((e) => (
                <li key={e.label} className="flex items-center gap-2">
                  <svg width={22} height={6} className="shrink-0">
                    <line
                      x1={0}
                      y1={3}
                      x2={22}
                      y2={3}
                      stroke={`hsl(var(${e.varName}))`}
                      strokeWidth={1.5}
                      strokeDasharray={e.dashed ? "3,3" : undefined}
                    />
                  </svg>
                  <span className="text-[11px] text-foreground">{e.label}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
