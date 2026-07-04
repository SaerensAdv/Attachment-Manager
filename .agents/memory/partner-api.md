---
name: Partner API (spun-off projects)
description: Design decisions/invariants for the /api/v1/partner surface and its key management.
---

# Partner API — durable decisions

Versioned partner API (`/api/v1/partner/...`) lets spun-off projects read client
state + latest deliverables, write events back as new current state, trigger a
generation, and poll it. Legacy `x-trigger-secret` autonomous path stays as-is.

## Two-plane auth (do not collapse)
- **Partner plane** authenticates with a long-lived `sap_` key (only the hash is
  stored; plaintext shown once). Its router MUST be mounted BEFORE the session
  `requireAuth` gate, or the owner gate 401s legitimate keyed calls.
  **Why:** partners are not logged-in operators.
- **Operator plane** = key management (issue/list/revoke) lives UNDER
  `requireAuth` (mounted via routes/index.ts). Minimal, no full UI is intended.
  **Why:** only the human operator may mint/revoke keys.
- Scopes read/write/trigger gate each partner endpoint; empty/unknown → full set.

## Trigger runs synchronously to completion — intentional
- The trigger endpoint awaits `runGeneration` (autonomous engine) and returns the
  archived id + status; the poll endpoint is for re-fetching later.
- **Why:** the engine only creates the generations row during archival, so there
  is no id to hand back before the run finishes; and background/un-awaited long
  runs are the fragile path (see triggering-autonomous-runs.md). Making trigger
  truly fire-and-poll requires pre-creating the row — a real engine change.

## Invariants that must not regress
- CORS: config-driven allowlist, credentials ON, origin reflected not wildcarded;
  a request with NO Origin header is always allowed (curl/same-origin/server-to-
  server partner calls). See cors-origins.ts.
- Partner client reads are curated: never expose billing/VAT/integration secrets.
- Build prompts carry a shared "Koppel terug aan de brain" section; base URL +
  key stay as `[AAN TE VULLEN: …]` placeholders (same as the build-prompt family).
