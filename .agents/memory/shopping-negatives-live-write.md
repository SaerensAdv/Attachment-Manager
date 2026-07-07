---
name: Shopping search-term exclusion (first live write)
description: Safety invariants for the app's first-ever LIVE Google Ads write — the Shopping negative-keyword exclusion tool.
---

# Shopping search-term exclusion — the app's first LIVE write

Client-agnostic tool: per Shopping ad group, score its triggering search terms
against that ad group's products (deterministic + best-effort Anthropic LLM +
learned rules), operator keeps/excludes, then optionally writes negative
keywords to the LIVE account. Previously the whole app was strictly read-only,
so this is the first mutation path and its guards must never regress.

## Guard chain (do not weaken)
- **Dry-run is the default.** Apply route: `dryRun = body.validateOnly !== false`
  — only an explicit `false` reaches the write path. A dry-run claims nothing
  and persists nothing.
- **Real write also requires a per-client switch** (`getWriteEnabled(clientId)`),
  else 403. Two independent gates: explicit `validateOnly:false` AND the switch.
- **Session-gated:** shopping paths are deliberately NOT in the `requireAuth`
  allowlist in app.ts, so the live-write endpoint is never publicly reachable.
- Frontend mirrors this: live button disabled unless `writeEnabled` (server
  truth via settings query) + a second explicit confirm; dry-run and live are
  separate buttons. Server re-enforces regardless of UI.

## Exactly-once (never double-push)
- `claimDecisionForApply` is a true CAS: `UPDATE ... WHERE status='pending' AND
  decision='exclude' RETURNING *`. Claim BEFORE the single live mutate; a
  concurrent loser gets no row and is reported "skipped".
- `revertDecisionToPending` reverts only rows still in 'applied', on per-op
  failure.
- **DUPLICATE is treated as success** — this absorbs the one unavoidable gap
  (network failure *after* Google committed, then revert+retry): the retry sees
  DUPLICATE and moves on. Keep this.
- Batch-fatal classification: auth(401/403)/429/5xx/network throw → break the
  loop; per-op 4xx returned as failed/duplicate. `saveShoppingDecisions` upsert
  preserves 'applied' so a re-save can't reopen an applied decision.

## The 50-op cap must stay in lockstep front↔back
`addAdGroupNegativeKeywords`: one REST call per op (v24
`adGroupCriteria:mutate`), asserts `negative:true`, text ≤80, hard cap
`MAX_NEGATIVE_OPS=50` (400 over that). **The frontend must chunk applies into
batches of ≤50** (APPLY_BATCH_SIZE) — otherwise a run with >50 saved excludes
(plausible) makes both dry-run and live apply permanently 400 with no way
forward. If you ever change one cap, change both.

## Verifying live without writing
- `fetchShoppingTermRelevanceData` shape: `adGroups[].searchTerms` (NOT `terms`)
  and `adGroups[].products`.
- Quick live check: run tsx from **inside artifacts/api-server** (relative
  imports need that cwd) and **skip the LLM scoring** in throwaway tests — it's
  slow and times out the shell. Test read → `validateOnly:true` mutate directly.
- A correct dry-run returns per-op `status:"created"` with nothing written and
  the server logs `validateOnly:true, created:N`.
- First real client: Goedkoopdrank (client id 15, googleAdsCustomerId
  2906723879).
