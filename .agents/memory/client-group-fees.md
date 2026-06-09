---
name: Client & group monthly fees (revenue model)
description: How per-client and per-klantgroep fees feed the €10k revenue dashboard, the double-count rule, and the live-edit hazard.
---

Both clients (`clients.monthly_fee`) and client groups (`client_groups.monthly_fee`) carry an optional integer monthly fee. `/clients/revenue` returns `totalMonthlyFeeEur = sum(client fees) + sum(fee-bearing group fees)`, plus `clients[]` and `groups[]` (groups filtered to fee>0). The Dashboard merges both into one breakdown tagged Klant/Groep, with composite React keys `${kind}-${id}` (client and group ids collide).

## Double-count rule
There is NO server guard: if a client has a fee AND its group also has a fee, BOTH count toward the total. Track each relationship at exactly ONE level — either the group fee (and keep member fiche fees empty) or the fiche fees (and keep the group fee empty). Some relationships are billed at group level (e.g. LCS, Schoonpannendak BV); their member fiches must stay fee-less.
**Why:** the dashboard headline is "omzet vs €10k doel" — a silent double-count makes it wrong; this already caused confusion once when a group fee was mistaken for a leftover and wiped.
**How to apply:** when setting a group fee, confirm no member fiche carries a fee (and vice versa). A visibility warning (per-group member-fee sum in the revenue payload + a badge in GroupFeeEditor/Dashboard) is a known, not-yet-built follow-up.

## Empty groups must stay editable
A klantgroep surfaces as a register header when it has members OR a fee>0 (not members-only). This keeps fee-only agency groups with zero client fiches (e.g. SIX agency) visible so their fee can be edited inline.

## Live-edit hazard
The user edits this data in the running app while you work. Before overwriting a fee via SQL/API, read the current DB row + `updated_at` and respect the user's live values — do not assume your earlier-set value still holds. A clobbered value can be reconstructed from the api-server request log (look for `PUT /api/clients/:id` or `PUT /api/client-groups/:id` lines with timestamps).
