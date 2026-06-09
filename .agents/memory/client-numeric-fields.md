---
name: Client numeric fields (groupId, monthlyFee)
description: How non-string client fields are threaded through the editor form and API, plus the revenue overview.
---

# Numeric client fields live OUTSIDE the string-only FormState

`FormState`/`FieldKey` in `clients-form.ts` are **derived from `ClientInput`** via
`Exclude<keyof ClientInput, ...>`. So the moment you add any field to the Client
schema + OpenAPI, the web typecheck breaks (`EMPTY_FORM` missing the new key)
unless you handle it.

**Rule:** numeric (or otherwise non-text) client fields must be excluded from
both `FieldKey` and `FormState`, then carried separately.

**How to apply** — when adding another numeric/non-string client field, mirror the
`groupId` / `monthlyFee` pattern exactly:
1. `Exclude` it from `FieldKey` AND `FormState` in `clients-form.ts`
   (`formToInput`'s `as unknown as ClientInput` stays sound because the field is
   optional in the generated type).
2. Hold it in its own `useState` in `Clients.tsx` (not in `form`).
3. Mirror it at **every** `groupId` sync site: startCreate, startEdit, closeEditor,
   create onSuccess, update onSuccess, **and the 409-conflict reload**. Missing one
   silently desyncs the editor.
4. Merge it into the save payload alongside groupId: `{...formToInput(form), groupId, <field>}`.
5. Parse/validate server-side; a blank or whitespace-only string means "not filled"
   → return `null`, never coerce to 0 (`Number("")` is 0).

**Why:** `formToInput` only iterates `Object.keys(EMPTY_FORM)`, so anything not in
FormState is dropped unless explicitly merged into the payload; and PUT does a
full replace (omitting a field clears it to null), same as groupId.

# Revenue overview

- `monthly_fee` is a nullable whole-euro integer column; null = "nog niet ingevuld"
  and counts as €0 in totals. Goal constant `MONTHLY_REVENUE_GOAL_EUR` (=10000)
  lives in the api-server clients route.
- `GET /clients/revenue` must be registered **before** `/clients/:id` or Express
  treats "revenue" as an id. Pure DB read, no params, no external calls.
- Dashboard renders header always; `RevenueOverview` and `TeamActivity` each own
  their loading/error state. **Do not** restore a single page-level early-return —
  a team-stats hiccup must never hide the revenue figures (the thing the user
  cares about most).
- Use `Intl.NumberFormat("nl-BE", {style:"currency", currency:"EUR",
  maximumFractionDigits:0})` for full euro figures (€ 3.000), not the abbreviating
  `formatEur` used for the team cost estimate.
