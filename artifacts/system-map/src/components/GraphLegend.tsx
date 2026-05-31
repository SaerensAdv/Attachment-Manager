import type { DocCategory } from "@workspace/api-client-react";
import { Checkbox } from "@/components/ui/checkbox";

interface GraphLegendProps {
  categories: DocCategory[];
  hiddenCategories: Set<string>;
  onToggleCategory: (categoryId: string) => void;
}

export default function GraphLegend({ categories, hiddenCategories, onToggleCategory }: GraphLegendProps) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-1">
        Categories
      </h3>
      <div className="space-y-2">
        {categories.map(cat => {
          const isHidden = hiddenCategories.has(cat.id);
          return (
            <label 
              key={cat.id} 
              className={`flex items-center gap-3 cursor-pointer group transition-opacity ${isHidden ? 'opacity-50' : 'opacity-100'}`}
            >
              <Checkbox 
                checked={!isHidden} 
                onCheckedChange={() => onToggleCategory(cat.id)}
                className="w-4 h-4 rounded-[4px] border-muted-foreground/30 data-[state=checked]:bg-transparent data-[state=checked]:border-transparent"
                style={{
                  backgroundColor: !isHidden ? `hsl(var(--cat-${cat.id}))` : 'transparent',
                  borderColor: isHidden ? `hsl(var(--cat-${cat.id}))` : 'transparent',
                }}
              />
              <div className="flex-1 flex items-center justify-between">
                <span className="text-sm font-medium group-hover:text-foreground transition-colors">
                  {cat.label}
                </span>
                <span className="text-xs text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded">
                  {cat.count}
                </span>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
