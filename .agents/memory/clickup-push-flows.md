---
name: ClickUp push flows (Fase 3) + Internal Work live schema
description: How Replit→ClickUp report/search-terms/alert pushes behave against the REAL central Internal Work list, and how to live-smoke them read-only.
---

# Replit → ClickUp push flows (Fase 3)

Three idempotent, retry-safe, dry-run-default flows push Replit output into ClickUp
(ClickUp = source of truth): report (per-client report list), search-terms + alerts
(central **Internal Work** list, `DEFAULT_INTERNAL_WORK_LIST_ID`).

## The central Internal Work list has a GENERIC PM schema — not a reporting schema
Live inspection of the Internal Work list revealed:
- statuses: `to do` (open) / `in progress` (custom) / `complete` (closed)
- fields: `Decision required` [checkbox], `Work type`/`Work area`/`Source` [drop_down],
  `Related Company or Product` [url], `BASELINE_*` [multi_key]
- It does **NOT** have the rich reporting fields (`Record type`, `Company`,
  `Period start/end`, `Report URL`) — those exist only on per-client report lists.

**Why this matters:** the search-terms + alert flows resolve custom fields by name at
runtime (names carried over from the report flow). On Internal Work those names don't
exist, so field-enrichment **no-ops by design** and `fieldsSet` is empty. This is
brief-compliant (§6.4 "inspect the live location, don't hardcode") — all required
content (metadata, alert body, evidence, source run id) goes in the **markdown body**,
plus the import-ready **CSV attachment** for search-terms.

**How to apply:** do NOT treat the empty `fieldsSet` on Internal Work as a bug. If
Axel wants richer Internal Work tasks, map onto its REAL fields (`Decision required`
checkbox = true fits review/alert tasks; `Related Company or Product` url) — but confirm
the dropdown option values and get his sign-off first; the brief does not require it.

## Status resolution is safe on any list
`resolveStatus(statuses, preferred[])` tries exact→partial (case-insensitive) match,
then falls back to the first `type==="open"` status (else `statuses[0]`, else null;
createTask omits status when null). So search-terms' preferred `"Ready for review"`
(absent on Internal Work) safely degrades to `"to do"` — a non-existent status name is
never pushed.

## Live read-only smoke technique
Run a throwaway `npx tsx` script from `artifacts/api-server` — the shell has
`CLICKUP_API_TOKEN` + `DATABASE_URL` (the code_execution sandbox strips them). Call the
real flows with `dryRun: true`: dry-run returns **before** any claimPush/createTask, so
it writes nothing while still exercising `getListDetail`/`getListFields` against live
ClickUp and printing the resolved preview (status, name, fieldsSet). The pg Pool is
lazy, so importing `idempotency` without querying is safe. Delete the temp script after.
Never console.log the token or full report content.
