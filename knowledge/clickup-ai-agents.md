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
- **500+ work skills** (send emails, DM users, schedule events, act across connected apps).
- **24/7, ambient, self-learning**, with multi-layer memory and Workspace-wide context.
- Built to "own outcomes" across multi-step workflows, not just answer single prompts.

This is exactly the mental model Axel described: each AI team member appears in ClickUp as a Super Agent that can be assigned to tasks, forming a visible extra layer on top of our system.

## The cost reality (read before deciding)

ClickUp's AI (ClickUp Brain, which powers these agents) is a **paid add-on billed per member seat**, and it is **all-or-nothing**: you license it for *every* member in the Workspace, not just the few who use it. Guests are usually free but limited. So:

- Representing our AI team as Super Agents is gated behind the Brain add-on across the whole Workspace, on top of the base plan.
- This is a recurring, per-seat cost that scales with the team — verify current pricing before committing, because it materially changes the build-vs-buy maths.

> Verification note: the per-seat, all-or-nothing Brain pricing model and the Super Agents capabilities below were last verified June 2026 against `clickup.com/brain/pricing` and `clickup.com/brain/agents`. ClickUp's AI packaging changes often — re-check both pages before committing budget or build decisions.

## The strategic question for Saerens

There are two honest ways to realise "AI team members as assignable teammates":

1. **ClickUp-native (Super Agents).** Our agents become ClickUp Super Agents. Pros: zero custom UI, native assign/mention/message, Axel works where he already is, mobile + notifications for free. Cons: per-seat Brain cost, agent behaviour partly lives in ClickUp (a second place to maintain), and it risks ClickUp becoming a competing brain.
2. **App-as-brain + ClickUp-as-layer (recommended hybrid).** The app stays the single source of truth (agent definitions, knowledge, dossiers, decisions). ClickUp holds **tasks, assignment, statuses, and approvals**. Agents are represented either as a single "AI" bot user or as an `Assigned agent` custom field — avoiding a paid Super Agent seat per agent — while the actual generation runs in the app and posts results back via the API. Pros: one brain, controlled cost, full control of agent behaviour. Cons: we build the task/approval glue (create task, post comment, react to `Approved` webhook).

**Recommendation:** start with the hybrid. Keep the brain in the app, use ClickUp as the visible task and approval surface, and represent agents with a custom field or one bot user rather than a paid seat each. Adopt Super Agents later *only* if the native assign/message experience proves worth the per-seat Brain cost and the duplicated agent logic. Either way, the rule from `ARCHITECTURE.md` holds: the app decides, ClickUp tracks and gates, the executor acts only after human approval.

## Notes and cautions

- **One brain.** Whatever we choose, agent strategy lives in this repo's `agents/` and `knowledge/`, not split across ClickUp.
- **Confirm seat pricing first.** The per-member, all-or-nothing Brain model is the deciding cost factor — do not assume; check.
- **Approval stays human.** Neither Autopilot nor Super Agents should write to a live ad account without the approval gate.

## Related

- `knowledge/clickup-platform.md` — Spaces, Lists, statuses, members vs. guests.
- `knowledge/clickup-api.md` — assigning tasks and posting results programmatically.
- `knowledge/clickup-webhooks.md` — reacting to assignment and approval events.
- `ARCHITECTURE.md` — the brain-vs-executor model this decision sits inside.
