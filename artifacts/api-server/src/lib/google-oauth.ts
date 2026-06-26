/**
 * Shared Google OAuth helper for the READ-ONLY data sources (Search Console,
 * GA4, Business Profile). They all authenticate the same way: an offline
 * refresh token is exchanged for a short-lived access token against Google's
 * OAuth endpoint.
 *
 * The OAuth *client* (id + secret) may be dedicated to the read-only sources
 * (`GOOGLE_OAUTH_READONLY_CLIENT_ID` / `_SECRET`) or, when those are unset, falls
 * back to the Google Ads OAuth client. They are decoupled because a read-only
 * refresh token is bound to the exact client it was minted on: if that client
 * differs from the Ads client, exchanging the token against the Ads client fails
 * with `unauthorized_client`. The refresh token
 * (`GOOGLE_OAUTH_READONLY_REFRESH_TOKEN`) carries the read-only reporting scopes
 * (`webmasters.readonly`, `analytics.readonly`, `business.manage`) instead of
 * `adwords`. Keeping this in one place means every read-only Google source shares
 * the same config validation, error mapping and token logic — and the read-only
 * guarantee (we only ever request reporting scopes) lives in exactly one spot.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Thrown when required OAuth secrets are missing — surfaced as a 400. */
export class GoogleOAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleOAuthConfigError";
  }
}

export type GoogleOAuthErrorCode =
  | "AUTH_ERROR"
  | "RATE_LIMIT"
  | "API_ERROR"
  | "NETWORK_ERROR";

/** Thrown when the token exchange itself fails — surfaced as a 502. */
export class GoogleOAuthError extends Error {
  code: GoogleOAuthErrorCode;
  constructor(message: string, code: GoogleOAuthErrorCode = "API_ERROR") {
    super(message);
    this.name = "GoogleOAuthError";
    this.code = code;
  }
}

export interface ReadonlyOAuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/**
 * Read the read-only OAuth config from the environment. Reuses the Google Ads
 * OAuth client (same Google Cloud project) but a dedicated refresh token that
 * holds the read-only reporting scopes.
 */
export function readReadonlyOAuthConfig(): ReadonlyOAuthConfig {
  // Prefer a dedicated read-only client; fall back to the shared Ads client so
  // an existing single-client setup keeps working without new secrets.
  const clientId =
    (process.env.GOOGLE_OAUTH_READONLY_CLIENT_ID?.trim() ||
      process.env.GOOGLE_ADS_OAUTH_CLIENT_ID?.trim()) ??
    "";
  const clientSecret =
    (process.env.GOOGLE_OAUTH_READONLY_CLIENT_SECRET?.trim() ||
      process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET?.trim()) ??
    "";
  const refreshToken =
    process.env.GOOGLE_OAUTH_READONLY_REFRESH_TOKEN?.trim() ?? "";

  const missing: string[] = [];
  if (!clientId)
    missing.push("GOOGLE_OAUTH_READONLY_CLIENT_ID (of GOOGLE_ADS_OAUTH_CLIENT_ID)");
  if (!clientSecret)
    missing.push(
      "GOOGLE_OAUTH_READONLY_CLIENT_SECRET (of GOOGLE_ADS_OAUTH_CLIENT_SECRET)",
    );
  if (!refreshToken) missing.push("GOOGLE_OAUTH_READONLY_REFRESH_TOKEN");

  if (missing.length > 0) {
    throw new GoogleOAuthConfigError(
      `Read-only Google OAuth is nog niet geconfigureerd. Ontbrekende secrets: ${missing.join(", ")}.`,
    );
  }

  return { clientId, clientSecret, refreshToken };
}

/**
 * Exchange any offline refresh token (+ the OAuth client it was minted on) for a
 * short-lived access token. Shared by the read-only data sources and the Gmail
 * draft flow — the exchange is identical; only the config differs (the scopes are
 * baked into the refresh token, not requested here).
 */
export async function exchangeRefreshToken(
  cfg: ReadonlyOAuthConfig,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: cfg.refreshToken,
  });

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (err) {
    throw new GoogleOAuthError(
      `Kon geen verbinding maken met Google OAuth: ${(err as Error).message}`,
      "NETWORK_ERROR",
    );
  }

  const json = (await res.json().catch(() => null)) as
    | { access_token?: string; error?: string; error_description?: string }
    | null;

  if (!res.ok || !json?.access_token) {
    const detail = json?.error_description || json?.error || `HTTP ${res.status}`;
    const code: GoogleOAuthErrorCode =
      res.status === 401 || res.status === 403
        ? "AUTH_ERROR"
        : res.status === 429
          ? "RATE_LIMIT"
          : "API_ERROR";
    throw new GoogleOAuthError(
      `Google OAuth gaf een fout bij het vernieuwen van het token: ${detail}`,
      code,
    );
  }

  return json.access_token;
}

/** Exchange the read-only refresh token for a short-lived access token. */
export async function getReadonlyAccessToken(
  cfg: ReadonlyOAuthConfig = readReadonlyOAuthConfig(),
): Promise<string> {
  return exchangeRefreshToken(cfg);
}
