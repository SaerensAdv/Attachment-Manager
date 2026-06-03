import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { DocCategory } from "@workspace/api-client-react";
import { Checkbox } from "@/components/ui/checkbox";

interface GraphLegendProps {
  categories: DocCategory[];
  hiddenCategories: Set<string>;
  onToggleCategory: (categoryId: string) => void;
}

export default function GraphLegend({ categories, hiddenCategories, onToggleCategory }: GraphLegendProps) {
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
    </div>
  );
}
