---
name: Self-service deck generation (in-process, bundled server)
description: Lessons from wiring one-click audit/QBR deck generation into an api-server route — the esbuild bundling path trap, the shared-output-slot lock, and where deck-clone must live.
---

# Self-service deck generation

One-click audit/QBR deck generation runs **in-process** inside the api-server
(`POST /clients/:id/generate-deck`), reusing the same clone-and-token-substitute
pipeline as the CLI generator scripts. Output goes to the single shared demo
artifact slot (overwritten per run; durable deliverable stays PPTX/PDF export).

## The esbuild bundling path trap (the big one)
The api-server **dev server is bundled** (esbuild → `dist/`), NOT run from `src/`
via tsx. So a fixed-depth `path.resolve(dirname(import.meta.url), "../../../..")`
computed for the `src/lib/` layout **over-resolves at runtime**: the bundled file
sits at `dist/` (one level shallower than `src/lib/`), so the same number of `..`
segments climbs past the repo root (e.g. `/home/runner` instead of
`/home/runner/workspace`), and template lookups fail with "Source template … not
found."

**Why:** the CLI generator scripts run under tsx (real `src/` paths), so their
fixed `..` depth works — masking the bug until the same logic runs in the bundled
server.

**How to apply:** never hardcode `..` depth to reach the monorepo root from
api-server library code. Resolve it depth-independently by walking up to the
`pnpm-workspace.yaml` marker (`findWorkspaceRoot()` in `deck-generation.ts`),
trying both `dirname(import.meta.url)` and `process.cwd()`. This survives both
tsx and bundled runs.

## Any lib a route needs at runtime must live under `src/`
`deck-clone.ts` originally lived in `scripts/lib/` (CLI-only). The route's bundle
only includes `src/`, so it had to be **moved into `src/lib/`** (both generator
scripts updated to import the new path) before the route could clone decks.

## Shared output slot ⇒ serialize generations
The demo slot is one shared directory; two concurrent generations interleave file
writes and corrupt it. The UI disables both buttons while one runs, but that does
not cover multiple tabs / racing callers. `generateDeckForRow` wraps the work in a
per-slug promise-chain lock (`withTargetLock`) whose chain swallows errors so one
failure doesn't poison the next caller's turn.

## UI/DB gotcha
The route reads the **saved DB row**, not unsaved form state — so the customer ID
must be saved before generating. The Decks section text says so explicitly; the
buttons gate on a non-empty `form.googleAdsCustomerId` only as a first-line guard.
