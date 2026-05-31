# ROADMAP

This roadmap describes how the Saerens Advertising AI team grows from a documentation foundation into a system that can support real agency work. Each phase has a clear question it must answer before moving on.

Guiding principle: **build the AI brain first, connect it to tools later.** A clear role structure makes future integrations easy; unclear structure makes integrations create faster chaos.

---

## Phase 1 — Documentation-first foundation (this version)

**Goal:** define the AI team clearly.

Includes:
- `README.md`, `AGENTS.md`, `ROADMAP.md`, `ARCHITECTURE.md`
- Agent role files (`agents/`)
- A client template + one example client (`clients/`)
- Core workflows (`workflows/`)
- Output templates (`templates/`)
- Agency standards (`knowledge/`)

**Answers:** *Do we know which agents should exist and how they should behave?*

**Status:** in place.

---

## Phase 2 — Simple agent selector

A minimal interface (web or CLI):

```
Choose client:   [Client A]
Choose workflow: [Google Ads campaign setup]
Choose agent:    [Google Ads Setup Specialist]
Enter request:   [textarea]
→ Generate output
```

The app loads global rules + agent instructions + client context + workflow + user input, sends it to an AI model, and returns structured output.

**Answers:** *Can we reliably generate useful output from structured context?*

---

## Phase 3 — Orchestrator mode

Instead of manually selecting an agent, the user types a plain request:

> "I need a new campaign setup for a roofing client in Antwerp."

The Orchestrator decides the relevant client, workflow, agent, and missing information, then hands off.

**Answers:** *Can the system route work intelligently?*

---

## Phase 4 — Memory and reusable outputs

Add storage for:
- Previous outputs
- Approved templates and campaign structures
- Client preferences and brand restrictions
- Common questions

**Answers:** *Can the AI team learn from agency work over time?*

---

## Phase 5 — Tool integrations

Only here do live connections enter the picture, likely in this order of value for the agency:

- ClickUp (task drafts)
- Google Ads API
- Google Analytics 4
- Google Sheets / Looker Studio (reporting)
- Slack / email (communication)
- Meta Ads
- CRM

At this stage agents move from *"here is what I recommend"* to *"here is the task I prepared in ClickUp"* — always with human approval before anything goes live.

**Answers:** *Can the system safely act, not just advise?*

---

## What stays true across all phases

- Output is always reviewable by a human before real use.
- Agents never claim to have executed something they have not.
- Client data stays separate from agent instructions.
- Agency standards in `knowledge/` are the source of truth for quality.
