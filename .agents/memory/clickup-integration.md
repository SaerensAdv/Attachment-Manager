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

For when ClickUp is adopted (NOT yet — only after the app/brain is largely in order). Decided by Axel:

- **One agent, two tools.** An AI member is one colleague living in two tools (like Axel). Brain/definition stays in repo `agents/`+`knowledge/`; the ClickUp Super Agent is **generated/synced from the repo def, never re-authored in ClickUp** (avoids drift).
- **Two hats split by the approval gate:** proposer (read-only: gathers data, creates a task) vs executor (writes to live account only after approval). Read always allowed, write never before approval.
- **Per "tak" loop:** trigger → gather → propose (create task, assign Axel) → human approve (Axel assigns executor / approved status) → execute (webhook signals n8n/app; ClickUp never writes to Google Ads itself) → report back as comment.
- **Canonical example:** weekly negative-keyword exclusion — proposer pulls candidate negatives via Google Ads API per campaign/adgroup, makes task, assigns Axel; on OK Axel assigns executor which applies + comments back.

## Easy-to-trip facts

- API v2 base `https://api.clickup.com/api/v2`; v2 "Team" == Workspace. v3 emerging.
- Auth header differs by method: personal token `pk_...` sent **raw** (no `Bearer`); OAuth access token sent **with** `Bearer`. Getting this wrong silently breaks OAuth.
- Webhook trust = per-webhook HMAC-SHA256 signature in `X-Signature` (no fixed IPs); webhook is tied to the creating user and dies if that user is disabled — use a stable service account.
- Custom field *types* are created in the UI only; the API just reads them and sets values.
