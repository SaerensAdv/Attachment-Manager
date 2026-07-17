import { Link, useLocation } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import {
  Map,
  Users,
  Archive,
  Contact,
  ShieldCheck,
  BarChart3,
  CalendarClock,
  Bug,
  ListChecks,
  LogOut,
  Search,
} from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import {
  useGetTodoOverview,
  getGetTodoOverviewQueryKey,
} from "@workspace/api-client-react";

const tabs = [
  { href: "/", label: "Kaart", icon: Map },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/team", label: "Team", icon: Contact },
  { href: "/clients", label: "Klanten", icon: Users },
  { href: "/crawl", label: "Crawl", icon: Bug },
  { href: "/zoektermen", label: "Zoektermen", icon: Search },
  { href: "/history", label: "Archief", icon: Archive },
  { href: "/todo", label: "Te doen", icon: ListChecks },
  { href: "/planning", label: "Planning", icon: CalendarClock },
  { href: "/controle", label: "Controle", icon: ShieldCheck },
];

export default function TabNav() {
  const [location] = useLocation();
  const reduce = useReducedMotion();
  const { logout } = useAuth();
  // Lightweight badge so open work is visible from anywhere. Best-effort: a
  // failed/loading fetch simply shows no badge, never blocking navigation.
  const { data: todo } = useGetTodoOverview({
    query: {
      queryKey: getGetTodoOverviewQueryKey(),
      refetchInterval: 60_000,
    },
  });
  const todoCount = todo
    ? todo.unresolvedAlerts.length +
      todo.pendingApprovals.length +
      todo.pendingProposals.length
    : 0;

  return (
    <div className="fixed top-3 sm:top-5 left-1/2 -translate-x-1/2 z-50 pointer-events-auto max-w-[calc(100vw-1rem)]">
      <div className="flex items-stretch bg-card border border-foreground shadow-[3px_3px_0px_hsl(var(--foreground))]">
        <div className="hidden lg:flex items-center px-3 border-r border-foreground/20">
          <span className="font-['Playfair_Display'] font-black text-sm tracking-tight leading-none">
            SA
          </span>
        </div>
        {tabs.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? location === "/" : location.startsWith(href);
          const badge = href === "/todo" && todoCount > 0 ? todoCount : 0;
          return (
            <Link
              key={href}
              href={href}
              aria-label={badge ? `${label} (${badge} openstaand)` : label}
              title={label}
              className={`relative flex items-center gap-0 lg:gap-2 px-3 lg:px-4 py-2.5 lg:py-2 font-['Space_Mono'] text-[11px] uppercase tracking-widest transition-colors border-r border-foreground/20 last:border-r-0 ${
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
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden lg:inline">{label}</span>
                {badge > 0 && (
                  <span
                    data-testid="badge-todo-count"
                    className={`inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 font-['Space_Mono'] text-[9px] leading-none border ${
                      active
                        ? "bg-background text-foreground border-background"
                        : "bg-accent text-accent-foreground border-accent"
                    }`}
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={logout}
          aria-label="Uitloggen"
          title="Uitloggen"
          className="relative flex items-center gap-0 lg:gap-2 px-3 lg:px-4 py-2.5 lg:py-2 font-['Space_Mono'] text-[11px] uppercase tracking-widest transition-colors border-l border-foreground/20 text-foreground/60 hover:text-foreground hover:bg-foreground/5"
          data-testid="button-logout"
        >
          <span className="relative z-10 flex items-center gap-2">
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden lg:inline">Uitloggen</span>
          </span>
        </button>
      </div>
    </div>
  );
}
