import { type Request, type Response, type NextFunction } from "express";

/**
 * Central authentication gate.
 *
 * Mounted at `/api`, so the paths it sees are relative to that mount (e.g.
 * `/healthz`, `/login`). It runs AFTER `authMiddleware` has loaded any session
 * onto `req.user`, and rejects every request that is not authenticated — except
 * a small allow-list:
 *
 *   - the public health check, so uptime probes keep working;
 *   - the auth endpoints themselves (login/callback/logout + the auth-state
 *     probe the frontend hits before a session exists);
 *   - the secret-gated webhooks, which authenticate callers with their own
 *     `x-trigger-secret` mechanism (an n8n flow / scheduler / Screaming Frog
 *     export has no browser session).
 *
 * On top of "must be logged in" it optionally enforces a single operator: when
 * OWNER_EMAIL is set, only that Replit account is allowed through (this is an
 * internal single-operator tool). When OWNER_EMAIL is unset it degrades to "any
 * authenticated Replit user", which is still a hard lock compared to the
 * previously-open API.
 */

// Paths (relative to the `/api` mount) that never require a session.
const PUBLIC_PATHS = new Set<string>([
  // Health probe.
  "/healthz",
  // Public brand asset (SA logo) referenced by absolute URL from outbound email,
  // fetched by Gmail's image proxy with no session.
  "/brand/logo.png",
  // Auth flow + auth-state probe.
  "/auth/user",
  "/login",
  "/callback",
  "/logout",
  "/mobile-auth/token-exchange",
  "/mobile-auth/logout",
  // Secret-gated webhooks (own x-trigger-secret check inside the route).
  "/generate/autonomous",
  "/crawl-intake",
]);

export function isOwner(req: Request): boolean {
  const owner = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
  // No owner configured: any authenticated Replit user is allowed.
  if (!owner) return true;
  const email = req.user?.email?.trim().toLowerCase();
  return !!email && email === owner;
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Let CORS preflight through untouched.
  if (req.method === "OPTIONS") {
    next();
    return;
  }

  if (PUBLIC_PATHS.has(req.path)) {
    next();
    return;
  }

  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Niet ingelogd." });
    return;
  }

  if (!isOwner(req)) {
    res.status(403).json({ error: "Geen toegang tot dit account." });
    return;
  }

  next();
}
