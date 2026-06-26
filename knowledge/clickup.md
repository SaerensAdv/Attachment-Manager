# ClickUp — Work-Management & Approval Layer

Everything about connecting the Saerens app (the brain) to ClickUp (the task and approval layer). Sections: **Platform** (the structure and concepts), **API** (authentication, limits, endpoints), **Webhooks** (event-driven triggers), and **AI agents** (assigning AI teammates and seat cost). The app stays the source of truth; ClickUp holds tasks and human approvals.


---

## ClickUp Platform — Structure & Core Concepts

A reference for how ClickUp is organised, written so we can map the Saerens AI team and client work onto it correctly. ClickUp is the work-management surface Axel already uses day to day: a place where work lives as tasks, work is assigned to a person (or an AI teammate), and progress is tracked through statuses. This document explains the platform's structure and the concepts we will build on; the API side is covered in the *ClickUp API* section, the event/trigger side in the *ClickUp Webhooks* section, and the AI-teammate side in the *ClickUp AI Agents* section.

Getting the structure right first matters: a clear ClickUp structure makes future automation safe, an unclear one makes automation create faster chaos (the same guiding principle as in `ARCHITECTURE.md`).

### The Hierarchy (six levels)

ClickUp is built on a fixed six-level hierarchy. Everything we automate has to address one of these levels by id.

1. **Workspace** — the whole organisation. One Workspace per company; everything else lives inside it. (Naming gotcha: in API v2 a Workspace is called a "Team" — see the *ClickUp API* section.)
2. **Space** — a top-level grouping of work. Spaces have their own settings, statuses, and access control, and can be private. Group them by department, service line, or client set.
3. **Folder** — an *optional* layer inside a Space that houses Lists. Creating a Folder auto-creates a List inside it. Folders can be skipped entirely.
4. **List** — the container that actually holds tasks. A List can live inside a Folder *or* directly in a Space (a "folderless" List). This is the unit most automations target.
5. **Task** — the actionable item: the thing assigned to a person or agent, moved through statuses, commented on, and given custom-field values.
6. **Subtask** — a granular item under a task. Nested subtasks are a ClickApp that an owner/admin must enable.

In addition to these locations, a Workspace also holds **Docs**, **Chat**, **Dashboards**, **Goals**, and **Views** — surfaces an automation may read from or post to.

### Core concepts we build on

- **Statuses.** Each task moves through a status set defined per Space (or overridden per List). Statuses are how we model an approval lifecycle (e.g. `Proposed` → `Needs approval` → `Approved` → `Done`). This is the backbone of the human-in-the-loop safety model.
- **Assignees.** A task can be assigned to one or more members. AI teammates ("Super Agents") can be assignees too — see the *ClickUp AI Agents* section.
- **Custom Fields.** Structured, typed metadata on a task (client id, target CPL, account id, approval flag, etc.). Field *types* are created in the UI; the API reads them and sets values. The supported types and the set-value endpoint are in the *ClickUp API* section.
- **Custom Task Types.** Beyond the default "Task", a Workspace can define task types (e.g. "Report", "Optimisation", "Audit") so a List can mix distinct kinds of work. Useful for letting one client Space carry reports and optimisation proposals as distinct objects.
- **Tags.** Lightweight cross-cutting labels, independent of the hierarchy.
- **Dependencies & relationships.** Tasks can block / wait on / link to other tasks — useful when an approval must precede an execution task.
- **Views.** List, Board, Calendar, Gantt, etc. Views are presentation only; they never change where a task lives.
- **ClickApps.** Per-Space feature toggles (time tracking, nested subtasks, custom task types, etc.). Some API capabilities depend on the matching ClickApp being on.

### Members vs. guests (matters for cost)

ClickUp bills per **member** seat. "Members" (owners, admins, members, limited members) are billable; **guests** are usually free but restricted. This distinction drives the cost of the AI add-on (ClickUp Brain is priced per member seat, all-or-nothing across the Workspace) — the full pricing reality and what it means for representing our AI team is in the *ClickUp AI Agents* section.

### A proposed structure for Saerens

A starting structure to map our model onto ClickUp (to be confirmed with Axel, not yet built):

