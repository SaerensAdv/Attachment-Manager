import type { ReactNode } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { ArrowRight } from "lucide-react";
import saLogo from "@/assets/sa-logo.webp";
import { AtlasThemeToggle } from "./atlas/AtlasThemeProvider";

export default function AuthGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, login } = useAuth();
  if (isLoading) return <div className="atlas-auth"><AtlasThemeToggle className="atlas-auth-theme" /><div className="atlas-auth-loader"><img src={saLogo} alt="Saerens Advertising" /><i /><p>Opening Workspace Atlas</p></div></div>;
  if (!isAuthenticated) return <div className="atlas-auth">
    <AtlasThemeToggle className="atlas-auth-theme" />
    <div className="atlas-auth-brand"><span className="atlas-auth-mark"><img src={saLogo} alt="" /></span><p>Saerens Advertising</p></div>
    <main className="atlas-auth-copy"><p className="atlas-auth-eyebrow">Private operating system</p><h1>Your workspace,<br />mapped and moving.</h1><p>One view across ClickUp structure, agents, knowledge, clients and live execution.</p><button type="button" onClick={login} data-testid="button-login">Enter Workspace Atlas <ArrowRight /></button></main>
    <p className="atlas-auth-foot">Owner access only</p>
  </div>;
  return <>{children}</>;
}
