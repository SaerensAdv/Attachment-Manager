---
name: ClickUp integration research
description: Where ClickUp platform/API/agents research lives and the strategic stance taken for Saerens.
---

# ClickUp integration (research stage)

Research is documented as four cross-linked English knowledge docs: `knowledge/clickup-platform.md` (hierarchy + concepts + proposed Saerens structure), `knowledge/clickup-api.md` (auth/limits/endpoints/create-task/comments/custom-fields), `knowledge/clickup-webhooks.md` (events + signature triggers), `knowledge/clickup-ai-agents.md` (Autopilot vs Super Agents + cost). ARCHITECTURE.md has a "ClickUp as the work-management & approval layer" subsection.

## Strategic stance (decision)

ClickUp = the visible **task / assignment / status / approval** layer; the **app stays the single brain and source of truth** (agents, knowledge, dossiers, decisions). Do NOT let ClickUp become a second brain.

**Why:** matches the existing brain-vs-executor model; avoids two drifting sources of truth and avoids paying per-agent for ClickUp's AI.

**How to apply:** Super Agents are simply assignable teammates — **no per-role setup**, you just assign/@mention them. They are NOT billed per AI agent; they're gated behind ClickUp Brain, an add-on billed **per human-member seat, all-or-nothing** across the Workspace. So Super Agents are fine as the assignment/conversation surface as long as decisions+generation still run from the app (the brain). Saerens plan = **Business** (rate limit 100 req/min/token; Brain is an add-on on top). Re-verify Brain pricing/usage before any build decision.

## Agreed execution pattern (documented in clickup-ai-agents.md)

For when ClickUp is adopted (NOT yet — only after the app/brain is largely in order). Decided by the founder:

- **One agent, two tools.** An AI member is one colleague living in two tools (like the founder). Brain/definition stays in repo `agents/`+`knowledge/`; the ClickUp Super Agent is **generated/synced from the repo def, never re-authored in ClickUp** (avoids drift).
- **Two hats split by the approval gate:** proposer (read-only: gathers data, creates a task) vs executor (writes to live account only after approval). Read always allowed, write never before approval.
- **Per "tak" loop:** trigger → gather → propose (create task, assign the founder) → human approve (the founder assigns executor / approved status) → execute (webhook signals n8n/app; ClickUp never writes to Google Ads itself) → report back as comment.
- **Canonical example:** weekly negative-keyword exclusion — proposer pulls candidate negatives via Google Ads API per campaign/adgroup, makes task, assigns the founder; on OK the founder assigns executor which applies + comments back.

## Easy-to-trip facts

- API v2 base `https://api.clickup.com/api/v2`; v2 "Team" == Workspace. v3 emerging.
- Auth header differs by method: personal token `pk_...` sent **raw** (no `Bearer`); OAuth access token sent **with** `Bearer`. Getting this wrong silently breaks OAuth.
- Webhook trust = per-webhook HMAC-SHA256 signature in `X-Signature` (no fixed IPs); webhook is tied to the creating user and dies if that user is disabled — use a stable service account.
- Custom field *types* are created in the UI only; the API just reads them and sets values.
- `CLICKUP_API_TOKEN` is stripped in the code_execution sandbox (value is empty there); a live token-dependent check must run via workspace `node`/`tsx`, not code_execution.

## Shipped: link-only sync (CRM → Companies as master directory)

First actually-built ClickUp feature. ClickUp CRM's **Companies list is the master company directory**; the app only stores a back-reference (`clients.clickup_company_id` = the company task id). Strictly one-directional and non-destructive.

**Why:** keeps ClickUp as the single company registry without making the app a writer/second-source — no accidental CRM edits, no duplicate companies.

**How to apply (invariants that must never regress):**
- **READ-ONLY toward ClickUp**: the provider issues GET only; no POST/PUT/DELETE to ClickUp anywhere. Match app clients → companies by **domain first, then exact normalized name**; ambiguous names never auto-link.
- **Never overwrite a link**: apply is an atomic compare-and-fill UPDATE (`WHERE id = ? AND (clickup_company_id IS NULL OR = '')` + `.returning()`), so an already-linked client is skipped, never clobbered.
- **One company → one client** is enforced by a **partial unique index** on `clickup_company_id` (`WHERE ... IS NOT NULL AND <> ''`), created via raw SQL (never drizzle-kit push) and mirrored in the drizzle schema; the apply route catches the 23505 and reports "already linked" instead of 500. App-level pre-check + within-batch tracking are belt-and-suspenders on top.
- **Report both sides' leftovers**: unmatched app clients AND unmatched ClickUp companies are surfaced for human review; populations legitimately diverge (was 16 app clients vs 9 companies).
- **Error model**: upstream ClickUp failures degrade to `available:false` + a `warnings[]` entry (HTTP 200), only DB errors are 502. The UI must read `warnings` to distinguish an upstream outage from a missing-token config problem (don't hardcode a "check the token" message for every unavailable state).
- User (Axel) stance: LINK-ONLY, never create/overwrite either side — confirm before broadening to any write-back or task creation.
