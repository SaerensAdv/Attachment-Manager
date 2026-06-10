---
name: Bing Webmaster live intake
description: Quirks of the read-only Bing Webmaster Tools intake — position scale, error shapes, mirror-of-GSC contract.
---

# Bing Webmaster live intake (read-only)

Mirrors the Google Search Console integration 1-for-1: read-only pull → Dutch
markdown report + `bing-*` signals injected into agent context, refresh route,
coverage entry, UI section. Auth is a single `BING_WEBMASTER_API_KEY` secret (no
Replit connector for Bing); one key covers every verified site. Per-client config
is just the full verified site URL (`https://example.com/`, never `sc-domain:`).

## Position scale = 1, NOT ×10 (verified live)
- Several docs claim `GetQueryStats`/`GetPageStats` return average position ×10
  (180 = 18.0). **Empirically false for the live account**: raw
  `AvgImpressionPosition` comes back as a real 1-based rank (brand term = 1, range
  1–21 = page 1–3). Dividing by 10 produced impossible sub-1.0 positions.
- `BING_POSITION_SCALE` is therefore **1**. It stays a named constant: if a future
  account ever returns the ×10 form (40 = position 4.0), flip it to 10 — that one
  line is the only lever. Always re-confirm against live data before trusting it.
- **Why:** signal thresholds (striking-distance 8–20, highPos 5) are calibrated
  for real positions; a wrong scale silently makes every signal misfire.

## API shapes that matter
- Base: `https://ssl.bing.com/webmaster/api.svc/json/{METHOD}?apikey=KEY&siteUrl=URL`.
  Responses wrapped in top-level `d` array; dates are WCF `/Date(ms-0700)/`.
- A bad/unverified/typo siteUrl returns **HTTP 400** `{"ErrorCode":14,"Message":"ERROR!!! NotAuthorized"}`
  (an error, not an empty 200). So the bad-config case is caught by normal `!res.ok`
  throwing.
- `readApiKey()` only throws on a *missing* key. A *wrong* key (or unverified site)
  fails every call. Guard: if neither primary source (traffic + queries) succeeds,
  **rethrow** the first error so the route returns 502/400 — never persist an
  all-zeros report with HTTP 200 (that would mask a bad key as success). Aggregation
  must also gate on `position > 0` so undated/positionless rows never emit
  "positie 0.0" signals.

## Testing
- Sandbox (`code_execution`) has **no** `process.env`. To call Bing with the real
  key, run a throwaway script via workspace `node` (bash) — bash has the secret and
  network; container `curl` egress is blocked (000). Never print the key.
- The api-server dev workflow is build-then-start (esbuild bundle), so **restart**
  the workflow after editing any lib — tsx-style hot reload does not apply.
- Honest caveat (kept in clients-store markdown + UI copy): Bing's BE/NL market
  share is small — frame it as a complement to Search Console, not a primary source.
