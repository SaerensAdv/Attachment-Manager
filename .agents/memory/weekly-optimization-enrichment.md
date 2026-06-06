---
name: Weekly account-optimization enrichments (live data + monitor list)
description: Durable decisions and quirks for the optimization read, the cross-campaign positive side, and the persistent monitor list.
---

The weekly account-optimization feature (`negative-keywords-csv` deliverable) reads
live Google Ads data and persists a monitor list across weeks. Durable rules below.

## Impression-share GAQL quirk
A campaign impression-share query fails with `EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE`
when `ORDER BY` references a metric that is not in the SELECT clause.
**Rule:** any field used in ORDER BY must also appear in SELECT (e.g. add
`metrics.cost_micros`). Applies to every GAQL query, not just this one.

## Cross-campaign routing has two sides (Axel's decision)
A mis-routed term gets a cross-campaign negative AND a named positive (term → correct
campaign + ad group + match type). **The positives are named in the analysis only —
never written into the negatives CSV.** Axel applies them by hand.
**Why:** he wants editorial control over additions; the CSV is for exclusions only.
**How to apply:** the live read must include ad-group structure so the positive side
names a real ad group, not an invented one.

## Monitor list — persistent across weeks
**Capture is an invisible HTML-comment side channel** (`<!-- monitor-list [json] -->`),
same pattern as `<!-- deliverable: kind -->`. HTML comments never render (no rehype-raw),
so the block must be parsed and **stripped from priorWork unconditionally — even on an
aborted run** — or it leaks into the deliverable and the archived markdown.
**Persistence is append-only:** upsert by client + normalized (term, campaign); a term
never gets deleted, it only leaves the active list via its `status`
(`monitoring`/`resolved`/`excluded`, coerce anything else to `monitoring`).
**Dedupe before writing:** the team can list the same term twice in one block; collapse
input by normalized key and keep the in-memory key map current after each insert, or you
get duplicate rows (there is no DB unique constraint — term/campaign are stored raw).
**Re-injection is decoupled from the live read:** resurface prior monitor terms whenever
the client exists, regardless of whether the live Google Ads fetch succeeded or the client
has a customer ID. Coupling it to live-fetch success silently drops the list on any fetch
failure.

## Escalation rule (Axel's decision)
A relevant-but-not-converting term is **never excluded outright**. Escalate by fixing the
cause: **landing page first, then bid**; exclusion is the last resort, only after those
interventions and the term still fails over time. The persisted age (`weeksMonitored`)
exists so stale terms surface and get escalated instead of lingering unseen.
