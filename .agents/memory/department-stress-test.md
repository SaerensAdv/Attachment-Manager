---
name: Department stress-test findings
description: Durable evaluation findings — QA Reviewer not routable as primary; db push abort leaves schema half-applied.
---

# Department stress-test — durable findings

## QA & Compliance Reviewer is not routable as a primary destination
Standalone "review/check this for policy/claims compliance" requests never reach
the QA & Compliance Reviewer: they misroute to content **producers** (copywriter,
reporting-specialist) or fall back to a clarification. Reproduced across prompts
0.3, 5.1, 5.2 — 2/3 misroute to producers, 1/3 clarifies, **0/3 reach Quality**.

**Why:** the QA & Compliance Reviewer is intentionally stripped from primary
routing and only runs as the closing gate after produced work. So Department 5
is unreachable as a primary destination, and a user asking for an *independent*
review gets it from the same role that produced the content.

**How to apply:** if asked to make compliance review work as a first-class
request, add an explicit routing path so a review/compliance intent lands on the
QA & Compliance Reviewer as primary — while keeping the closing-gate behaviour
for produced deliverables.

## `db push` interactive abort leaves additive columns unapplied
The post-merge step `pnpm --filter db push` blocks on the interactive
"drop doc_embeddings?" prompt and **aborts before applying other additive
columns**. Symptom observed: the `generations` table was missing the approval/
pending columns, so every `/generations` read returned HTTP 500 and no run could
be archived (insert + list both failed).

**Why:** push is interactive and not idempotent; one unanswerable prompt aborts
the whole sync, silently skipping unrelated additive schema changes.

**How to apply:** recover with additive `ALTER TABLE ... ADD COLUMN IF NOT
EXISTS` (safe, non-destructive). Longer-term fix is to drive push
non-interactively or add an idempotent migration step so a merge cannot leave
the schema half-applied. Related: persistent-embeddings-pgvector.md,
monorepo-composite-refs.md.

## Reliable way to run long autonomous runs from a shell
Autonomous runs (`POST /generate/autonomous`) archive server-side regardless of
client disconnect (the engine's AbortController is created server-side, never
aborted by the client). So a long run survives the shell's 120s window: fire the
request and abort the client fetch after a few seconds, then poll `/generations`
for the new row by `requestText`. The stress harness implements this as the
`fire` + `show` subcommands.
