# Saerens Advertising — AI Team

This repository is the **AI brain** for **Saerens Advertising**, a Belgian, Google Partner–certified advertising agency specializing in Google Ads, analytics, conversion tracking, web design and SEO — together with the **application** that runs on top of it.

The main principle is that each AI agent should behave like a **specialized agency team member**, not a generic chatbot. Agents have:

- A clear role
- Clear responsibilities
- Clear limitations
- Required input before they produce final work
- Structured output formats
- Access to agency standards (`knowledge/`)
- Access to client context (`clients/`)
- Access to workflow instructions (`workflows/`)

## What this is

There are two halves, kept deliberately separate:

1. **The brain (documentation).** The root markdown — `agents/`, `workflows/`, `knowledge/`, `templates/`, `clients/`, plus `AGENTS.md` — defines who the agents are, how they behave, and the agency's quality bar. This is the configuration.
2. **The app (`artifacts/` + `lib/`).** A running system that reads that markdown at runtime: an Express API ("the brain" engine) that routes requests, assembles prompts, calls the AI model, and produces reviewable deliverables, plus a React "Operations Atlas" frontend to see and drive it all. See `ARCHITECTURE.md`.

The app connects to **read-only** live data sources (Google Ads, GA4, Search Console, PageSpeed, Places, Business Profile, competitor ads, Bing Webmaster, Gmail, and a Screaming Frog crawl intake) to enrich its work. It does **not** make live changes to ad accounts on its own — anything that would touch live spend or reach a client passes through a **human approval** step first. See `ROADMAP.md` for what is shipped and what remains.

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

On top of that structured markdown, a workflow can declare a **deliverable** — the concrete end product the work becomes (a Replit build prompt, a Google Ads / negative-keyword CSV, a monthly report email, a branded PDF, an invoice or proposal). This keeps agent roles, client data, and processes separate and reusable. See `ARCHITECTURE.md` for the full picture.

## How the docs are organized

| Folder / file | Purpose |
|---|---|
| `README.md` | This file — what the system is and how it's organized |
| `AGENTS.md` | The constitution: global rules and the agency organisation (departments + owners) |
| `ROADMAP.md` | What is shipped and what remains, plus longer-term direction notes |
| `ARCHITECTURE.md` | How the layers combine, the folder/artifact map, and the runtime flow |
| `agents/` | One role file per AI agent (role, character, responsibilities, limits, input, output) |
| `clients/` | A reusable client template plus example client context files |
| `workflows/` | Repeatable agency processes (campaign setup, audit, reporting, email, …) |
| `templates/` | Reusable structured output formats |
| `knowledge/` | Agency standards: principles, tone of voice, agent personas, Google Ads, Meta Ads, SEO, landing page/conversion, analytics, reporting, naming, and more |
| `artifacts/` | The running app: the API server, the Operations Atlas frontend, and slide-deck artifacts |
| `lib/` | Shared workspace libraries (OpenAPI spec, Zod schemas, React client, brand, DB schema, AI integration) |

## The team

The team has grown well beyond the original MVP — `AGENTS.md` (`## Agency organisation`) is the source of truth for the current agents, their departments, and department owners. Each agent is a distinct team member with its own character (see `knowledge/agent-personas.md`); the Orchestrator routes each request to the right specialist and prepares clean briefs.

## How it works (today)

1. A request enters the API, where the **Orchestrator** decides the client, workflow, agent(s), and what (if anything) is missing.
2. The chosen specialist agent receives the combined context (global rules + agent + client dossier + workflow + request) and follows its workflow, using the matching template and the `knowledge/` standards.
3. Live read-only account data is pulled in where relevant to ground the work.
4. A closing quality gate runs automatically (QA & Compliance Reviewer always; Humanizer when the output is client-facing).
5. If the workflow declares one, the result is turned into a concrete **deliverable**.
6. A human reviews before anything is used in real work; anything touching live spend or the client is held for approval.

## The bar

> Saerens Advertising can select a client, a workflow, and an agent (or just describe the request and let the Orchestrator route it), and receive consistent, high-quality, agency-standard output that a human reviews and uses in real work.

Not "the AI does everything automatically" — but "the AI produces work like a trained specialist who understands how we work," with the human as the single quality-control gate.
