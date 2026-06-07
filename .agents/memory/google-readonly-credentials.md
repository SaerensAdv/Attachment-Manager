---
name: Read-only Google credential setup gotchas
description: Why the six read-only Google sources fail at the credential layer and how to verify them.
---

# Read-only Google credentials — verification gotchas

The six read-only Google sources (Search Console, GA4, Maps/Places, GMB, PageSpeed)
share two credential kinds. The code is correct; the live failures live entirely in
Google Cloud project setup. Verify with a throwaway workspace `node` script (sandbox
has no secrets) that exercises each over a read-only endpoint.

**Shared OAuth refresh token (GSC + GA4 + GMB):**
- Reuses the existing Ads OAuth client (GOOGLE_ADS_OAUTH_CLIENT_ID/SECRET); only the
  refresh token differs (GOOGLE_OAUTH_READONLY_REFRESH_TOKEN), carrying read-only
  scopes (webmasters.readonly, analytics.readonly, business.manage).
- A real Google refresh token starts with `1//`. A value that does not (e.g. a short
  72-char string) is almost certainly NOT a refresh token (wrong paste, or an access
  token / auth code).
- `invalid_grant` on token exchange = token expired/revoked/malformed OR minted against
  a DIFFERENT OAuth client than the id/secret supplied. Fix: regenerate via OAuth
  Playground configured with THIS client id+secret, offline access, the three scopes.
- **Why:** the read-only token must pair with the same Ads client or every GSC/GA4/GMB
  pull fails before any per-client config matters.

**Plain API keys (Places New + PageSpeed):**
- 403 "Requests to this API ... are blocked" = the API is not enabled on the key's
  Cloud project (or the key has API restrictions). Same key works once enabled.
- Enable "Places API (New)" and "PageSpeed Insights API" on the key's project.

**GMB** additionally needs Google allowlist approval for live data even after OAuth works.

Verify-once endpoints (read-only, no per-client config needed):
- OAuth: POST oauth2.googleapis.com/token (refresh_token grant).
- GSC: GET searchconsole.googleapis.com/webmasters/v3/sites (lists accessible sites).
- GA4: GET analyticsadmin v1beta/accountSummaries (lists properties).
- Places: POST places.googleapis.com/v1/places:searchText (X-Goog-Api-Key + FieldMask).
- PageSpeed: GET pagespeedonline/v5/runPagespeed?url=...&key=...
