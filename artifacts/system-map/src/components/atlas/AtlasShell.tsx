import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Activity, Bot, Building2, FileText, History, Network, ShieldCheck } from "lucide-react";
import { AtlasThemeToggle } from "./AtlasThemeProvider";

const lenses = [
  { href: "/", label: "Workspace", icon: Network },
  { href: "/todo", label: "Operations", icon: Activity },
  { href: "/history", label: "Runs", icon: History },
  { href: "/clients", label: "Clients", icon: Building2 },
  { href: "/team", label: "Agents", icon: Bot },
  { href: "/controle", label: "Knowledge", icon: FileText },
  { href: "/dashboard", label: "Health", icon: ShieldCheck },
] as const;

export default function AtlasShell({ title, subtitle, actions, children }: { title: string; subtitle: string; actions?: ReactNode; children: ReactNode }) {
  const [location] = useLocation();
  return <div className="workspace-atlas wg-canvas">
    <nav className="atlas-rail" aria-label="Atlas lenses">
      <Link href="/" className="atlas-monogram" aria-label="Workspace Atlas home"><span>SA</span></Link>
      <div className="atlas-rail-items">
        {lenses.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? location === "/" || location === "/graph" || location === "/atlas" : location === href || location.startsWith(`${href}/`);
          return <Link key={label} href={href} className={`atlas-rail-button${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined} aria-label={label} title={label}><Icon /><span className="atlas-rail-label">{label}</span></Link>;
        })}
      </div>
      <AtlasThemeToggle className="atlas-rail-button atlas-rail-bottom" />
    </nav>
    <header className="atlas-header">
      <div className="atlas-brand-lockup"><span className="atlas-brand-mark" aria-hidden="true" /><div><h1>{title}</h1><p>{subtitle}</p></div></div>
      <div className="atlas-header-actions">{actions}</div>
    </header>
    {children}
  </div>;
}
