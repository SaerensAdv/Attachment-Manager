---
name: Crawl snapshot history
description: How the monthly Screaming Frog crawl history (month-over-month comparison) is stored and kept deduped per day.
---

# Crawl snapshot history

A client record keeps only the *latest* crawl (read by the agents); a separate
`crawl_snapshots` store keeps the trail so the agency can compare a client's
technical SEO month over month.

- **Self-bootstrapped table, not drizzle.** Like the pgvector cache, `crawl_snapshots` owns its own table via `CREATE TABLE IF NOT EXISTS` + additive `ALTER`/`CREATE INDEX IF NOT EXISTS`. **Never** drizzle-push it — push drops unmanaged tables.
- **One snapshot per client per calendar day, enforced at DB level.** Unique index on `(client_id, crawled_day)`; writes are a single `INSERT ... ON CONFLICT DO UPDATE` upsert.
  - **Why:** delete-then-insert (the first cut) can duplicate or drop a day under concurrent uploads; the unique constraint + atomic upsert is the only race-safe path.
  - **How to apply:** the dedup key `crawled_day` is computed in app (`crawledAt.toISOString().slice(0,10)`, UTC) and stored explicitly — a `timestamptz::date` *index expression* is rejected as non-immutable, so don't try to index the cast.
- **Best-effort, never throws.** A snapshot failure must not undo the upload (latest crawl is already stored on the client); list degrades to `[]`. Recording is wired into both crawl write paths (secret-authed intake + in-app upload).
- **Frontend comparison** lives on the Crawl upload page: a master "Klant" selector drives both bulk file-assignment and which client's history table is shown; delta vs the previous crawl is green when an issue counter drops, red when it rises, neutral for volume metrics (URLs, redirects).
