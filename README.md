# Saerens Advertising — AI Team

This repository contains the **documentation-first foundation** for the internal AI agent system of **Saerens Advertising**, a Belgian, Google Partner–certified advertising agency specializing in Google Ads, analytics, conversion tracking, web design and SEO.

The main principle is that each AI agent should behave like a **specialized agency team member**, not a generic chatbot. Agents have:

- A clear role
- Clear responsibilities
- Clear limitations
- Required input before they produce final work
- Structured output formats
- Access to agency standards (`knowledge/`)
- Access to client context (`clients/`)
- Access to workflow instructions (`workflows/`)

## What this is (and is not)

This version is **documentation only** — the "brain" of the AI team. There is no app, UI, agent selector, or model integration yet. The goal of this stage is to define the team clearly so that any future interface (or human) can load the right agent profile, client context, and workflow and produce consistent, agency-standard output.

The system does **not** execute campaigns, make live changes, or connect to external tools (Google Ads, GA4, ClickUp, Meta, Slack). Those are explicitly future phases — see `ROADMAP.md`.

## The core idea

Every request is answered by combining five layers:

```
Global rules (AGENTS.md)
+ Selected agent instructions (agents/)
+ Selected client context (clients/)
+ Selected workflow (workflows/)
+ The user's request
= Structured, reviewable output (templates/)
```

This keeps agent roles, client data, and processes separate and reusable. See `ARCHITECTURE.md` for the full picture.

## How the docs are organized

| Folder / file | Purpose |
|---|---|
| `README.md` | This file — what the system is and how it's organized |
| `AGENTS.md` | The constitution: global rules, hierarchy, current and future agents |
| `ROADMAP.md` | The phased plan from documentation-first to tool integrations |
| `ARCHITECTURE.md` | How the layers combine and how the folders fit together |
| `agents/` | One role file per AI agent (role, responsibilities, limits, input, output) |
| `clients/` | A reusable client template plus example client context files |
| `workflows/` | Repeatable agency processes (campaign setup, audit, reporting, email) |
| `templates/` | Reusable structured output formats |
| `knowledge/` | Agency standards: principles, tone of voice, agent personas, Google Ads, analytics, reporting, naming |

## Current MVP agents

Each agent is also a distinct team member with its own character (names are proposed starting points — rename freely; see `knowledge/agent-personas.md`):

- **Orchestrator** *(Lotte)* — routes requests to the right specialist and prepares clean briefs
- **Google Ads Strategist** *(Daan)* — defines campaign strategy and account structure
- **Google Ads Setup Specialist** *(Senne)* — turns approved strategy into campaign-ready setups
- **Google Ads Optimization Specialist** *(Femke)* — improves live accounts (search terms, bids, budgets, CPA/ROAS)
- **Reporting Specialist** *(Bram)* — turns performance data into clear client reports
- **Copywriter** *(Marie)* — writes ads, headlines, and on-brand copy

## How to use it (today)

1. Pick the relevant **client** file in `clients/`.
2. Pick the relevant **workflow** in `workflows/`.
3. Pick the relevant **agent** in `agents/`.
4. Combine global rules + agent + client + workflow + your request.
5. Produce output using the matching **template** in `templates/`.
6. Review as a human before anything is used in real work.

## The MVP bar

> Saerens Advertising can use this structured foundation to select a client, a workflow, and an agent, provide a request, and receive consistent, high-quality, agency-standard output that a human can review and use in real work.

Not "the AI does everything automatically" — but "the AI produces work like a trained specialist who understands how we work."
