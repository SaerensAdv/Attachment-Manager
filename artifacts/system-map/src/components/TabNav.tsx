import { Link, useLocation } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { Map, Users, Archive, Contact, ShieldCheck } from "lucide-react";

const tabs = [
  { href: "/", label: "Kaart", icon: Map },
  { href: "/team", label: "Team", icon: Contact },
  { href: "/clients", label: "Klanten", icon: Users },
  { href: "/history", label: "Archief", icon: Archive },
  { href: "/controle", label: "Controle", icon: ShieldCheck },
];

export default function TabNav() {
  const [location] = useLocation();
  const reduce = useReducedMotion();

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
              className={`relative flex items-center gap-2 px-4 py-2 font-['Space_Mono'] text-[11px] uppercase tracking-widest transition-colors border-r border-foreground/20 last:border-r-0 ${
                active
                  ? "text-background"
                  : "text-foreground/60 hover:text-foreground hover:bg-foreground/5"
              }`}
              data-testid={`tab-${label.toLowerCase()}`}
            >
              {active &&
                (reduce ? (
                  <span className="absolute inset-0 bg-foreground" />
                ) : (
                  <motion.span
                    layoutId="tabnav-active"
                    className="absolute inset-0 bg-foreground"
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  />
                ))}
              <span className="relative z-10 flex items-center gap-2">
                <Icon className="w-3.5 h-3.5" />
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
