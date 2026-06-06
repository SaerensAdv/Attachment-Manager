# ClickUp AI Agents — Autopilot vs Super Agents

How ClickUp's own AI agents work, and the strategic question they raise for Saerens: should our AI team members *become* ClickUp Super Agents that Axel assigns tasks to, or should the app stay the brain while ClickUp is only the task/approval layer? This document captures the facts, the recommendation, and the agreed execution pattern for when ClickUp is adopted (see "How an agent works across two tools"). The structure these agents live in is in `knowledge/clickup-platform.md`; the API and event sides are in `knowledge/clickup-api.md` and `knowledge/clickup-webhooks.md`.

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

## How an agent works across two tools (the agreed execution pattern)

This is the model Saerens chose for when ClickUp is adopted. It is documented now so future build work can follow it directly. ClickUp is **not** wired up yet — see "Sequencing" below.

### One agent, two tools (like a human)

Each AI team member is a single colleague that *lives in two tools*, exactly like Axel does. Its brain — definition, persona, knowledge, decision rules — lives here in `agents/` and `knowledge/` (the source of truth). Its **presence** appears in ClickUp as a Super Agent that can be assigned and messaged. The ClickUp Super Agent is **generated/synced from the repo definition, never independently re-authored inside ClickUp**: the repo decides who the agent is, ClickUp only shows that same agent. This keeps one brain and avoids drift between the two tools.

### Two hats in every loop: proposer and executor

Within one automation there are two distinct responsibilities, deliberately separated by the approval gate:

- **Proposer (read-only).** Gathers data and proposes a change. It never writes to a live ad account — it may read the account (e.g. Google Ads API), compute candidates, and create a ClickUp task describing what it wants to do.
- **Executor (write).** Applies the approved change to the live account, but **only after Axel has approved**.

The same colleague can wear both hats, but the write action is always a separate, deliberate step behind the gate. Reading is always allowed; writing is never allowed before approval. This is the brain-vs-executor rule from `ARCHITECTURE.md`: the app decides, ClickUp gates, the executor acts.

### Scope per "tak" (one self-contained loop)

Every automation is delineated as its own branch (*tak*) — one repeatable, self-contained loop:

1. **Trigger** — a schedule or event fires (e.g. weekly).
2. **Gather** — the proposer reads the relevant data (Google Ads API, client dossiers).
3. **Propose** — it creates a ClickUp task with the concrete proposed change and assigns Axel (see `knowledge/clickup-api.md`).
4. **Approve (human gate)** — Axel checks manually and approves by assigning the executing agent (and/or moving the task to an approved status).
5. **Execute** — the approval signal (a webhook on assignment/status change, see `knowledge/clickup-webhooks.md`) tells the executor (n8n/app) to apply the change. ClickUp itself never writes to Google Ads; it only signals.
6. **Report back** — the result is posted to the task as a comment, closing the loop.

### Worked reference example: weekly negative-keyword exclusion

The first concrete *tak*, captured as the canonical illustration:

1. The weekly "exclude search terms" task is triggered on a schedule.
2. The agent (proposer) pulls all candidate negative keywords via the Google Ads API, organised per campaign / ad group where relevant.
3. It creates a ClickUp task listing the proposed exclusions and **assigns Axel** for confirmation.
4. Axel reviews manually. On agreement, he **assigns the executing agent** to carry out the work.
5. That assignment triggers the executor to apply the exclusions to the live account, then post a confirmation comment back on the task.

This matches Saerens' standing rule (`knowledge/google-ads-standards.md`, `agents/google-ads-optimization-specialist.md`): nothing touching a live account happens without human approval.

### Sequencing

ClickUp is adopted only once the core project (the app as brain: agents, knowledge, generations) is largely in order. When that point is reached, build each *tak* as its own loop using the pattern above.

## Notes and cautions

- **One brain.** Whatever we choose, agent strategy lives in this repo's `agents/` and `knowledge/`, not split across ClickUp.
- **Confirm Brain pricing on Business first.** The per-member, all-or-nothing Brain seat model (and any AI usage limits) is the deciding cost factor on the Business plan — do not assume; check what's included.
- **Approval stays human.** Neither Autopilot nor Super Agents should write to a live ad account without the approval gate.

## Related

- `knowledge/clickup-platform.md` — Spaces, Lists, statuses, members vs. guests.
- `knowledge/clickup-api.md` — assigning tasks and posting results programmatically.
- `knowledge/clickup-webhooks.md` — reacting to assignment and approval events.
- `ARCHITECTURE.md` — the brain-vs-executor model this decision sits inside.
