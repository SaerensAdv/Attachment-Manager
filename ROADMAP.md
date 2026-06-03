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
- Google Ads API *(live, read-only — in place)*
- Google Search Console API *(read-only SEO/search data, replaces manual CSV/zip import in the "huidige stand"-sectie)*
- Google Analytics 4
- Google Sheets / Looker Studio (reporting)
- Slack / email (communication)
- Meta Ads
- CRM

At this stage agents move from *"here is what I recommend"* to *"here is the task I prepared in ClickUp"* — always with human approval before anything goes live.

**Answers:** *Can the system safely act, not just advise?*

---

## Phase 6 — Controlled automations (triggers)

Once the dossiers are richly filled (briefing, website intake, live Google Ads, later Search Console), the app's workflows can be triggered automatically instead of by hand. The brain still lives in the app; n8n only triggers and executes. The whole point of this phase is to add automation **without losing control**.

**Goal:** run the right workflow at the right moment, safely.

### Two categories — this split is the safety valve

1. **Read-only / reporting** — nothing changes in the ad account or reaches the client, so it may run fully automatically end-to-end. No approval needed.
2. **Proposing / acting** — the agent produces a *proposal*; a human approves; only then does n8n execute the change. Never auto-write. Anything that touches the ad account or the client falls here.

### Automation backlog (to prioritize later)

| Automation | Trigger | Category | Status / notes |
| :--- | :--- | :--- | :--- |
| Monthly Google Ads report | Monthly (schedule) | Read-only | Closest to ready — `monthly-reporting.md` + `account-audit.md` + live Ads data exist; needs trigger + delivery. |
| Weekly search-term audit → negative keywords | Weekly (schedule) | Proposing/acting | Needs an SOP defining when a term is wasteful + an approval gate before n8n writes negatives. |
| Incoming client email handling | Email received (event) | Proposing/acting | Sensitive — human-in-the-loop required. `client-email.md` + client agents exist. Still to be discussed. |
| _…more to be added_ | | | |

### New building block this phase needs

An **automation catalog + SOP convention**: every automation is documented *before* it is switched on — its trigger, which workflow it calls, which knowledge/SOP it depends on, and whether it has an approval step. Without this catalog, automation creates faster chaos instead of order (see the guiding principle at the top).

Open topics to discuss: which workflows/templates/knowledge are missing, whether new agents or SOPs are needed per automation, and the exact approval + decision-logging flow.

**Answers:** *Can the system act on its own schedule without losing human control?*

---

## What stays true across all phases

- Output is always reviewable by a human before real use.
- Agents never claim to have executed something they have not.
- Client data stays separate from agent instructions.
- Agency standards in `knowledge/` are the source of truth for quality.
