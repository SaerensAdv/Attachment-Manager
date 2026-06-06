---
name: In-app persona + portrait editing
description: How team personas and portraits are edited from the app and persisted back to agent markdown / object storage.
---

# In-app persona + portrait editing

The Team profile dossier (system-map `/team`) can edit an agent's persona text
and upload a portrait; both persist server-side and reflect everywhere at once.

## Persona write is a surgical markdown rewrite
`updateAgentPersona(slug, fields)` (api-server `lib/team.ts`) edits the agent
`.md` in place: it upserts the `- **Label:** value` bullets under the
"Character & personality" heading (empty value removes that bullet) and replaces
the first prose paragraph of the Role section. Everything else is preserved
verbatim.
**Why:** the docs are the source of truth for the whole map (titles, edges,
persona); a full regeneration would lose hand-written structure and churn edges.
**How to apply:** any new editable persona field must (1) be added to the
openapi `UpdateAgentPersonaBody`, (2) map to a bullet label in `PERSONA_FIELDS`,
and (3) round-trip through the same parse used by `getTeamRoster`. Always guard
the write with a no-op check (`next !== doc.content`) so an unchanged save never
bumps the file or invalidates doc caches.

## Portrait upload
`POST /team/:slug/portrait` takes a base64 JSON body (data-URL prefix tolerated),
sharp-normalizes to PNG capped at 1024w, and `savePortrait` writes
`portraits/<slug>.png`. The JSON body limit for `/api/team` is raised to ~12mb
in `app.ts` (a route-scoped `express.json` before the global one) because base64
images exceed the default 100kb.

## TESTING GOTCHA — uploads hit real object storage
There is no separate dev bucket: posting to `/team/:slug/portrait` overwrites the
real agent portrait immediately. If you test with a throwaway image, restore the
original by re-uploading `attached_assets/generated_images/<slug>-portrait.png`
through the same endpoint (its base64). Prefer testing the error paths (404 / bad
image) and a no-op persona PUT (same values back) instead of clobbering a face.
