---
name: Learning loop (review → proposals → apply)
description: How the Archief "learning loop" turns a human QA verdict into confirmed, durable doc improvements; the non-obvious correctness decisions.
---

# Learning loop — steps 1+2

In the Archief detail, the user records a QA verdict (approved/rejected) + free-text
note on a generation. The system then generates 0..N concrete improvement proposals
(non-streaming LLM call over {request, finalMarkdown, feedback}). The user accepts or
rejects EACH proposal separately; accepting applies it. North star: AI does the work,
the human is the sole QA gate, and every correction becomes a durable doc improvement.

## Non-obvious decisions (keep consistent)
- **Apply is non-destructive, append-only.** Knowledge `.md` targets get the proposed
  line appended under a managed `## Geleerde regels (uit reviews)` section (created if
  absent); client targets append to the client's `restrictions` field. Never rewrite or
  replace existing doc content. **Why:** the docs are the agency's source of truth; a
  learning loop that can silently overwrite curated standards is dangerous.
- **Per-change confirmation is the contract.** The user confirms each proposal
  individually — no "accept all". This is the product's whole point (human gate).
- **Proposing requires a saved verdict.** `POST /generations/:id/proposals` 400s when
  the generation has no `feedbackVerdict`. The UI disables "Stel verbeteringen voor"
  until the verdict is saved.
- **Generation may be automated; APPLY must always stay human-gated.** This is the hard
  invariant for all proactivity work (auto-on-save trigger, future periodic digest):
  drafting/proposing proposals can be triggered by the system, but a proposal is only
  ever written to docs/restrictions via an explicit human accept. **Why:** the user
  explicitly values the gate; automate the tedious detection, never the decision.
- **Auto-trigger on verdict save is frontend-only + guarded.** History.tsx auto-fires
  the existing proposals mutation in the feedback `onSuccess`, but only when
  `proposalsQuery.isSuccess && proposals.length === 0` and a per-session
  `autoProposedRef` set hasn't seen that id — else a still-loading list (defaults `[]`)
  or a repeated save makes redundant (paid) model calls + duplicate rows. The backend
  has NO proposal-level dedup; before building the periodic digest, move idempotency
  server-side (generate-only-if-none / DB lock).
- **Decisions are an atomic compare-and-set, not read-then-write.** accept/reject claim
  the row with `UPDATE ... WHERE id=? AND status='pending'` (see
  `claimProposalStatus`); 0 rows updated → 409. A plain read→check-pending→update lets
  two concurrent calls both pass the check and double-apply / conflict. **Why:** a code
  review caught exactly this race; the side effect (applyProposal) must run at most once.
- **Accept claims BEFORE applying side effects, and reverts on failure.** Order is:
  claim → applyProposal → respond. If apply throws, `revertProposalToPending` rolls the
  row back to pending (guarded on `status='accepted'`) so it stays actionable and DB
  state never claims "accepted" for a change that didn't land. Apply failure → 502.
- **Missing target file is a safe failure.** applyProposal surfaces a clear error (502)
  and leaves the proposal undecided rather than corrupting state.

## Wiring
- DB: feedback cols on `generationsTable` (feedbackVerdict/Note/At) + `improvement_proposals`
  table (targetType knowledge|client, targetPath, targetLabel, rationale, proposedText,
  status pending|accepted|rejected, decidedAt nullable).
- Standard vertical slice: db schema+index → api-server lib (improvements.ts builds +
  applies) + store + routes → openapi.yaml + orval codegen → History.tsx UI.
- Frontend invalidates the generation detail query after saving feedback and the
  proposals query after create/accept/reject; per-card spinner uses `mut.variables?.id`.
