---
name: Client DB ↔ doc-graph bridge
description: How DB-managed clients are merged into the markdown "brain" so routing/intake/generation/graph treat them like filesystem client docs.
---

# Client DB ↔ doc-graph bridge

DB clients (Postgres) are surfaced to the rest of the system as synthetic
markdown docs, NOT as a separate data path. A DB client row is rendered to
markdown and exposed as a `DocFile` with category `client` and a synthetic
path `clients/db/<id>.md`.

**Why:** the whole product (routing, intake, generation, graph) already reasons
over `DocFile`s loaded from the filesystem. Bridging DB clients into that same
shape means none of those consumers need a parallel "is this a DB client?"
branch — they just receive extra docs.

**How to apply:**
- The doc layer accepts injected extra docs: `getDocGraph(extra=[])` /
  `getDocFile(path, extra=[])`. Every consumer that resolves client docs must
  pass `await loadClientDocs()` as that extra set (docs graph+content routes,
  route.ts, intake.ts, generate.ts via its generation context `extraDocs`).
  Forgetting one means DB clients silently disappear from that surface only.
- Filesystem client seeds (`clients/_template.md`, `clients/client-example.md`)
  stay read-only; the Klanten page manages ONLY DB clients.
- After any client mutation the frontend must invalidate BOTH the clients query
  key and the doc-graph query key — otherwise the Genereren dropdown / Kaart
  graph keep serving a stale client list.

## API shape gotchas
- `PUT /clients/:id` is a FULL replace: any field omitted from the body is set
  to null. The Klanten form always submits every field, so this is intended —
  do not switch a partial-update caller onto PUT expecting merge semantics.
- Express 5 auto-catches rejected async handlers → a DB-connection failure in
  the clients/docs routes becomes a generic 500 (the docs route is unguarded by
  the same convention). Application-level errors (validation, not-found) are
  handled explicitly as 400/404.
