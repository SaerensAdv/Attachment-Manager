import { Link, useLocation } from "wouter";
import { Map, Sparkles, Users, Archive } from "lucide-react";

const tabs = [
  { href: "/", label: "Kaart", icon: Map },
  { href: "/generate", label: "Genereren", icon: Sparkles },
  { href: "/clients", label: "Klanten", icon: Users },
  { href: "/history", label: "Archief", icon: Archive },
];

export default function TabNav() {
  const [location] = useLocation();

  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
      <div className="flex items-stretch bg-card border border-foreground shadow-[3px_3px_0px_hsl(var(--foreground))]">
        <div className="hidden sm:flex items-center px-3 border-r border-foreground/20">
          <span className="font-['Playfair_Display'] font-black text-sm tracking-tight leading-none">
            SA
          </span>
        </div>
        {tabs.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 px-4 py-2 font-['Space_Mono'] text-[11px] uppercase tracking-widest transition-colors border-r border-foreground/20 last:border-r-0 ${
                active
                  ? "bg-foreground text-background"
                  : "text-foreground/60 hover:text-foreground hover:bg-foreground/5"
              }`}
              data-testid={`tab-${label.toLowerCase()}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
