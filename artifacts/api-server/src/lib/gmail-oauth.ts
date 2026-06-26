/**
 * OAuth helper for GMAIL WRITE actions (creating drafts) under the agency
 * mailbox. This is intentionally separate from `google-oauth.ts` — that module
 * is the read-only data sources and guarantees it only ever requests reporting
 * scopes. The Gmail flow needs a write-capable scope (`gmail.modify`) that the
 * read-only refresh token does not carry.
 *
 * It reuses the SAME OAuth client (id + secret) as the read-only sources — a
 * refresh token is bound to the client it was minted on — but a DEDICATED Gmail
 * refresh token (`GOOGLE_OAUTH_GMAIL_REFRESH_TOKEN`) consented as the agency
 * mailbox (axel@…). The token exchange itself is identical, so it is shared from
 * `google-oauth.ts` via `exchangeRefreshToken`.
 */
import {
  GoogleOAuthConfigError,
  exchangeRefreshToken,
  type ReadonlyOAuthConfig,
} from "./google-oauth";

/**
 * Read the Gmail OAuth config: the shared read-only/Ads OAuth client plus the
 * dedicated Gmail refresh token (which carries `gmail.modify`).
 */
export function readGmailOAuthConfig(): ReadonlyOAuthConfig {
  const clientId =
    (process.env.GOOGLE_OAUTH_READONLY_CLIENT_ID?.trim() ||
      process.env.GOOGLE_ADS_OAUTH_CLIENT_ID?.trim()) ??
    "";
  const clientSecret =
    (process.env.GOOGLE_OAUTH_READONLY_CLIENT_SECRET?.trim() ||
      process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET?.trim()) ??
    "";
  const refreshToken =
    process.env.GOOGLE_OAUTH_GMAIL_REFRESH_TOKEN?.trim() ?? "";

  const missing: string[] = [];
  if (!clientId)
    missing.push("GOOGLE_OAUTH_READONLY_CLIENT_ID (of GOOGLE_ADS_OAUTH_CLIENT_ID)");
  if (!clientSecret)
    missing.push(
      "GOOGLE_OAUTH_READONLY_CLIENT_SECRET (of GOOGLE_ADS_OAUTH_CLIENT_SECRET)",
    );
  if (!refreshToken) missing.push("GOOGLE_OAUTH_GMAIL_REFRESH_TOKEN");

  if (missing.length > 0) {
    throw new GoogleOAuthConfigError(
      `Gmail OAuth is nog niet geconfigureerd. Ontbrekende secrets: ${missing.join(", ")}.`,
    );
  }

  return { clientId, clientSecret, refreshToken };
}

/** Exchange the Gmail refresh token for a short-lived access token. */
export async function getGmailAccessToken(
  cfg: ReadonlyOAuthConfig = readGmailOAuthConfig(),
): Promise<string> {
  return exchangeRefreshToken(cfg);
}
