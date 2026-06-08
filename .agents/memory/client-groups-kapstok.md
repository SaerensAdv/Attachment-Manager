---
name: Client groups (kapstok layer)
description: How the overarching client-group ("kapstok") layer relates to website-fiches, and its non-cascade contract.
---

# Client groups — "kapstok" layer

A `client_groups` table groups multiple client website-fiches via a nullable
`clients.group_id` FK. The group is **grouping + overview ONLY** — there is no
shared-field cascade; each fiche keeps its own data and integrations. The group
row holds only metadata (name, notes, timestamps).

**Why:** the user explicitly asked for a "kapstok-version" first: bundle fiches
under one parent dossier without propagating any fields between them.

**How to apply:**
- The FK is `ON DELETE SET NULL`: deleting a group must never delete member
  fiches — they simply become ungrouped. Any future change here is a contract
  break.
- `groupId` is numeric, so on the web editor it lives OUTSIDE the string-only
  `FormState` (clients-form.ts excludes it from `FieldKey`/`FormState`); it is
  tracked as its own React state and merged into the save payload separately.
- An unknown `groupId` on client create/update is mapped to a clean 400
  ("Onbekende klantgroep.") by catching the Postgres FK violation. Drizzle
  wraps the driver error, so SQLSTATE 23503 can be on the error itself OR on
  its `.cause` — check both.
- Same out-of-schema-pgvector migration constraint as the rest of this repo:
  drizzle push prompts interactively and fails non-TTY, so the table + FK were
  applied via raw SQL with the FK named EXACTLY `clients_group_id_client_groups_id_fk`
  (drizzle's convention) to keep future pushes in sync.
