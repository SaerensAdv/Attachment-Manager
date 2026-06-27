---
name: Two-way agent email (Head identity, inbound replies)
description: How department-Heads get an email identity, send monthly reports as themselves, and how inbound client replies are routed → drafted → approved → staged as an in-thread Gmail draft.
---

# Two-way agent email

Each department-Head agent gets a GENERIC email identity derived from the team
roster (no per-Head config). Resolver: `lib/email-identity.ts` maps a run's
`leadAgentPath` → roster member → department → `{displayName (persona name + dept
title), address, signature}`. Address alias is derived from the **department id**
(`AGENT_EMAIL_DOMAIN`); owner is `OWNER_EMAIL`.

**Phase 1 (outbound):** the monthly report is built FROM the responsible Head
alias with the owner on Cc, and a generic roster-derived signature replaces the
old hardcoded footer. Held by the approval checkpoint; on approve it is NOT sent
but placed as a Gmail DRAFT in the agency mailbox (`draftMonthlyReport` →
`createGmailDraft`) so the owner does the final send from Gmail himself. The
email-reply path is now ALSO draft-on-approve (`draftEmailReply`, same pattern).

**Phase 2 (inbound):** a sibling interval in the scheduler (`startInboundPoller`,
same 60s tick as the run scheduler) polls open `email_threads`, routes each reply
to its Head **by Gmail threadId**, runs the team scoped to that Head with the
inbound text as the request, and produces an `email-reply` held delivery that goes
through the SAME approval queue, then on approve is staged as an in-thread Gmail
DRAFT (`draftEmailReply` → `createGmailDraft` with the threadId) — the owner does
the final send from Gmail himself.

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
  nullable `emailThreadId`. Thread row recorded from the DRAFT's threadId on approve.
- `pendingDelivery` is a tagged union: **kind absent ⇒ monthly-report** (backward
  compat); `kind:"email-reply"` dispatches `draftEmailReply`. Both share `/approve`.
- `email.ts` transport self-generates a `Message-ID`, sanitizes ALL headers, and
  threads via `inReplyTo`/`references`/`threadId`; send result returns
  `{id, threadId, messageId}`.
- Phase 2 is gated on a one-off Gmail **read-scope probe** (`messages?maxResults=1`);
  403 ⇒ Phase 2 blocked, tell the user to reconnect Gmail with read scope.
- UI: `serializeDetail` exposes `pendingDeliveryKind` + a SAFE subset
  `pendingEmailReply` (recipient/subject/inboundText/replyBody only — NO identity or
  threading internals). `ApprovalPanel` renders the email-reply variant.
- `workflows/client-email.md` carries `<!-- deliverable: email-reply -->`.

## Inline images in outbound emails (SA logo + Head portrait, CID)
Both client emails (monthly report + reply) carry TWO inline `cid:` images: the SA
brand logo in the dark-header lockup (left of the wordmark) and the responsible Head's
portrait in the footer signature band ONLY. The portrait was moved out of the header at
the user's request — header = company brand, footer = personal signature.
- **SA logo is a self-contained base64 PNG constant** in `lib/brand-logo.ts`
  (`SAERENS_LOGO_CID="sa-logo"`, `saerensLogoInlineImage()`). **Why a constant, not file
  IO / object storage:** api-server dev runs from a BUNDLED dist that is wiped on rebuild,
  so a baked-in constant is the robust source for a fixed brand asset. Source = the 72×72
  transparent indigo "SA" monogram (downscaled from `higgsfield-tests/saerens-logo.png`);
  transparent bg sits cleanly on the `#0A0A0B` header and ties into the `#716BEB` accent.
- **Logo is ALWAYS embedded; portrait is best-effort.** `draftMonthlyReport` /
  `draftEmailReply` build `inlineImages = portrait ? [logo, portrait] : [logo]` and always
  pass `logoCid`. Header helper `headerLogo(logoCid)` (renders nothing if no cid);
  `signatureBand` (56px footer portrait) is the only portrait site now. `headerAvatar` was
  removed.
