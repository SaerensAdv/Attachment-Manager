import type { ReactNode } from "react";
import { useAuth } from "@workspace/replit-auth-web";

/**
 * Wraps the whole app behind authentication. While the auth state resolves it
 * shows nothing; once resolved it either renders a single-button login screen or
 * the app itself. The API rejects every protected route without a session, so
 * this gate keeps the UI from rendering broken (401-everywhere) views.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, login } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <span className="font-['Space_Mono'] text-[11px] uppercase tracking-widest text-foreground/50">
          Laden…
        </span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="w-full max-w-md bg-card border border-foreground shadow-[5px_5px_0px_hsl(var(--foreground))] p-8">
          <p className="font-['Space_Mono'] text-[11px] uppercase tracking-widest text-foreground/50 mb-3">
            Saerens Advertising
          </p>
          <h1 className="font-['Playfair_Display'] font-black text-3xl leading-tight mb-3">
            Operations Atlas
          </h1>
          <p className="text-sm text-foreground/70 mb-8">
            Deze werkruimte is afgeschermd. Log in om verder te gaan.
          </p>
          <button
            type="button"
            onClick={login}
            className="w-full bg-foreground text-background font-['Space_Mono'] text-[12px] uppercase tracking-widest py-3 transition-opacity hover:opacity-90"
            data-testid="button-login"
          >
            Inloggen
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
