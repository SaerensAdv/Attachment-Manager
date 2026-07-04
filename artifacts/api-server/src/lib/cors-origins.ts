import type { CorsOptions } from "cors";

/**
 * Config-driven CORS allowlist. The API previously reflected ANY origin
 * (`origin: true`) with credentials, which is effectively open. Because the web
 * artifact authenticates with a session cookie, credentials must stay on and
 * the origin must be reflected (never wildcarded) — but only for origins we
 * actually trust.
 *
 * Trusted origins are derived from the Replit-provided domains (so the web
 * artifact keeps working out of the box), plus any explicitly configured extra
 * origins via `CORS_ALLOWED_ORIGINS` (comma-separated), plus localhost in
 * development. Requests with no `Origin` header (same-origin browser requests,
 * curl, and server-to-server partner calls) are always allowed — CORS only
 * governs cross-origin browser requests.
 */

/** Strip a trailing slash so `https://x/` and `https://x` compare equal. */
function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/** Build the set of allowed browser origins from the environment. */
export function resolveAllowedOrigins(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  const origins = new Set<string>();
  const add = (value: string): void => {
    const normalized = normalizeOrigin(value);
    if (normalized) origins.add(normalized);
  };

  // REPLIT_DOMAINS: the public host(s) the app is served on (comma/space list).
  for (const host of (env.REPLIT_DOMAINS ?? "").split(/[\s,]+/)) {
    if (host.trim()) add(`https://${host.trim()}`);
  }
  // The dev domain, when present, is the workspace preview host.
  const devDomain = (env.REPLIT_DEV_DOMAIN ?? "").trim();
  if (devDomain) add(`https://${devDomain}`);

  // Explicit operator-configured extra origins.
  for (const origin of (env.CORS_ALLOWED_ORIGINS ?? "").split(",")) {
    if (origin.trim()) add(origin);
  }

  // Local development conveniences.
  if ((env.NODE_ENV ?? "development") !== "production") {
    add("http://localhost:5173");
    add("http://localhost:3000");
    add("http://localhost:5000");
  }

  return origins;
}

/**
 * Build the cors() options with the resolved allowlist. Unknown cross-origin
 * requests get no CORS headers (the browser blocks them) rather than an error
 * response, so non-browser and same-origin traffic is unaffected.
 */
export function buildCorsOptions(
  env: NodeJS.ProcessEnv = process.env,
): CorsOptions {
  const allowed = resolveAllowedOrigins(env);
  return {
    credentials: true,
    origin(origin, callback) {
      // No Origin header: same-origin browser request, curl, or a server-side
      // partner call. CORS does not apply — allow it through.
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, allowed.has(normalizeOrigin(origin)));
    },
  };
}
