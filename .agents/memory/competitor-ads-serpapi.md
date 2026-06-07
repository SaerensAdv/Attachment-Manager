---
name: Competitor ads via SerpApi
description: Read-only competitor-ad intelligence (Google Ads Transparency Center) — provider boundary, cost/caching rules, and the cached-injection design.
---

# Competitor ads (SerpApi, read-only)

Mirrors the google-ads.ts pattern: fetch → cache → signals → inject. Source is
SerpApi's `google_ads_transparency_center` engine (Google has NO official
Transparency API). Provider is kept behind one thin call (`serpApiSearch`) so a
cheaper provider (DataForSEO) can swap in later without touching callers.

**Cost is per-call, so caching is mandatory.** Design decisions:
- Cache TTL is longer than Ads (60 min) and the cache key MUST exclude the API
  key (key is just auth, not part of the query identity).
- The basic Transparency call returns format + first/last shown + total_days_shown
  ONLY — NOT creative text. Creative text needs the pricier `ad_details` endpoint;
  deliberately skipped. Don't promise ad copy from the basic call.
- A target is an advertiser_id when it matches `^AR\d+$` (case-insensitive),
  otherwise it's treated as free text / domain.

**Why cached-injection (not per-run fetch):** competitor data is injected into
EVERY run via `clientToMarkdown` (same as `googleAdsLive`), reading the persisted
`competitorAdsLive`. A manual refresh route repopulates the cache. Per-run live
fetch was rejected — it would bill SerpApi on every generation.

**Signals are not optional plumbing — wire them in.** `competitor-signals.ts`
(pure fn) must be appended into `fetchCompetitorAds().text` under a "Signalen"
section, or it becomes dead code and the "signals" step silently disappears from
runtime. A test asserts the section is present.

**Per-client field:** `competitorAdvertisers` (newline list) is editable;
`competitorAdsLive` / `competitorAdsLiveAt` are set only by the refresh route.

**Sandbox can't see secrets** (`SERPAPI_API_KEY`) — verify live only via
workspace `node`, never the code_execution sandbox or container curl.
