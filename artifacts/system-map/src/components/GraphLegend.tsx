import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { DocCategory } from "@workspace/api-client-react";
import { Checkbox } from "@/components/ui/checkbox";

interface GraphLegendProps {
  categories: DocCategory[];
  hiddenCategories: Set<string>;
  onToggleCategory: (categoryId: string) => void;
  // The selectable service lines (delivery + client departments). Empty until
  // the team roster has loaded; the lens section is hidden while empty.
  lines: { id: string; title: string }[];
  selectedLine: string | null;
  onSelectLine: (lineId: string | null) => void;
}

export default function GraphLegend({
  categories,
  hiddenCategories,
  onToggleCategory,
  lines,
  selectedLine,
  onSelectLine,
}: GraphLegendProps) {
  const reduce = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? "Categorieën uitklappen" : "Categorieën inklappen"}
        aria-expanded={!collapsed}
        title={collapsed ? "Uitklappen" : "Inklappen"}
        data-testid="button-legend-collapse"
        className="flex items-center justify-between w-full font-['Space_Mono'] text-[10px] uppercase tracking-[0.3em] text-muted-foreground border-b border-foreground/20 pb-2 mb-1 transition-colors hover:text-foreground"
      >
        <span>Categorieën</span>
        {collapsed ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronUp className="w-3.5 h-3.5" />
        )}
      </button>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="legend-body"
            className="overflow-hidden"
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 1 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="space-y-1">
              {categories.map(cat => {
                const isHidden = hiddenCategories.has(cat.id);
                return (
                  <label 
                    key={cat.id} 
                    className={`flex items-center gap-3 cursor-pointer group transition-opacity py-1 ${isHidden ? 'opacity-40' : 'opacity-100'}`}
                  >
                    <Checkbox 
                      checked={!isHidden} 
                      onCheckedChange={() => onToggleCategory(cat.id)}
                      className="w-4 h-4 rounded-none border-foreground/40 data-[state=checked]:bg-transparent data-[state=checked]:border-transparent"
                      style={{
                        backgroundColor: !isHidden ? `hsl(var(--cat-${cat.id}))` : 'transparent',
                        borderColor: isHidden ? `hsl(var(--cat-${cat.id}))` : 'transparent',
                      }}
                    />
                    <div className="flex-1 flex items-center justify-between">
                      <span className="font-['Inter'] text-sm font-medium group-hover:text-foreground transition-colors">
                        {cat.label}
                      </span>
                      <span className="font-['Space_Mono'] text-[10px] text-muted-foreground border border-foreground/20 px-1.5 py-0.5">
                        {cat.count}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Service-line lens — opt-in. Picking a line lights up that service line
          (its team, workflows and knowledge) and dims the rest; "Overzicht"
          restores the full map. Single-select; the Orchestrator and Quality
          hubs stay visible in every line. */}
      {lines.length > 0 && (
        <div className="flex flex-col gap-3 pt-2 mt-1 border-t border-foreground/10">
          <div className="flex items-center justify-between w-full font-['Space_Mono'] text-[10px] uppercase tracking-[0.3em] text-muted-foreground border-b border-foreground/20 pb-2 mb-1">
            <span>Service-lijn</span>
          </div>
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => onSelectLine(null)}
              aria-pressed={selectedLine === null}
              data-testid="button-line-overview"
              className={`flex items-center gap-3 w-full py-1 px-1 text-left transition-colors ${
                selectedLine === null ? "bg-foreground/5" : "opacity-60 hover:opacity-100"
              }`}
            >
              <span className="w-3 h-3 border border-foreground/40" />
              <span className={`font-['Inter'] text-sm ${selectedLine === null ? "font-semibold" : "font-medium"}`}>
                Overzicht
              </span>
            </button>
            {lines.map((line) => {
              const active = selectedLine === line.id;
              return (
                <button
                  key={line.id}
                  type="button"
                  onClick={() => onSelectLine(active ? null : line.id)}
                  aria-pressed={active}
                  data-testid={`button-line-${line.id}`}
                  className={`flex items-center gap-3 w-full py-1 px-1 text-left transition-colors ${
                    active ? "bg-foreground/5" : "opacity-60 hover:opacity-100"
                  }`}
                >
                  <span
                    className="w-3 h-3"
                    style={{ backgroundColor: `hsl(var(--dept-${line.id}))` }}
                  />
                  <span className={`font-['Inter'] text-sm flex-1 ${active ? "font-semibold" : "font-medium"}`}>
                    {line.title}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="font-['Inter'] text-[11px] text-muted-foreground leading-snug">
            Licht één service-lijn uit met haar team, workflows en kennis. Orchestrator en Quality blijven altijd zichtbaar.
          </p>
        </div>
      )}
    </div>
  );
}
