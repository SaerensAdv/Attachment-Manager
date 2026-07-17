---
name: Workspace Graph normalized model (Fase 3.5)
description: The one backend graph contract — namespacing, provable-only edges, repo→node mapping, denylist, pure builder seam.
---

# Workspace Graph normalized model

A NEW view (sibling to the existing doc-map GraphViewer, not a retrofit) that unifies
ClickUp workspace structure + repo agents/workflows/SOPs + app clients + live push flows
into one normalized graph. Backend-first; coexistence, never retrofit the coupled
`GraphViewer.tsx`.

## Namespacing — cross-source id collisions must be impossible
Every node id is `{source}:{sourceType}:{rawId}` (`nsId()` in `lib/graph/types.ts`).
A ClickUp task, a workspace and a Replit run can all share raw id "123" and stay distinct
(`clickup:task:123` ≠ `clickup:workspace:123` ≠ `replit:run:123`).
**Why:** brief §7.9 requires provably-unique ids across three independent sources.

## Provable-only edges — never invent a relationship
- `contains` = structural hierarchy ONLY (ClickUp workspace→space→folder→list→task,
  workspace→doc→page tree).
- `references` = repo doc-graph reference/mention/**flow** passes.
- `executes` = repo doc-graph **routing** pass (orchestrator routing table).
- `related_to` = app client ↔ its ClickUp company task, via the stored `clickupCompanyId`
  back-reference (undirected).
- `generated` = a Replit run → the ClickUp task it produced (push record).
- `writes_to` = the Replit→ClickUp push integration → the tasks it writes.
No name-similarity, LLM, or guessed edges (brief §7.4). A doc-edge whose endpoint maps to
an out-of-scope node is dropped (that is NOT a hierarchy orphan).

## Repo doc category → normalized node
`agent→agent`, `workflow→workflow`, `knowledge→sop` (all `source:"github"`, slug = path
minus category prefix minus `.md`). **`template` and `core` are EXCLUDED** — the §7.3
`sourceType` vocabulary has no slot for them and they are internal scaffolding/meta.
Client nodes are built from the **DB** (not the doc-graph's synthetic `clients/db/*.md`)
so the row's `clickupCompanyId` is available for the `related_to` link.

## Orphans kept, never dropped (brief §7.9)
A node whose contains-parent was not crawled keeps `metadata.orphan=true` and gets NO
contains edge (never dropped). Cross-source edges (client↔company, push→task) that point
at an un-crawled ClickUp task CREATE a minimal orphan task node (real deeplink url) so the
edge is valid and the object stays findable.

## Content-free payload = the denylist boundary
`GraphNode.metadata` may only hold keys in `ALLOWED_METADATA_KEYS`. There is deliberately
no allowed key for descriptions / custom-field values / emails / account ids, so sensitive
content cannot ride along (brief §3.2/§7.4/§10). A unit test asserts every node's metadata
keys are within the allowlist over a full graph.

## Pure builder seam
`buildGraph(input)` in `lib/graph/build.ts` is PURE — it takes already-fetched, content-free
source data (no fetch, no DB) and is unit-tested with fixtures. Live collection (calling the
`clickup-structure` readers + DB) belongs in the sync/collect layer, not the builder.
**Why:** keeps the provable-edge/orphan/cycle logic fast and deterministic to test.

## Sync collection = partial-crawl policy (required vs best-effort)
`collect.ts` treats the ClickUp **workspace + spaces** crawl as the required structural
backbone: if either fails it returns `ok:false` and the sync route calls `failSync` + 502,
leaving the prior snapshot untouched. **Everything else is best-effort** (a single list's
tasks, a doc's pages, the docs list, DB clients, the push ledger) — a failure is recorded in
`errors[]` (surfaced as a "Gedeeltelijk" note) and just yields fewer nodes, never an abort.
**Why:** brief §7.5 — a partial/failed crawl must never corrupt the last good snapshot; but a
total ClickUp outage must not silently replace a rich graph with a thin one.
**Accepted risk:** if *many* per-list task crawls fail the sync still activates a thinner
graph (hash differs → supersedes the good one). If this bites, abort when a large fraction of
list crawls fail.

## Read routes serve the snapshot, never the sources
The 5 routes (`overview`/`neighbors/:id`/`search`/`sync` POST/`sync-status`) read the
in-memory active snapshot (hydrated from DB on first use); the browser never touches ClickUp.
`overview` is capped structure-first (~250 nodes/~500 edges), excludes closed tasks, caps
tasks per list, prunes edges to kept endpoints, and sets an honest `truncated`. `search` runs
over the WHOLE graph (finds nodes not in the overview). `sync` POST is owner-gated (`isOwner`)
+ `isSyncing`/`beginSync`-null → 409. Every response is runtime-parsed through the generated
zod schema, so the OpenAPI contract is enforced, not aspirational.

## Postgres rejects UPDATEs with unreferenced bound params
The snapshot-store no-op freshness bump once bound `[current.id, sourceUpdatedAt]` but its SQL
only referenced `$2` (`WHERE status='active'`), so `$1` was unreferenced. Postgres rejects
that at runtime ("could not determine data type of parameter $1") — but a **SQL-text-routed
`pool.query` mock cannot reproduce param-type inference**, so every unit test stayed green.
**How to apply:** when a query binds N params, its SQL must reference `$1..$N`; add a test
asserting both the WHERE clause (`WHERE id = $1`) and the bound value, since the mock won't
catch a dropped reference on its own.