Native Gmail inbox avatars were rejected: they need paid per-Head Workspace mailboxes or
BIMI (one domain logo) — the in-email portrait is the free, controllable path.
- **Downscale before embedding, and DROP on failure.** `resolveHeadPortrait` resizes the
  stored portrait to a small square thumb (`sharp`, ~128px) before embedding. **Why:** the
  full-res PNG trips an **HTTP 413** at the Gmail send proxy. On a resize/throw, return
  `null` (text-only signature) — never fall back to the raw bytes, or you reintroduce the
  413 on an owner-approved send. Best-effort throughout: missing portrait/storage error ⇒
  null ⇒ email still sends without a photo.
- **Resolve at SEND time from `headAgentPath`** (slug = basename minus `.md`); no
  pendingDelivery payload schema change. Header/footer markup is shared (`headerAvatar` /
  `signatureBand` exported from `monthly-report-email.ts`, reused by `email-reply.ts`).
- **MIME assembly in `buildMime` has three shapes — preserve exactly:** no inline ⇒ original
  `multipart/mixed` (keeps backward-compat tests); inline-only ⇒ `multipart/related`;
  inline **+** attachments ⇒ `multipart/mixed{ multipart/related{ html, inlines }, attachments }`.
  Inline parts carry `Content-ID: <cid>` + `Content-Disposition: inline`; cid is sanitized
  (strip `<>"`). **The inner (related) boundary must NOT have the outer boundary as a prefix**
  (use `rel_${boundary}`, not `${boundary}_rel`) — a lenient parser matching delimiters with
  `startsWith` would truncate the message at the first inner delimiter. The nested path is the
  real report path (PDF + portrait); exercise it live, not just inline-only.
- **Live verify with `scripts/test-head-aliases.ts`** (+ `scripts/build-test.mjs`
  bundler). The one-liner `esbuild --packages=external` does NOT work: `@workspace/brand`'s
  dev entry is extensionless TS that Node can't load — must bundle workspace pkgs (mirror
  `build.mjs` externals + pino plugin → needs `outdir`, not `outfile`).

## Inbound is blocked by the Replit Gmail connector's fixed scope set
The Replit-managed `google-mail` connector grants only `gmail.send`, `gmail.labels`, and
`gmail.addons.current.*` (contextual add-on) scopes — NOT `gmail.readonly`/`gmail.modify`.
So mailbox reads (`users.messages.list`, thread fetches) return 403 "insufficient authentication
scopes" no matter how often the connection is re-authorized — **re-auth does not broaden a
connector's fixed scope set.** Verified live: labels list = 200, messages list = 403.
**Consequence:** the Phase-2 inbound poller (full-mailbox read) CANNOT be powered by the connector.
The SAME wall blocks `drafts.create` (needs `gmail.compose`/modify; the connector's
`gmail.addons.current.action.compose` is add-on-context only, not REST compose) — verified
`drafts.list` = 403. Both inbound read AND draft-create need a SEPARATE Google OAuth client; keep
outbound send on the connector.

**Draft-create is implemented** (`lib/gmail-oauth.ts`): reuses the SAME OAuth client (id+secret) as the
Ads/readonly sources but a DEDICATED refresh token `GOOGLE_OAUTH_GMAIL_REFRESH_TOKEN`, consented as the
agency mailbox with `gmail.modify`; the token exchange is shared from `google-oauth.ts` via
`exchangeRefreshToken`. `createGmailDraft` POSTs the same `buildMime` MIME to `users.drafts.create` with
a Bearer token (NOT the connector). **Durable decision (reversed an earlier tradeoff):** BOTH the
report and the reply draft paths now record/advance the `email_thread` from the **draft's returned
threadId** (`recordOutboundThread(draftResult.threadId)` on approve). **Why:** `recordOutboundThread`
is the ONLY creator of `email_threads` rows and the inbound poller only watches those rows, so NOT
recording would mean Phase-2 inbound detection never starts for new clients (the reply-draft feature
would be dead on arrival). A draft and its eventually-sent message share the same Gmail threadId, so
recording it at draft time is accurate for routing even though the human sends by hand later. Safe with
the poller because it skips DRAFT/SENT/owner/non-whitelisted messages, so an unsent draft creates a
watched-but-idle open thread that cannot self-trigger; it only activates once the client replies.
**How to verify quickly:** probe `GET /gmail/v1/users/me/messages?maxResults=1` (read) or
`drafts.list`/`drafts.create` — 200 = ok, 403 = scope missing. process.env is NOT exposed in the
code_execution sandbox; test via workspace `node`/`tsx`. The inbound poller's read-scope probe
self-disables on 403 (fails closed).
