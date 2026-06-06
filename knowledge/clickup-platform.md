# ClickUp Platform — Structure & Core Concepts

A reference for how ClickUp is organised, written so we can map the Saerens AI team and client work onto it correctly. ClickUp is the work-management surface Axel already uses day to day: a place where work lives as tasks, work is assigned to a person (or an AI teammate), and progress is tracked through statuses. This document explains the platform's structure and the concepts we will build on; the API side is covered in `knowledge/clickup-api.md`, the event/trigger side in `knowledge/clickup-webhooks.md`, and the AI-teammate side in `knowledge/clickup-ai-agents.md`.

Getting the structure right first matters: a clear ClickUp structure makes future automation safe, an unclear one makes automation create faster chaos (the same guiding principle as in `ARCHITECTURE.md`).

## The Hierarchy (six levels)

ClickUp is built on a fixed six-level hierarchy. Everything we automate has to address one of these levels by id.

1. **Workspace** — the whole organisation. One Workspace per company; everything else lives inside it. (Naming gotcha: in API v2 a Workspace is called a "Team" — see `knowledge/clickup-api.md`.)
2. **Space** — a top-level grouping of work. Spaces have their own settings, statuses, and access control, and can be private. Group them by department, service line, or client set.
3. **Folder** — an *optional* layer inside a Space that houses Lists. Creating a Folder auto-creates a List inside it. Folders can be skipped entirely.
4. **List** — the container that actually holds tasks. A List can live inside a Folder *or* directly in a Space (a "folderless" List). This is the unit most automations target.
5. **Task** — the actionable item: the thing assigned to a person or agent, moved through statuses, commented on, and given custom-field values.
6. **Subtask** — a granular item under a task. Nested subtasks are a ClickApp that an owner/admin must enable.

In addition to these locations, a Workspace also holds **Docs**, **Chat**, **Dashboards**, **Goals**, and **Views** — surfaces an automation may read from or post to.

## Core concepts we build on

- **Statuses.** Each task moves through a status set defined per Space (or overridden per List). Statuses are how we model an approval lifecycle (e.g. `Proposed` → `Needs approval` → `Approved` → `Done`). This is the backbone of the human-in-the-loop safety model.
- **Assignees.** A task can be assigned to one or more members. AI teammates ("Super Agents") can be assignees too — see `knowledge/clickup-ai-agents.md`.
- **Custom Fields.** Structured, typed metadata on a task (client id, target CPL, account id, approval flag, etc.). Field *types* are created in the UI; the API reads them and sets values. The supported types and the set-value endpoint are in `knowledge/clickup-api.md`.
- **Custom Task Types.** Beyond the default "Task", a Workspace can define task types (e.g. "Report", "Optimisation", "Audit") so a List can mix distinct kinds of work. Useful for letting one client Space carry reports and optimisation proposals as distinct objects.
- **Tags.** Lightweight cross-cutting labels, independent of the hierarchy.
- **Dependencies & relationships.** Tasks can block / wait on / link to other tasks — useful when an approval must precede an execution task.
- **Views.** List, Board, Calendar, Gantt, etc. Views are presentation only; they never change where a task lives.
- **ClickApps.** Per-Space feature toggles (time tracking, nested subtasks, custom task types, etc.). Some API capabilities depend on the matching ClickApp being on.

## Members vs. guests (matters for cost)

ClickUp bills per **member** seat. "Members" (owners, admins, members, limited members) are billable; **guests** are usually free but restricted. This distinction drives the cost of the AI add-on (ClickUp Brain is priced per member seat, all-or-nothing across the Workspace) — the full pricing reality and what it means for representing our AI team is in `knowledge/clickup-ai-agents.md`.

## A proposed structure for Saerens

A starting structure to map our model onto ClickUp (to be confirmed with Axel, not yet built):

- **Workspace:** Saerens Advertising (one).
- **Spaces:** one Space per client for real client work, plus an internal **"AI Team"** Space for cross-client operations (reports queue, optimisation proposals, audits).
- **Folders/Lists:** within a client Space, Lists per work stream — e.g. `Reporting`, `Optimisation`, `Setup`, `Communication` — so each automation targets a specific List id.
- **Statuses (approval lifecycle):** a shared status set such as `Backlog` → `Proposed` → `Needs approval` → `Approved` → `In progress` → `Done`, so the "proposing/acting needs approval" rule from `ARCHITECTURE.md` is enforced by where a task sits.
- **Custom Fields:** `Client` (link to our dossier id), `Account ID` (Google Ads), `Assigned agent` (which AI specialist), `Approval` (checkbox), `Source run` (link back to the app's generation) — so a ClickUp task and an app generation stay traceable to each other.
- **Custom Task Types:** `Report`, `Optimisation proposal`, `Audit`, `Setup` to keep distinct deliverables legible on one board.

This keeps the app as the brain and source of truth while ClickUp becomes the visible task, assignment, and approval layer on top.

## Notes and cautions

- **The app stays the source of truth.** ClickUp holds tasks, statuses, and approvals — *not* agent definitions or client dossiers. Two competing sources of truth drift apart; keep the brain in the app (see `ARCHITECTURE.md`).
- **Structure before automation.** Document the Space/List layout and the approval status set before switching any automation on.
- **Don't over-nest.** Folders are optional; prefer folderless Lists unless a Space genuinely needs grouping.

## Related

- `knowledge/clickup-api.md` — authentication, endpoints, and how we read/write this structure.
- `knowledge/clickup-webhooks.md` — the event triggers that fire when statuses or tasks change.
- `knowledge/clickup-ai-agents.md` — Autopilot vs Super Agents, assignment, and the per-seat cost.
- `ARCHITECTURE.md` — the brain-vs-executor model this structure plugs into.
