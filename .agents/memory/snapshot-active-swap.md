---
name: Atomic active-snapshot swap
description: Why the single-active-row swap must be an ordered transaction, not a data-modifying CTE, against a partial unique index.
---

# Swapping the single "active" row under a partial unique index

When a table enforces "exactly one active row" with a **partial unique index**
(`... WHERE status = 'active'`), promoting a new row to active while demoting the
old one MUST be two ordered statements inside one transaction:

1. `UPDATE ... SET status='superseded' WHERE status='active' AND id <> $new`
2. `UPDATE ... SET status='active' WHERE id=$new`

**Why:** A single data-modifying CTE (`WITH deact AS (UPDATE ... superseded) UPDATE ... active`)
does NOT work. Postgres runs all CTE sub-statements against **one table snapshot
with unpredictable ordering**, so the partial unique index can transiently see
two `active` rows and throw `duplicate key value violates unique constraint`.
The symptom is silent in the happy path only while the table is empty — it fires
the moment a prior active row already exists, so every real re-sync fails and the
new snapshot never activates (the old one is left in place by the catch).

**How to apply:** Acquire a pooled client, `BEGIN`, run the supersede FIRST (so
the old row leaves the partial index), then the activate, then `COMMIT`
(`ROLLBACK` + rethrow on error, `release()` in finally). The transaction keeps
the swap atomic so a concurrent reader never sees a zero-active gap. A partial
UNIQUE INDEX cannot be made DEFERRABLE (only table CONSTRAINTs can, and those
cannot be partial), so deferring the check is not an option — ordering is.

Applies to `graph_snapshots` (workspace graph) and any future single-active-row
pattern (e.g. a "current" published version).