- **Workspace:** Saerens Advertising (one).
- **Spaces:** one Space per client for real client work, plus an internal **"AI Team"** Space for cross-client operations (reports queue, optimisation proposals, audits).
- **Folders/Lists:** within a client Space, Lists per work stream — e.g. `Reporting`, `Optimisation`, `Setup`, `Communication` — so each automation targets a specific List id.
- **Statuses (approval lifecycle):** a shared status set such as `Backlog` → `Proposed` → `Needs approval` → `Approved` → `In progress` → `Done`, so the "proposing/acting needs approval" rule from `ARCHITECTURE.md` is enforced by where a task sits.
- **Custom Fields:** `Client` (link to our dossier id), `Account ID` (Google Ads), `Assigned agent` (which AI specialist), `Approval` (checkbox), `Source run` (link back to the app's generation) — so a ClickUp task and an app generation stay traceable to each other.
- **Custom Task Types:** `Report`, `Optimisation proposal`, `Audit`, `Setup` to keep distinct deliverables legible on one board.

This keeps the app as the brain and source of truth while ClickUp becomes the visible task, assignment, and approval layer on top.

### Notes and cautions

- **The app stays the source of truth.** ClickUp holds tasks, statuses, and approvals — *not* agent definitions or client dossiers. Two competing sources of truth drift apart; keep the brain in the app (see `ARCHITECTURE.md`).
- **Structure before automation.** Document the Space/List layout and the approval status set before switching any automation on.
- **Don't over-nest.** Folders are optional; prefer folderless Lists unless a Space genuinely needs grouping.

### Related

- The *ClickUp API* section — authentication, endpoints, and how we read/write this structure.
- The *ClickUp Webhooks* section — the event triggers that fire when statuses or tasks change.
- The *ClickUp AI Agents* section — Autopilot vs Super Agents, assignment, and the per-seat cost.
- `ARCHITECTURE.md` — the brain-vs-executor model this structure plugs into.


---

## ClickUp API — Integration Reference

The technical reference for connecting the Saerens app (the brain) to ClickUp (the work-management and approval layer). It covers authentication, limits, the endpoints we need to walk the hierarchy, create and assign tasks, post results back, and set structured field values. The platform concepts these endpoints act on are in the *ClickUp Platform* section; event-driven triggers are in the *ClickUp Webhooks* section.

### Base URL and versions

- **Base URL (v2):** `https://api.clickup.com/api/v2`
- **v3** (`https://api.clickup.com/api/v3`) is rolling out for a growing subset of endpoints (Docs, etc.). v2 still has the broadest coverage and is what we default to.
- **Terminology gotcha:** in v2, "Team" means **Workspace**. So `GET /team` returns Workspaces, and a `team_id` is a Workspace id. v3 uses "Workspace" consistently.
- An AI-readable index of every page and endpoint lives at `https://developer.clickup.com/llms.txt`.

### Authentication

Two methods, and the **`Authorization` header format differs between them** — getting this wrong is a common integration bug:

- **Personal API token** — for internal scripts and our own backend. Begins with `pk_`, never expires, grants access to every Workspace the user belongs to. Generated under Settings → Apps. Header: **`Authorization: pk_xxx`** (the raw token, **no `Bearer` prefix**).
- **OAuth 2.0 (authorization code grant)** — for multi-user apps where each user authorises their own Workspaces. Authorization URL `https://app.clickup.com/api`, token URL `https://api.clickup.com/api/v2/oauth/token`. Only Workspace owners/admins can create an OAuth app. The access token **is** sent with a Bearer prefix: **`Authorization: Bearer {access_token}`**. Use OAuth if we ever expose this to multiple agency users (it also spreads rate limits across users).

For our single-agency backend, a **personal token stored as a secret** (never in code or docs) is the simplest correct choice. Manage it via the environment-secrets flow, not by hand.

### Rate limits

Per **token**, by the Workspace's plan:

- Free / Unlimited / Business: **100** requests/min/token
- Business Plus: **1,000** requests/min/token
- Enterprise: **10,000** requests/min/token

Saerens is on the **Business** plan, so we design against **100 requests/min/token**. Exceeding the limit returns **HTTP 429**. Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` (Unix seconds). Build a client that reads these headers and backs off before hitting 429 — at 100/min, batch reads and avoid per-item loops.

### Walking the hierarchy (read)

```
GET /team                                  -> Workspaces (teams[])
GET /team/{team_id}/space                  -> Spaces in a Workspace
GET /space/{space_id}/folder               -> Folders in a Space
GET /space/{space_id}/list                 -> folderless Lists in a Space
GET /folder/{folder_id}/list               -> Lists in a Folder
GET /list/{list_id}/task                   -> Tasks in a List (paginated)
GET /task/{task_id}                        -> a single Task (full detail)
GET /list/{list_id}/field                  -> Custom Fields available on a List
GET /team/{team_id}/custom_item            -> Custom Task Types in a Workspace
```

`GET /list/{list_id}/task` is **paged** (`page` query param, ~100 tasks/page); keep requesting until a short page returns. Add filters like `?subtasks=true`, `?include_closed=true`, or status/assignee filters as needed.

### Creating and assigning tasks (write)

```
POST /list/{list_id}/task
```

```json
{
  "name": "May 2026 report — Schoonpannendak",
  "markdown_description": "## Summary\nDraft generated by the Reporting Specialist.",
  "assignees": [123456],
  "status": "Needs approval",
  "priority": 2,
  "due_date": 1717286400000,
  "custom_item_id": 1001,
  "custom_fields": [
    { "id": "field-uuid", "value": "4" }
  ]
}
```

- `assignees` takes an **array of user ids** (a Super Agent has a user id too — see the *ClickUp AI Agents* section).
- `due_date` is a **Unix timestamp in milliseconds**.
- `custom_item_id` sets a Custom Task Type; omit it for a normal task.
- Update with `PUT /task/{task_id}` (note: changing assignees uses `{ "assignees": { "add": [...], "rem": [...] } }` on update, not a plain array).

### Posting results back to a task (comments)

This is how an agent returns its work to a human in ClickUp:

```
POST /task/{task_id}/comment
```

```json
{ "comment_text": "Report drafted and attached. Ready for your review.", "notify_all": true }
```

- Use `comment_text` for plain text, or the structured `comment` array for rich text and `@mentions`.
- Optional `assignee` (a user id) turns the comment into an assigned comment (a lightweight action item).
- Read with `GET /task/{task_id}/comment`.

### Setting Custom Field values

Field *types* must already exist (created in the UI); the API only reads them and writes values:

```
POST /task/{task_id}/field/{field_id}
{ "value": "..." }
```

Common field types: `text`, `textarea`, `number`, `currency`/`money`, `date`, `checkbox`, `dropdown` (value = option id), `labels` (value = array of option ids), `url`, `email`, `phone`, `rating`, `users`/`people` (value with `add`/`rem` user ids), and `tasks` (relationship). Each field's `type_config` defines its acceptable values; read it from `GET /list/{list_id}/field` before writing.

### Error handling

- Errors return a JSON body with `err` and `ECODE`; check the HTTP status first.
- 401/403 → bad or unauthorised token (verify the secret's **shape**, not its value). 404 → wrong id or no access to that location. 429 → rate limited (back off using the reset header).

### How we use it (Saerens)

- **Read** the hierarchy to resolve the right List id for a client work stream (cache ids; they are stable).
- **Create** a task per deliverable in `Needs approval`, assigned to the responsible agent, with custom fields linking back to our generation (so the app stays the source of truth).
- **Post** the generated draft as a comment / attachment, then let a human move the status to `Approved` — which a webhook can pick up to trigger the executor (see the *ClickUp Webhooks* section).
- **Never** let the API write to a live ad account directly; ClickUp is the task/approval layer, the executor performs approved changes (see `ARCHITECTURE.md`).

### Related

- The *ClickUp Platform* section — the structure these endpoints address.
- The *ClickUp Webhooks* section — receiving events instead of polling.
- The *ClickUp AI Agents* section — assigning AI teammates and the seat cost.


---

## ClickUp Webhooks — Event Triggers

How ClickUp pushes events to us in real time, so an automation reacts to a status change instead of polling the API. Webhooks are the **trigger** side of the brain-vs-executor model in `ARCHITECTURE.md`: a human moves a task to `Approved`, ClickUp fires an event, and the app (brain) decides what the executor should do next. The endpoints to read/act in response are in the *ClickUp API* section; the task/status concepts are in the *ClickUp Platform* section.

### What a webhook is

A webhook subscribes a destination URL to one or more events in a location (Workspace, Space, Folder, or List). Instead of repeatedly asking "did anything change?", ClickUp sends a signed HTTP POST to our URL when a matching event happens. This is the efficient way to stay in sync under the 100 req/min rate limit.

### Creating a webhook

```
POST /team/{team_id}/webhook
{
  "endpoint": "https://our-app.example.com/clickup/webhook",
  "events": ["taskStatusUpdated", "taskCommentPosted"],
  "space_id": 123,        // optional: scope to a Space
  "list_id": 456          // optional: scope to a List
}
```

- Scope it as narrowly as possible (a specific List) to avoid noise.
- Use `["*"]` to subscribe to all events (only for discovery; too noisy for production).
- Manage with `GET /team/{team_id}/webhook`, `PUT /webhook/{id}`, `DELETE /webhook/{id}`.

### Events we care about

ClickUp exposes 30+ events. The ones relevant to our flows:

- `taskCreated`, `taskUpdated`, `taskDeleted`
- `taskStatusUpdated` — the approval lifecycle signal (e.g. moved to `Approved`).
- `taskAssigneeUpdated` — work handed to an agent or person.
- `taskCommentPosted` — a human replied / a result was posted.
- `taskPriorityUpdated`, `taskDueDateUpdated`, `taskMoved`.

Each delivery includes the `event` name, the affected `task_id` (or list/folder id), and a `history_items` array describing what changed; fetch full detail with `GET /task/{task_id}` if needed.

### Security — verify the signature

Every event is signed with a **shared secret unique to that webhook**, returned when the webhook is created. ClickUp sends an `X-Signature` header containing an HMAC-SHA256 of the raw request body keyed with that secret. We **must** recompute the HMAC over the raw body and compare before trusting any event — otherwise anyone who learns the URL could forge approvals.

- Store the per-webhook secret as a secret (environment-secrets flow), never in code or docs.
- ClickUp does **not** send from fixed IP addresses, so signature verification (not IP allow-listing) is the trust boundary.
- Treat every incoming payload as untrusted data until the signature checks out.

### Scope and caveats

- A webhook is **tied to the user** whose token created it. If that user is disabled, the webhook stays registered but stops firing — use a stable service account, not a personal login that might be deactivated.
- ClickUp retries failed deliveries and can disable a webhook after repeated failures; our endpoint must respond quickly (acknowledge, then process asynchronously) and be idempotent (the same event may arrive more than once).
- For local testing, a relay like `smee.io` forwards events to a dev machine.

### How we use it (Saerens)

- Subscribe a narrowly-scoped webhook (per client work List) to `taskStatusUpdated` and `taskCommentPosted`.
- On `Approved`, the brain validates and hands a **proposing/acting** job to the executor; on a read-only/reporting status it can proceed automatically (the two safety categories in `ARCHITECTURE.md`).
- Always log the decision and keep a human-visible trail in ClickUp (a status + comment), so approvals are auditable.

### Related

- The *ClickUp API* section — how to act once an event arrives.
- The *ClickUp Platform* section — statuses and the approval lifecycle that drive these events.
- The *ClickUp AI Agents* section — agents that can be triggered or assigned by these events.
- `ARCHITECTURE.md` — the brain-vs-executor split webhooks plug into.


---

## ClickUp AI Agents — Autopilot vs Super Agents

How ClickUp's own AI agents work, and the strategic question they raise for Saerens: should our AI team members *become* ClickUp Super Agents that Axel assigns tasks to, or should the app stay the brain while ClickUp is only the task/approval layer? This document captures the facts, the recommendation, and the agreed execution pattern for when ClickUp is adopted (see "How an agent works across two tools"). The structure these agents live in is in the *ClickUp Platform* section; the API and event sides are in the *ClickUp API* and *ClickUp Webhooks* sections.

### ClickUp has two distinct kinds of AI agent

#### Autopilot Agents (formerly Custom Agents)

Location-scoped, trigger-driven automations built with a no-code builder. They live on a specific List, Folder, Space, or Chat Channel and only act when an event fires and conditions are met. Each Autopilot Agent is defined by:

- **Trigger** — an event in its location (a chat message posted, a task status changed to "Ready for Review").
- **Agent Conditions / Automation Conditions** — what must be true to run (assignee is X, status is In Progress, message is a question for HR).
- **Action** — what it does: Launch Autopilot Agent, Create Doc/task/subtask with AI, Edit Custom Field with AI.
- **Instructions** — natural-language description of exactly what to do.
- **Knowledge** — the Workspace items/locations (and optionally help articles or connected apps) it may read.
- **Tools** — a default toolset plus optional tools (e.g. generate image).

Autopilot Agents are good for narrow, repeatable, in-ClickUp reactions. They are *not* a place to hold agency strategy.

#### Super Agents

ClickUp's "human-level" AI teammates. The headline capabilities (from ClickUp's own description):

- **Assign, message, and @mention** them like a human teammate — they pick up context and act.
- **No per-role setup required.** You don't have to define a fixed "role" for a Super Agent before using it; you simply assign it work (a task, a mention, a message) and it acts on the Workspace context. So a Super Agent is an assignment target, not a job description to maintain.
- **500+ work skills** (send emails, DM users, schedule events, act across connected apps).
- **24/7, ambient, self-learning**, with multi-layer memory and Workspace-wide context.
- Built to "own outcomes" across multi-step workflows, not just answer single prompts.

This is exactly the mental model Axel described: each AI team member appears in ClickUp as a Super Agent that can be assigned to tasks, forming a visible extra layer on top of our system.

### Our plan and the cost reality (read before deciding)

Saerens is on the ClickUp **Business** plan. That sets two practical reference points:

- **API throughput:** 100 requests/min/token (see the *ClickUp API* section) — design automations to batch reads, not loop per item.
- **AI access:** Super Agents and Autopilot Agents are powered by **ClickUp Brain**, a paid add-on on top of the Business plan. Brain is billed **per human-member seat** and is **all-or-nothing** — you license it for *every* member in the Workspace, not just the few who use it (guests are usually free but limited).

So the cost question is about the *human-member Brain seats* needed to unlock the AI layer, plus any AI usage/credits Super Agent actions consume — **not** a separate seat per AI agent (a Super Agent is just an assignment target). Verify current pricing and usage limits before committing, because it materially changes the build-vs-buy maths.

> Verification note: the per-member, all-or-nothing Brain pricing model and the Super Agents capabilities below were last verified June 2026 against `clickup.com/brain/pricing` and `clickup.com/brain/agents`. ClickUp's AI packaging changes often — re-check both pages (and confirm what's included on the Business plan) before committing budget or build decisions.

### The strategic question for Saerens

There are two honest ways to realise "AI team members as assignable teammates":

1. **ClickUp-native (Super Agents).** Our agents become ClickUp Super Agents that Axel assigns work to directly (no per-role setup). Pros: zero custom UI, native assign/mention/message, Axel works where he already is, mobile + notifications for free, and ClickUp owns the agent runtime. Cons: needs the Brain add-on on the Business plan, behaviour is configured inside ClickUp (less of our own control), and it risks ClickUp drifting into a competing brain if strategy leaks out of this repo.
2. **App-as-brain + ClickUp-as-layer (recommended hybrid).** The app stays the single source of truth (agent definitions, knowledge, dossiers, decisions). ClickUp holds **tasks, assignment, statuses, and approvals**. Work is assigned in ClickUp (to a Super Agent, a bot user, or via an `Assigned agent` custom field), while the actual generation runs in the app and posts results back via the API. Pros: one brain, full control of agent behaviour, AI cost stays predictable. Cons: we build the task/approval glue (create task, post comment, react to `Approved` webhook).

**Recommendation:** keep the brain in the app and use ClickUp as the visible task and approval surface. Since Super Agents are simply assignable (no roles to maintain) and the Business plan already supports the Brain add-on, Super Agents are a fine *assignment and conversation surface* — Axel can assign and message them naturally — as long as the actual decisions and generations still run from the app, not from logic buried in ClickUp. Either way, the rule from `ARCHITECTURE.md` holds: the app decides, ClickUp tracks and gates, the executor acts only after human approval.

### How an agent works across two tools (the agreed execution pattern)

This is the model Saerens chose for when ClickUp is adopted. It is documented now so future build work can follow it directly. ClickUp is **not** wired up yet — see "Sequencing" below.

#### One agent, two tools (like a human)

Each AI team member is a single colleague that *lives in two tools*, exactly like Axel does. Its brain — definition, persona, knowledge, decision rules — lives here in `agents/` and `knowledge/` (the source of truth). Its **presence** appears in ClickUp as a Super Agent that can be assigned and messaged. The ClickUp Super Agent is **generated/synced from the repo definition, never independently re-authored inside ClickUp**: the repo decides who the agent is, ClickUp only shows that same agent. This keeps one brain and avoids drift between the two tools.

#### Two hats in every loop: proposer and executor

Within one automation there are two distinct responsibilities, deliberately separated by the approval gate:

- **Proposer (read-only).** Gathers data and proposes a change. It never writes to a live ad account — it may read the account (e.g. Google Ads API), compute candidates, and create a ClickUp task describing what it wants to do.
- **Executor (write).** Applies the approved change to the live account, but **only after Axel has approved**.

The same colleague can wear both hats, but the write action is always a separate, deliberate step behind the gate. Reading is always allowed; writing is never allowed before approval. This is the brain-vs-executor rule from `ARCHITECTURE.md`: the app decides, ClickUp gates, the executor acts.

#### Scope per "tak" (one self-contained loop)

Every automation is delineated as its own branch (*tak*) — one repeatable, self-contained loop:

1. **Trigger** — a schedule or event fires (e.g. weekly).
2. **Gather** — the proposer reads the relevant data (Google Ads API, client dossiers).
3. **Propose** — it creates a ClickUp task with the concrete proposed change and assigns Axel (see the *ClickUp API* section).
4. **Approve (human gate)** — Axel checks manually and approves by assigning the executing agent (and/or moving the task to an approved status).
5. **Execute** — the approval signal (a webhook on assignment/status change, see the *ClickUp Webhooks* section) tells the executor (n8n/app) to apply the change. ClickUp itself never writes to Google Ads; it only signals.
6. **Report back** — the result is posted to the task as a comment, closing the loop.

#### Worked reference example: weekly negative-keyword exclusion

The first concrete *tak*, captured as the canonical illustration:

1. The weekly "exclude search terms" task is triggered on a schedule.
2. The agent (proposer) pulls all candidate negative keywords via the Google Ads API, organised per campaign / ad group where relevant.
3. It creates a ClickUp task listing the proposed exclusions and **assigns Axel** for confirmation.
4. Axel reviews manually. On agreement, he **assigns the executing agent** to carry out the work.
5. That assignment triggers the executor to apply the exclusions to the live account, then post a confirmation comment back on the task.

This matches Saerens' standing rule (`knowledge/google-ads-standards.md`, `agents/google-ads-optimization-specialist.md`): nothing touching a live account happens without human approval.

#### Sequencing

ClickUp is adopted only once the core project (the app as brain: agents, knowledge, generations) is largely in order. When that point is reached, build each *tak* as its own loop using the pattern above.

### Notes and cautions

- **One brain.** Whatever we choose, agent strategy lives in this repo's `agents/` and `knowledge/`, not split across ClickUp.
- **Confirm Brain pricing on Business first.** The per-member, all-or-nothing Brain seat model (and any AI usage limits) is the deciding cost factor on the Business plan — do not assume; check what's included.
- **Approval stays human.** Neither Autopilot nor Super Agents should write to a live ad account without the approval gate.

### Related

- The *ClickUp Platform* section — Spaces, Lists, statuses, members vs. guests.
- The *ClickUp API* section — assigning tasks and posting results programmatically.
- The *ClickUp Webhooks* section — reacting to assignment and approval events.
- `ARCHITECTURE.md` — the brain-vs-executor model this decision sits inside.
