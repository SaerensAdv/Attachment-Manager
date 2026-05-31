import { Link, useLocation } from "wouter";
import { Map, Sparkles } from "lucide-react";

const tabs = [
  { href: "/", label: "Kaart", icon: Map },
  { href: "/generate", label: "Genereren", icon: Sparkles },
];

export default function TabNav() {
  const [location] = useLocation();

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
      <div className="flex items-center gap-1 p-1 rounded-full bg-card/80 backdrop-blur-md border border-card-border shadow-2xl">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-mono font-medium tracking-tight transition-colors ${
                active
                  ? "bg-cat-agent/20 text-cat-agent"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`tab-${label.toLowerCase()}`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
