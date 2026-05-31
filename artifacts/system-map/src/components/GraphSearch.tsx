import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface GraphSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
}

export default function GraphSearch({ query, onQueryChange }: GraphSearchProps) {
  return (
    <div className="relative group">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-cat-agent transition-colors" />
      <Input
        type="text"
        placeholder="Search documents..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        className="pl-9 bg-background/50 border-card-border focus-visible:ring-cat-agent focus-visible:border-cat-agent placeholder:text-muted-foreground/50 transition-all font-mono text-sm"
      />
    </div>
  );
}
