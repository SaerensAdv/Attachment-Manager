---
name: Two-way agent email (Head identity, inbound replies)
description: How department-Heads get an email identity, send monthly reports as themselves, and how inbound client replies are routed → drafted → approved → sent in-thread.
---

# Two-way agent email

Each department-Head agent gets a GENERIC email identity derived from the team
roster (no per-Head config). Resolver: `lib/email-identity.ts` maps a run's
`leadAgentPath` → roster member → department → `{displayName (persona name + dept
title), address, signature}`. Address alias is derived from the **department id**
(`AGENT_EMAIL_DOMAIN`); owner is `OWNER_EMAIL`.

**Phase 1 (outbound):** the monthly report sends FROM the responsible Head alias
with the owner on Cc, and a generic roster-derived signature replaces the old
hardcoded footer. Still held by the approval checkpoint — nothing auto-sends.

**Phase 2 (inbound):** a sibling interval in the scheduler (`startInboundPoller`,
same 60s tick as the run scheduler) polls open `email_threads`, routes each reply
to its Head **by Gmail threadId**, runs the team scoped to that Head with the
inbound text as the request, and produces an `email-reply` held delivery that goes
through the SAME approval queue, then sends in-thread on approve.

## Hard invariants (do not regress)
- **Never send to a client without owner approval.** Reuse the existing checkpoint;
  send-first/clear-after; atomic claim (see approval-checkpoint.md).
- **Disclosure = explain-on-ask.** NO forced AI-disclosure text injected into emails.
- **Routing is by threadId, not address.** Gmail rewrites an unverified alias `From`
  to the primary account, so you cannot trust/route on the visible From address.
- **Strict sender whitelist is the loop/spoof guard:** accept an inbound message
  ONLY when `From == client.reportEmail`. This is also what stops mail loops.
- **Inbound exactly-once via claim-first:** advance `lastProcessedMessageId` BEFORE
  running the team (`claimInbound`), so a crash/retry never re-processes a message.
  Accepted at-most-once drop on crash-after-claim is the deliberate tradeoff.
- Skip non-client noise: SENT, owner, `Auto-Submitted`, bulk/list, mailer-daemon.
- **Humanizer QC scaffolding must never reach the client.** When `clientFacing=true`
  the Humanizer runs and emits `Humanized version` + internal meta (`What changed`/
  `Wat veranderde`, `Preserved`/`Behouden`, `Flags`, `Human approval required`), all
  as same-level `##` headings under `## Humanizer`. `extractFinalReport` returns that
  whole block and `toClientFacingReport` does NOT match those titles, so they leaked
  into the sent reply. Fix = `stripHumanizerMeta()` (keeps only the Humanized-version
  body; cuts at the first meta label; matches `##`-heading AND `1. **bold**` forms,
  EN+NL; standalone label lines only, not inline words), applied at BOTH client-facing
  extraction sites GATED on `humanizerRan && !truncated`. **Why:** the email-reply path
  is the only one that runs the humanizer client-facing (monthly-report-email is
  `clientFacing=false`), so this bug is invisible until Phase 2 is exercised live.
  **How to apply:** strip at the EXTRACTION sites, never at the append site — the
  archived `finalMarkdown` must keep the full humanizer output + QA review for audit.

## Wiring / shape
- `email_threads`: `gmailThreadId` unique, `clientPath`, `headAgentPath`, `subject`,
  `lastProcessedMessageId`, `lastMessageIdHeader`, `status`; generations carry a
  nullable `emailThreadId`. Thread row recorded on the approved send.
- `pendingDelivery` is a tagged union: **kind absent ⇒ monthly-report** (backward
  compat); `kind:"email-reply"` dispatches `deliverEmailReply`. Both share `/approve`.
- `email.ts` transport self-generates a `Message-ID`, sanitizes ALL headers, and
  threads via `inReplyTo`/`references`/`threadId`; send result returns
  `{id, threadId, messageId}`.
- Phase 2 is gated on a one-off Gmail **read-scope probe** (`messages?maxResults=1`);
  403 ⇒ Phase 2 blocked, tell the user to reconnect Gmail with read scope.
- UI: `serializeDetail` exposes `pendingDeliveryKind` + a SAFE subset
  `pendingEmailReply` (recipient/subject/inboundText/replyBody only — NO identity or
  threading internals). `ApprovalPanel` renders the email-reply variant.
- `workflows/client-email.md` carries `<!-- deliverable: email-reply -->`.
