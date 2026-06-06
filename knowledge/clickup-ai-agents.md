# ClickUp AI Agents — Autopilot vs Super Agents

How ClickUp's own AI agents work, and the strategic question they raise for Saerens: should our AI team members *become* ClickUp Super Agents that Axel assigns tasks to, or should the app stay the brain while ClickUp is only the task/approval layer? This document captures both the facts and the recommendation. The structure these agents live in is in `knowledge/clickup-platform.md`; the API and event sides are in `knowledge/clickup-api.md` and `knowledge/clickup-webhooks.md`.

## ClickUp has two distinct kinds of AI agent

### Autopilot Agents (formerly Custom Agents)

Location-scoped, trigger-driven automations built with a no-code builder. They live on a specific List, Folder, Space, or Chat Channel and only act when an event fires and conditions are met. Each Autopilot Agent is defined by:

- **Trigger** — an event in its location (a chat message posted, a task status changed to "Ready for Review").
- **Agent Conditions / Automation Conditions** — what must be true to run (assignee is X, status is In Progress, message is a question for HR).
- **Action** — what it does: Launch Autopilot Agent, Create Doc/task/subtask with AI, Edit Custom Field with AI.
- **Instructions** — natural-language description of exactly what to do.
- **Knowledge** — the Workspace items/locations (and optionally help articles or connected apps) it may read.
- **Tools** — a default toolset plus optional tools (e.g. generate image).

Autopilot Agents are good for narrow, repeatable, in-ClickUp reactions. They are *not* a place to hold agency strategy.

### Super Agents

ClickUp's "human-level" AI teammates. The headline capabilities (from ClickUp's own description):

- **Assign, message, and @mention** them like a human teammate — they pick up context and act.
- **No per-role setup required.** You don't have to define a fixed "role" for a Super Agent before using it; you simply assign it work (a task, a mention, a message) and it acts on the Workspace context. So a Super Agent is an assignment target, not a job description to maintain.
- **500+ work skills** (send emails, DM users, schedule events, act across connected apps).
- **24/7, ambient, self-learning**, with multi-layer memory and Workspace-wide context.
- Built to "own outcomes" across multi-step workflows, not just answer single prompts.

This is exactly the mental model Axel described: each AI team member appears in ClickUp as a Super Agent that can be assigned to tasks, forming a visible extra layer on top of our system.

## Our plan and the cost reality (read before deciding)

Saerens is on the ClickUp **Business** plan. That sets two practical reference points:

- **API throughput:** 100 requests/min/token (see `knowledge/clickup-api.md`) — design automations to batch reads, not loop per item.
- **AI access:** Super Agents and Autopilot Agents are powered by **ClickUp Brain**, a paid add-on on top of the Business plan. Brain is billed **per human-member seat** and is **all-or-nothing** — you license it for *every* member in the Workspace, not just the few who use it (guests are usually free but limited).

So the cost question is about the *human-member Brain seats* needed to unlock the AI layer, plus any AI usage/credits Super Agent actions consume — **not** a separate seat per AI agent (a Super Agent is just an assignment target). Verify current pricing and usage limits before committing, because it materially changes the build-vs-buy maths.

> Verification note: the per-member, all-or-nothing Brain pricing model and the Super Agents capabilities below were last verified June 2026 against `clickup.com/brain/pricing` and `clickup.com/brain/agents`. ClickUp's AI packaging changes often — re-check both pages (and confirm what's included on the Business plan) before committing budget or build decisions.

## The strategic question for Saerens

There are two honest ways to realise "AI team members as assignable teammates":

1. **ClickUp-native (Super Agents).** Our agents become ClickUp Super Agents that Axel assigns work to directly (no per-role setup). Pros: zero custom UI, native assign/mention/message, Axel works where he already is, mobile + notifications for free, and ClickUp owns the agent runtime. Cons: needs the Brain add-on on the Business plan, behaviour is configured inside ClickUp (less of our own control), and it risks ClickUp drifting into a competing brain if strategy leaks out of this repo.
2. **App-as-brain + ClickUp-as-layer (recommended hybrid).** The app stays the single source of truth (agent definitions, knowledge, dossiers, decisions). ClickUp holds **tasks, assignment, statuses, and approvals**. Work is assigned in ClickUp (to a Super Agent, a bot user, or via an `Assigned agent` custom field), while the actual generation runs in the app and posts results back via the API. Pros: one brain, full control of agent behaviour, AI cost stays predictable. Cons: we build the task/approval glue (create task, post comment, react to `Approved` webhook).

**Recommendation:** keep the brain in the app and use ClickUp as the visible task and approval surface. Since Super Agents are simply assignable (no roles to maintain) and the Business plan already supports the Brain add-on, Super Agents are a fine *assignment and conversation surface* — Axel can assign and message them naturally — as long as the actual decisions and generations still run from the app, not from logic buried in ClickUp. Either way, the rule from `ARCHITECTURE.md` holds: the app decides, ClickUp tracks and gates, the executor acts only after human approval.

## Notes and cautions

- **One brain.** Whatever we choose, agent strategy lives in this repo's `agents/` and `knowledge/`, not split across ClickUp.
- **Confirm Brain pricing on Business first.** The per-member, all-or-nothing Brain seat model (and any AI usage limits) is the deciding cost factor on the Business plan — do not assume; check what's included.
- **Approval stays human.** Neither Autopilot nor Super Agents should write to a live ad account without the approval gate.

## Related

- `knowledge/clickup-platform.md` — Spaces, Lists, statuses, members vs. guests.
- `knowledge/clickup-api.md` — assigning tasks and posting results programmatically.
- `knowledge/clickup-webhooks.md` — reacting to assignment and approval events.
- `ARCHITECTURE.md` — the brain-vs-executor model this decision sits inside.
