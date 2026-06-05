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
