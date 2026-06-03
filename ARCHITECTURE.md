# ARCHITECTURE

This document explains how the pieces of the Saerens Advertising AI team fit together. In this version everything is documentation, but the structure is designed so a future app (see `ROADMAP.md`) can use it directly.

## The five-layer model

Every request is answered by combining five layers in a fixed order. Think of it as building one complete instruction set before the agent produces anything.

```
1. Global rules        → AGENTS.md            (how every agent must behave)
2. Agent instructions  → agents/<agent>.md    (the specialist's role and output)
3. Client context      → clients/<client>.md  (who the work is for)
4. Workflow            → workflows/<flow>.md  (the process being followed)
5. User request        → the actual ask
                         ─────────────────────
                       = Structured output, formatted with templates/<template>.md
```

This separation is deliberate:

- **An agent is a role *and* a character** (e.g. Setup Specialist "Senne"). It defines what the agent does and who it is, but contains no client data. Its persona shapes *how* it works; it never overrides the client-facing brand voice (see `knowledge/agent-personas.md`).
- **A client file is context** (e.g. a roofing company in Antwerp). The same client is reused across many agents and workflows.
- **A workflow is a process** (e.g. campaign setup). The same workflow can involve several agents.
- **A template is an output shape.** It makes results consistent and comparable over time.
- **The knowledge base is the quality bar.** Standards live in one place and every agent respects them.

## Why separation matters

If client data lived inside agent files, every new client would mean editing every agent. By keeping client context in `clients/`, agent files stay stable and reusable. The same logic applies to workflows, templates, and standards — each concept changes in exactly one place.

## The deliverable layer

The five layers produce structured **markdown** — the team's combined work. On top of that, a workflow can declare a **deliverable**: the concrete end product the team's work should be turned into (e.g. a ready-to-paste website build prompt, a Google Ads bulk CSV, a Meta ad image). After the team finishes, the deliverable layer converts the combined markdown into that artifact.

A workflow opts in with a single marker line, an HTML comment so it stays invisible in the rendered doc and creates no graph edges:

```
<!-- deliverable: replit-prompt -->
```

Workflows without a marker keep markdown as their result, exactly as before. The first implemented deliverable is `replit-prompt` on `workflows/web-build.md`. The deliverable step is best-effort: if it fails, the team's markdown is still returned.

## Folder map

```
saerens-ai-team/
├── README.md            # What the system is, how it's organized
├── AGENTS.md            # Global rules + agent hierarchy (the constitution)
├── ROADMAP.md           # Phased plan
├── ARCHITECTURE.md      # This file
│
├── agents/              # Role definitions
│   ├── orchestrator.md
│   ├── google-ads-strategist.md
│   ├── google-ads-setup-specialist.md
│   ├── google-ads-optimization-specialist.md
│   ├── reporting-specialist.md
│   ├── copywriter.md
│   ├── seo-specialist.md
│   ├── meta-ads-strategist.md
│   ├── landing-page-specialist.md
│   ├── web-developer.md
│   ├── analytics-tracking-specialist.md
│   ├── client-success-agent.md
│   ├── sales-proposal-agent.md
│   ├── cro-specialist.md
│   ├── competitive-research-analyst.md
│   ├── client-onboarding-agent.md
│   ├── qa-compliance-reviewer.md
│   ├── humanizer.md
│   ├── shopping-feed-specialist.md
│   ├── email-automation-specialist.md
│   └── creative-designer.md
│
├── clients/             # Client context (data, kept separate from agents)
│   ├── _template.md
│   └── client-example.md
│
├── workflows/           # Repeatable processes
│   ├── campaign-setup.md
│   ├── account-audit.md
│   ├── monthly-reporting.md
│   ├── client-email.md
│   ├── seo-audit.md
│   ├── meta-ads-setup.md
│   ├── landing-page-review.md
│   ├── web-build.md
│   ├── tracking-setup.md
│   ├── client-update.md
│   ├── ad-creatives.md
│   └── sales-proposal.md
│
├── templates/           # Reusable output formats
│   ├── campaign-brief.md
│   ├── google-ads-output.md
│   ├── reporting-output.md
│   ├── client-email.md
│   ├── ad-creative-output.md
│   └── task-output.md
│
└── knowledge/           # Agency standards (the quality bar)
    ├── agency-principles.md
    ├── tone-of-voice.md
    ├── agent-personas.md
    ├── google-ads-standards.md
    ├── meta-ads-standards.md
    ├── ad-creative-standards.md
    ├── seo-standards.md
    ├── landing-page-standards.md
    ├── analytics-standards.md
    ├── reporting-standards.md
    └── naming-conventions.md
```

## Request flow (today)

1. The **Orchestrator** reads the request and decides: which client, which workflow, which specialist, and what is missing.
2. If information is missing, the Orchestrator asks before handing off.
3. The chosen **specialist agent** receives the combined context and follows its workflow.
4. The agent produces output using the matching **template** and the **knowledge** standards.
5. The output is reviewed by a human before it is used in real work.

## Request flow (future, Phase 2+)

A small app will assemble layers 1–5 automatically (an "agent loader" + "prompt builder"), send them to an AI model, and return the formatted output. The documentation in this repo is the configuration that app will read — which is why the structure is kept clean now.

## Design rules

- One concept per folder. Do not mix client data into agent files or standards into workflows.
- New agents follow the shared agent file structure (role → character & personality → responsibilities → not responsible for → required input → output format) and get a persona per `knowledge/agent-personas.md`.
- New clients copy `clients/_template.md`.
- New output types get a template before agents are asked to produce them.
- Anything affecting live spend, tracking, or accounts must surface a **Human approval required** step.
