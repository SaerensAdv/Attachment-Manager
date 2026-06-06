---
name: Google Ads live intake (Fase 3)
description: Read-only live Google Ads integration — design decisions, the read-only guarantee, and how to test it in this environment.
---

# Google Ads live intake (Fase 3)

App-direct, read-only pull of live Google Ads data per client. The app ("brain")
fetches an account report and stores it on the client; agents read it via the
client→markdown bridge. No gRPC and no SDK — plain `fetch` against the REST
`googleAds:searchStream` endpoint, mirroring the website-intake approach.

## Read-only guarantee (constitution)
- Only OAuth token refresh + reporting GAQL queries are ever sent. There is no
  mutate/write path to Google Ads. Any future change here must preserve that.
- **Why:** agents may never make live writes; human approval stays in the loop.

## Auth shape
- Offline OAuth refresh token (scope `adwords`) + developer token + MCC
  login-customer-id, all from env secrets. Access token is refreshed per request
  (no caching). Customer ids are normalized to digits before use.
- Errors split cleanly: missing/invalid config → 400; upstream Google failure → 502.

## Testing in this environment (the real blocker + solution)
- The `code_execution` sandbox does **NOT** receive Replit secrets (all env vars
  come back undefined/false). Do not try to exercise Google Ads from there.
- The **workspace shell DOES** have the secrets, and container `node` global
  `fetch` reaches external hosts. So write a throwaway `/tmp/*.mjs` and run it
  with `node` to hit Google directly.
- `curl` to the proxied Replit dev domain (`$REPLIT_DEV_DOMAIN/api/...`) works
  for hitting our own endpoints; direct external `curl` egress is still blocked.
- E2e recipe that leaves no bad data: POST a throwaway client with a real
  `googleAdsCustomerId`, POST `/clients/:id/google-ads-refresh`, verify the
  stored report + `googleAdsLiveAt`, then DELETE the client.

## Multi-account clients
- A client can map to >1 Google Ads account but the schema holds a single
  `googleAdsCustomerId` + one `googleAdsLive`. For a multi-account client, put the
  primary id in `googleAdsCustomerId` and store a combined human-readable summary
  of ALL accounts in the free-paste `googleAdsData` field (agents read both).
- Discover a client's account ids by name without asking: GAQL
  `SELECT customer_client.id, customer_client.descriptive_name FROM customer_client
  WHERE customer_client.status='ENABLED'` against the MCC (login-customer-id),
  then match on descriptive_name. Run from the workspace shell via a throwaway
  `/tmp/*.mjs` (sandbox has no secrets).

## Reusing the live read for deliverables (negatives, ad-copy)
- Each generation sets at most ONE google-ads live payload, gated by deliverable
  kind (ad-copy vs negatives are mutually exclusive). The live fetch is best-effort:
  a failure emits a note and the team run continues — it must never sink the run.
- **search_term_view surfaces terms from Shopping campaigns too**, not only SEARCH.
  So negative-keyword mining must judge relevance/channel per term, not assume every
  search term belongs to a Search campaign.

## Secret-entry gotcha
- Secrets pasted into the dialog can be swapped/mistyped. A token refresh that
  returns `invalid_client — The OAuth client was not found` usually means the
  CLIENT_ID field holds the wrong value (we once found the refresh token pasted
  into it). Diagnose by checking the **shape** of each secret in the container
  (length, prefix/suffix, e.g. client_id ends `.apps.googleusercontent.com`,
  refresh token starts `1//`) — never print the values.
