---
name: Persistent doc embeddings (pgvector)
description: Why the semantic-search embedding cache is a self-bootstrapping pgvector table owned outside the Drizzle schema, and the contract that keeps it safe.
---

# Persistent doc embeddings (pgvector)

The doc-graph sentence embeddings are persisted in Postgres (pgvector) so a cold
start reuses vectors computed in a prior run instead of re-embedding the whole
corpus. The cache table is bootstrapped with idempotent raw SQL
(`CREATE EXTENSION IF NOT EXISTS vector` + `CREATE TABLE IF NOT EXISTS ...`) on
the shared `@workspace/db` pool, keyed by doc path + content hash + model + dim.

**Why NOT a Drizzle schema column:** prod reconciliation runs `drizzle-kit push`
(push-based migrations, no migration files). push does **not** reliably create
the pgvector extension *before* a `vector` column, so adding the embedding table
to the shared schema risks breaking **every** deploy's push on extension
ordering. The embedding cache is an implementation detail of semantic search
(sole consumer), so it owns its own table out-of-band instead. Do not move it
into `lib/db/src/schema` without solving extension-ordering in the push flow.

**Non-regression contract (must never regress):** every store op is best-effort.
Table init is memoized and retries on failure; load/upsert/delete each swallow
errors (return `[]` / no-op) so a DB outage degrades silently to the in-memory
compute path. Search-side wiring (`semantic.ts`) seeds the in-memory cache once
via a memoized in-flight promise (`seedOnce` — avoids concurrent first queries
each recomputing), then fire-and-forget (`void`) upserts fresh vectors and
deletes vectors for removed docs. Never let a persistence failure throw into the
search hot path.

**Model/dim:** `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, dim 384,
normalized so dot product = cosine. Vectors round-trip as the pgvector text
literal `[v1,v2,...]` (insert `$n::vector`; parse stored text with `JSON.parse`).
Loads are filtered by `model` AND `dim` so a future model swap won't read
incompatible vectors.

**How to apply:** when changing the embedding model or dim, the `model`/`dim`
filter naturally invalidates old rows (stale rows are simply never matched and
get overwritten/pruned). For DB-side ANN at larger scale (Phase 4 memory), add
a pgvector index — but keep the self-bootstrap, don't couple to drizzle push.
