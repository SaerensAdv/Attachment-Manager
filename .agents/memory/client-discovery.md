---
name: Client discovery + enrichment
description: Read-only discovery of new clients (Ads MCC + Search Console) and missing-key enrichment of existing clients, plus the apply-route data-integrity invariants.
---

# Client discovery + enrichment

Discovery is READ-ONLY and never mutates. It returns a review proposal the UI renders;
the user confirms before anything is created/filled (apply route). Two best-effort
sources (one can fail and the other still returns): Google Ads MCC child-accounts
(`listAdsAccounts`, skip managers/disabled) + Search Console verified sites
(`listSearchConsoleSites`, owner/full only).

## Matching rules (client-discovery.ts) — keep conservative
- **Enrichments** (fill ONE missing key on an existing client) only on a *confident*
  match: exact normalized-domain equality (client website host vs SC domain, www
  stripped) OR exact normalized-name equality (Ads account name vs client name). A
  name match must be unique (exactly one Ads account) or it is dropped.
- **New Ads candidates** attach an SC site only on a **unique exact** base-name match
  (`siteBaseName(domain) === normalizeName(account)`, exactly one qualifying domain).
  Do NOT reintroduce `startsWith`/prefix fuzzy attach — Ads candidates are pre-checked
  in the UI, so a wrong attach silently seeds a bad key on create.
- SC-only new candidates default UNCHECKED in the UI; Ads candidates default checked.

**Why:** false positives here are worse than false negatives — a review list can miss a
link the user adds by hand, but a wrong pre-checked link gets written on confirm.

## Apply route invariants (clients.ts `POST /clients/discovery/apply`)
- **Never clobber an existing value.** Enrichment is a single atomic conditional UPDATE
  `WHERE id=? AND (col IS NULL OR col='')` + `.returning()`; only count success when a
  row comes back. If 0 rows, re-select to distinguish "niet gevonden" vs "al ingevuld".
  Do NOT go back to SELECT-then-UPDATE — that races a concurrent writer.
- **No duplicate clients.** Before inserting new clients, load all clients once and build
  taken-sets of normalized name (lowercased), Ads-ID digits-only, and lowercased SC URL;
  skip+report a candidate that collides, and add each insert to the sets so a within-batch
  duplicate (same payload twice) is also caught. There are NO DB unique constraints, so
  this app-level guard is the only protection.
- All review values are user-editable, so re-validate every field server-side
  (`validateAdsId`/`validateScUrl`) — never trust the discovery payload.

## Testing
- Test via workspace `node` fetch to `https://$REPLIT_DEV_DOMAIN/api/...` (container has
  secrets+egress; curl is blocked, code_execution sandbox lacks secrets).
- **api-server tsx watch does NOT hot-reload route changes** — you MUST restart the
  `artifacts/api-server: API Server` workflow before live-testing, or you test stale code
  (this once created real duplicate rows against the un-reloaded server).
- `GET /clients` returns `{ clients: [...] }`, not a bare array.
- Route ordering: register `/clients/coverage` and `/clients/discovery` BEFORE
  `GET /clients/:id` so `:id` doesn't capture them.

## Other routes
- `GET /clients/coverage` — cheap per-client gap matrix (which keys set + last live).
- `POST /clients/:id/refresh-all` — best-effort loop over every configured integration,
  returns per-integration `{integration,status,detail}` (refreshed/skipped/error).
