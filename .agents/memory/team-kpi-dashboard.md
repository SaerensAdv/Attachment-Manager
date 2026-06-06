---
name: Team KPI dashboard
description: How the team-level KPI aggregate (/team/stats) and /dashboard page are scoped and what they intentionally exclude.
---

# Team KPI dashboard

`getTeamStats()` (generations-store.ts) does a single pass over runs + steps and
returns team totals (runs, tokens, avg duration, status mix, approval mix) plus a
per-agent leaderboard. `GET /team/stats` maps leaderboard `agentPath` → slug /
title / portraitThumbUrl via the roster.

## Scoping rules (must hold)
- Leaderboard **excludes the deliverable pseudo-step** (`role === "deliverable"`)
  — it is not a real agent and would otherwise pollute per-agent stats.
- Leaderboard **excludes non-agent paths** — only steps whose `agentPath` starts
  with `agents/` count toward a specialist.
- Approval mix uses `approved / (approved + rejected)`; pending runs are shown
  separately, never folded into the percentage.

**Why:** the deliverable step and synthetic/non-agent paths share the step table
with real agents; counting them inflates run counts and breaks the leaderboard.

## Frontend
`/dashboard` page (system-map) reuses the editorial Newsroom theme: stat cards +
a leaderboard table with portraits. Tab lives in TabNav between Kaart and Team.
Uses `useGetTeamStats()`. Leaderboard rows link to `/team`.

## Cost + token split
- Team token totals (`totalTokens`/`totalInputTokens`/`totalOutputTokens`) are
  computed from the **step trail**, not run rows — steps are the only place the
  input/output split exists. Team totals include **every** step (deliverable
  too) because cost must reflect all LLM usage; the per-agent leaderboard still
  excludes deliverable + non-`agents/`, so per-agent costs sum to **less** than
  the team total (expected, not a bug).
- `estimatedCostEur` (team + per-agent) comes from `model-pricing.ts`
  (`estimateCostEur(in,out)`), which holds editable Sonnet USD list-price + an
  approximate EUR FX constant. Rough indication, **not** billing-accurate.
- **Why:** the headline "Tokens totaal" (input+output) vs leaderboard
  "Tokens (out)" gap confused the user; the split + euro cost makes input-heavy
  context cost legible. Keep the split steps-based so total == in+out always.
