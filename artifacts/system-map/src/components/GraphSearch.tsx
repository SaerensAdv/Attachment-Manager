import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface GraphSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSubmit?: () => void;
}

export default function GraphSearch({ query, onQueryChange, onSubmit }: GraphSearchProps) {
  return (
    <div className="relative group">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-accent transition-colors" />
      <Input
        type="text"
        placeholder="Documenten doorzoeken..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit?.();
          }
        }}
        className="pl-9 rounded-none bg-background border-foreground focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-accent placeholder:text-muted-foreground/70 transition-all font-['Space_Mono'] text-xs uppercase tracking-wider"
      />
    </div>
  );
}
