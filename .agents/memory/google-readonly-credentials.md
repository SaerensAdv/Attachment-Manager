---
name: Read-only Google credential setup gotchas
description: Why the six read-only Google sources fail at the credential layer and how to verify them.
---

# Read-only Google credentials — verification gotchas

The six read-only Google sources (Search Console, GA4, Maps/Places, GMB, PageSpeed)
share two credential kinds. The code is correct; the live failures live entirely in
Google Cloud project setup. Verify with a throwaway workspace `node` script (sandbox
has no secrets) that exercises each over a read-only endpoint.

**OAuth refresh token (GSC + GA4 + GMB) — its own client, not the Ads one:**
- `readReadonlyOAuthConfig` prefers a DEDICATED read-only client
  (GOOGLE_OAUTH_READONLY_CLIENT_ID/SECRET) and only falls back to the Ads client
  (GOOGLE_ADS_OAUTH_CLIENT_ID/SECRET) when those are unset. Refresh token lives in
  GOOGLE_OAUTH_READONLY_REFRESH_TOKEN with scopes webmasters.readonly,
  analytics.readonly, business.manage.
- **Why decoupled:** a refresh token is bound to the exact OAuth client it was minted
  on. The founder's read-only token came from a different client than Ads, so
  exchanging it against the Ads client failed with `unauthorized_client`. The three
  (client-id + client-secret + refresh-token) must come from ONE client; store them as
  a matched set. Overwriting the shared Ads client would break the Ads refresh token.
- A real Google refresh token starts with `1//`. A value that does not (e.g. a short
  72-char string) is almost certainly NOT a refresh token (wrong paste / access token).
- Token-exchange error taxonomy: `invalid_grant` (400) = token expired/revoked/malformed;
  `unauthorized_client` (401) = token minted on a different client than the id/secret
  supplied (client mismatch — changing only the secret does NOT fix it).
- Mint via OAuth Playground → gear → "Use your own OAuth credentials" with that client's
  id+secret (add `https://developers.google.com/oauthplayground` to its redirect URIs),
  all three scopes selected at once, offline access. Log in as the account that actually
  has GSC/GA4/GMB access or the token authorizes but returns no data.

**Two distinct Google 403s (confirmed live):**
- "...has not been used in project N before or it is disabled" = the API itself is NOT
  enabled on the project. Fix: enable it (e.g. Google Analytics Data API for GA4 runReport).
- "Requests to this API <method> are blocked" = an API-key-level **API restriction**
  excludes that API (NOT a project enablement issue). Fix: edit the KEY → API restrictions
  → allow the API (or "Don't restrict key"); also check Application restrictions aren't
  blocking server-side calls. This is the Places (New) + PageSpeed key situation.

**GMB** additionally needs Google allowlist approval for live data even after OAuth works.

Verify-once endpoints (read-only, no per-client config needed):
- OAuth: POST oauth2.googleapis.com/token (refresh_token grant).
- GSC: GET searchconsole.googleapis.com/webmasters/v3/sites (lists accessible sites).
- GA4: GET analyticsadmin v1beta/accountSummaries (lists properties).
- Places: POST places.googleapis.com/v1/places:searchText (X-Goog-Api-Key + FieldMask).
- PageSpeed: GET pagespeedonline/v5/runPagespeed?url=...&key=...
