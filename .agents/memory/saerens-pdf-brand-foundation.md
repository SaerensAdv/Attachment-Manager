---
name: Saerens PDF + brand foundation
description: Where the shared huisstijl lives and how branded PDFs are built (shared package + extracted pdfkit primitives).
---

# Shared brand + PDF foundation

**Single source of truth for the huisstijl** is the `@workspace/brand` workspace
package (`lib/brand`): TS token constants (`colors`, fonts) → a GENERATED,
committed `brand.css` (`:root --slide-*` vars). Web decks `@import
"@workspace/brand/brand.css"` and keep their own `@theme inline` mapping; the PDF
side imports the TS `colors`. A drift guard (`pnpm --filter @workspace/brand run
check`, tsx not vitest) fails if `brand.css` is stale — re-run `generate` after
editing tokens. Composite ref trap: `tsc -b lib/brand` must run before
api-server typecheck or you hit TS6305.

**Branded PDFs** are hand-drawn with pdfkit (no Chromium). Reusable primitives
live in `artifacts/api-server/src/lib/pdf/` (theme, format=nl-BE eur/int/dec,
core=geometry+rich text, blocks=glow/kpiCards/sectionTitle/chartLabel,
charts=hbarChart, table=pipe-table, markdown=md subset). `report-pdf.ts` is now a
thin composition (cover + charts + markdown) over those primitives, reused by the
one-pager / factuur / offerte deliverables.

**Why:** the agency wanted ONE huisstijl across web decks AND PDFs; duplicating
hexes drifted. Tokens-in-TS + generated CSS keeps both sides honest with a guard.

**How to apply:** never hardcode brand hexes in a new PDF/deck — import from
`@workspace/brand` (TS) or `@import` the css (web), and build new PDF surfaces
from `src/lib/pdf/*` primitives. Keep PDF on built-in Helvetica (TTF embedding is
a scope trap). The two LIVE client decks and the monthly-report-email approval
flow must never regress; `renderReportPdf` signature + payload parsing are stable.
