---
name: Team page & portrait foundation
description: How team personas, portraits, and style examples are wired across api-server + system-map.
---

# Team page & portrait foundation

The `/team` route (system-map) + `/api/team` (api-server) expose all agents as a
roster with parsed persona fields, graph connections, and portraits.

## Object-storage layout (public search path)
- `portraits/<slug>.png` — the chosen portrait for an employee. Drop one file to
  make it appear on the Kaart (circular node) + Team page. No restart needed.
- `portrait-styles/<slug>-<style>.png` — style-direction examples; `<style>` ∈
  `editorial | photographic | avatar` (see `lib/portraits.ts` PORTRAIT_STYLES).
- `<slug>` = agent filename without `.md`. Slugs can contain hyphens, so the
  index matches the `-<style>` suffix against known keys, not a naive split.

**Why:** the coupling is deterministic and follow-up only has to upload files.
**How to apply:** `loadPortraitIndex()` lists the bucket at request time and is
best-effort — any storage error yields placeholders/press-seal fallbacks, never
an error. So new uploads show up on next request without restarting api-server.

## Uploading from the container
`tsx` is NOT installed; api-server builds via esbuild (`build.mjs`). For one-off
uploads, run a plain `node` `.mjs`/`-e` script using `@google-cloud/storage`
with the Replit sidecar credentials (endpoint `http://127.0.0.1:1106`, the same
block as `lib/objectStorage.ts`). `process.env.PUBLIC_OBJECT_SEARCH_PATHS` is a
`/<bucket>/<baseDir>` path → split into bucket + baseDir; upload to
`<baseDir>/portrait-styles/...`. The code_execution sandbox has no `process.env`,
so do uploads from bash/node, not the sandbox.

## Chosen portrait direction
The user picked the **photographic** direction (real studio headshot, soft window
light, neutral warm-grey background, dark top) for the full 18-employee set, NOT
editorial — even though the app's overall brand is editorial "Newsroom". The
three pre-existing `photographic` style examples (orchestrator=Lotte,
copywriter=Marie, analytics-tracking-specialist=Ruben) were promoted as-is to
`portraits/<slug>.png`; the other 15 were generated to match that art-direction.
**Why:** the style choice was not recorded anywhere in code/docs, so always
confirm the chosen direction before regenerating the set.

## Image generation gotcha
`generateImage` flat/avatar styles sometimes bake in name/role TEXT despite a
negative prompt; add an explicit "plain empty background with no text anywhere"
to the positive prompt and regenerate the offending one.
