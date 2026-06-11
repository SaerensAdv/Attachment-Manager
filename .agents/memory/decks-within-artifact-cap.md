---
name: Decks within the 7-artifact cap
description: How QBR/Concurrentie (and any further) decks are delivered when no new artifact slot is free.
---

Replit projects are capped at **7 registered artifacts** (counted by presence of
`.replit-artifact/artifact.toml`). When all 7 are claimed, `createArtifact`
returns `success:false` with error "maximum of 7 artifacts per project" — you
**cannot** register another deck artifact, and you must not delete user-facing
ones (live client decks, system-map, mockup canvas, api-server, the template).

**Pattern (validated against `deck-clone.ts`):**
- Deck TEMPLATES live as plain committed source at repo-root
  `deck-templates/<kind>/` — a COMPLETE deck tree (index.html, vite.config.ts,
  tsconfig.json, full `src/` incl `pages/slides` + `data/` manifest+schema +
  index.css, `public/`, `scripts/validate-slides.ts`) but WITHOUT `package.json`
  and WITHOUT `.replit-artifact`. Consequence: not matched by pnpm-workspace
  globs (`artifacts/*`, `lib/*`, `lib/integrations/*`, `scripts`) so NOT a pnpm
  package; no artifact.toml so NOT counted against the cap; not in root tsconfig
  references so never typechecked standalone.
- `cloneDeck` is reused UNCHANGED: its `sourceDir` may be ANY directory
  (existence-checked only); its `targetDir` MUST be an already-registered slides
  artifact (`assertSafeTarget` needs artifact.toml `kind="slides"` + previewPath
  referencing the slug). `COPY_EXCLUDES` already skips `package.json` +
  `.replit-artifact`, so the target keeps its own. Generators pass
  `--source deck-templates/<kind>`.
- OUTPUT/preview = reuse ONE existing slides artifact (the audit demo
  `audit-car-audio-limburg-demo`) as the shared "generated deck" slot for ALL
  kinds. Each generation OVERWRITES it; only one deck is previewable at a time.
  The DURABLE deliverable is the PPTX/PDF export — export before regenerating a
  different kind. Do NOT rename the demo slug (wired into previewPath/ports/
  workflow); a title-only relabel via verifyAndReplaceArtifactToml is safe.

**Why:** the approved "new artifact per deck" plan is impossible under the cap;
this delivers the same capability with zero new artifacts and nothing protected
touched.

**Gotcha (fixed):** cloneDeck originally only wiped `src/pages/slides/*` +
`slides-manifest.json`, so stale provenance (a prior kind's `*-data.json`)
survived cross-kind regeneration into the shared slot. The wipe now clears all
of `src/data/*` (template overlay restores schema+manifest+.gitignore;
provenance rewritten after).

**How to apply a new deck kind:** `deck-templates/<kind>/` (copy the audit
template minus package.json/.replit-artifact/node_modules) + a
`<kind>-deck-data.ts` (build fn + `toTokenMap`) + a
`GET /clients/:id/<kind>-data.json` route + a `generate-<kind>-deck.ts`
(DEFAULT_TEMPLATE → `deck-templates/<kind>`, provenance `<kind>-data.json`,
default `--slug audit-car-audio-limburg-demo`). Verify by generating the live
client into the demo: pnpm typecheck + validate-slides + supervised screenshot +
PPTX export.
