---
name: Offerte (sales proposal) PDF
description: Why the Saerens offerte deliverable differs from factuur — non-binding hybrid (AI prose + human pricing), separate one-off vs recurring totals, prose-stripping at the route.
---

# Offerte (sales proposal) PDF

Sibling of the factuur deliverable, but a **hybrid**: AI-drafted prose + human-entered
pricing, rendered by a deterministic api-server route (`POST /clients/:id/offerte.pdf`)
into a branded PDF. Reuses the factuur huisstijl PDF primitives (`src/lib/pdf/`,
Helvetica-only, dark header band, per-page footer via `bufferedPageRange()` +
`margins.bottom = 0`).

## Non-binding ⇒ no DB row, no billing precondition
- Unlike factuur, the offerte writes **no DB row** and has **no billing precondition**.
- **Why:** an offerte is a proposal, not an accounting document. Prospects often lack a
  full billing address / monthly fee, so requiring those fields would block the very
  case the feature exists for (sending a proposal to a prospect). It is regenerated on
  demand, so there is nothing to freeze.

## One-off vs recurring totals MUST stay separate
- Each line carries `recurrence: "eenmalig" | "maandelijks"`. The PDF prints **two
  independent total rows** (eenmalig sum, maandelijks sum) and never combines them.
- **Why:** merging a one-time setup fee with a monthly retainer into one number
  misrepresents what the client actually pays now vs every month.

## Prose is stripped at the ROUTE, not the lib
- The route runs `toClientFacingReport` (exported from `generate-engine.ts`) over the
  pasted prose to drop internal-only headings and `[AAN TE VULLEN]` placeholder-only
  sections before rendering. The PDF lib stays pure (no stripping inside it).
- **Why:** prose is often pasted straight from an internal AI draft that still contains
  "Interne nota's" / placeholders; stripping at the boundary keeps the lib reusable and
  testable, and is a safety net independent of the UI.
- **How to apply:** any future deliverable that renders human-pasted AI prose should
  strip at the route boundary the same way; only the `export` keyword was added to
  `toClientFacingReport` (body unchanged) so the monthly-report path is untouched.

## Money + VAT conventions (same as factuur)
- UI/route accept euros (`amountEur`), converted to **cents** at the route boundary via
  `Math.round`; the lib renders from cents. Validation: 1..25 lines, non-empty label,
  finite `amountEur ≥ 0`, recurrence enum, prose ≤ 50k chars.
- `btwNote` derived from the client's `btwMode` (verlegd → `REVERSE_CHARGE_NOTE`),
  matching the factuur convention.

## Layout guard
- A page-break guard runs **before** the totals block (`addPage()` if `doc.y` is within
  ~90pt of the bottom margin) so the totals + notes can never render into the footer on a
  long-prose offerte (drawTable page-breaks on its own, but the manually-positioned
  totals rows do not).
