---
name: Human approval checkpoint (held client-facing send)
description: How the monthly-report-email deliverable is held for human approve/request-changes before anything reaches the client.
---

# Human approval checkpoint

The ONLY outbound-to-client action is the `monthly-report-email` deliverable.
The engine NEVER sends it directly anymore — it drafts, snapshots, and HOLDS.

**Rule:** the actual delivery (render PDF + HTML + Gmail send) lives in
`monthly-report-email.ts` (`deliverMonthlyReport(payload)`), invoked ONLY from the
`approve` route — never from the generate engine. The engine builds a
`ReportDeliveryPayload`, JSON-stringifies it into the generation's
`pendingDelivery` column, sets `approvalStatus="pending"`, records a completed
deliverable step titled "…wacht op goedkeuring", and emits an `approval_required`
SSE event. The run status stays `completed` (drafting succeeded); the held send is
tracked by `approvalStatus`, not run status.

**Why:** a human must review the final draft + the internal reviewer verdict
before the agency emails a client. Holding in the audit trail (not in memory)
means scheduled/autonomous runs can be approved later from the archive, not just
live runs.

**How to apply:**
- Resolution endpoints: `POST /generations/:id/approve` (deliver, mark approved,
  append step; guards keep it pending on send failure — 409/422/502) and
  `POST /generations/:id/request-changes` (hold, record note, append step).
- `approvalStatus` values: `"pending" | "approved" | "changes_requested"`.
- Frontend reuses one `ApprovalPanel` component in BOTH the live `GenerationPanel`
  and the `History` detail panel, so any trigger source can be resolved.
- Regenerate-with-notes feeds the reviewer verdict + the human's change note back
  in as appended request context (no new endpoint; just re-runs the team).
- Approval columns were added via raw SQL ALTER (NOT drizzle push — push wants to
  drop the out-of-schema `doc_embeddings` pgvector table). The OpenAPI `Generation`
  schema carries the fields; codegen surfaces them in `api.schemas.ts`.
