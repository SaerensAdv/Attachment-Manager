# ARCHITECTURE

This document explains how the pieces of the Saerens Advertising AI team fit together. The root markdown is the **brain** (configuration); the app in `artifacts/` + `lib/` is the **engine** that reads it at runtime. The brain is kept clean and separate so the engine — and a human — can load the right agent, client context, and workflow directly. See `ROADMAP.md` for what is shipped versus outstanding.

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

## Agency organisation

The team is organised exactly like the agency itself: a small number of **departments**, each with one named **owner** (the department head) and a fixed set of **agents**. This is the single org model — there is no separate "hierarchy" and "leadership" view. AGENTS.md (`## Agency organisation`) is the source of truth; every agent belongs to exactly one department, and every department names one owner.

Departments are ordered (0–5) and describe *who works together and where work flows*, not the prompt-assembly order above:

- **Directie** — the Orchestrator routes every request and owns priorities.
- **Paid Media**, **SEO & Web**, **Content & Creative** — the execution departments that produce the work.
- **Client & Growth** — onboarding, client success, and new business.
- **Quality** — the review gate that checks work before it reaches the client.

Each department declares which departments it **hands off to**; the reverse (*receives from*) is derived automatically, so a handoff is described in only one place. This organisation is **structure and presentation only** — it shapes the docs, the team page, and the system map, but it does **not** change how a run is executed. The Orchestrator still decides routing per request via its own routing table; department heads are not yet activated at runtime.

## The deliverable layer

The five layers produce structured **markdown** — the team's combined work. On top of that, a workflow can declare a **deliverable**: the concrete end product the team's work should be turned into (e.g. a ready-to-paste website build prompt, a Google Ads bulk CSV, a Meta ad image). After the team finishes, the deliverable layer converts the combined markdown into that artifact.

A workflow opts in with a single marker line, an HTML comment so it stays invisible in the rendered doc and creates no graph edges:

```
<!-- deliverable: replit-prompt -->
```

Workflows without a marker keep markdown as their result, exactly as before. The deliverable step is best-effort: if it fails, the team's markdown is still returned.

There is a family of **Replit build-prompt** deliverables — each converts the team's work into one paste-ready prompt for the Replit Agent, grounded in its artifact-type knowledge node, and none of them puts anything live:

- `replit-prompt` — a website / landing page (`workflows/web-build.md`, `knowledge/replit-builds.md`).
- `slide-deck-prompt` — a presentation / slide deck (`workflows/slide-deck.md`, `knowledge/replit-builds.md`).
- `animated-video-prompt` — a short animated video (`workflows/animated-video.md`, `knowledge/replit-builds.md`).
- `data-app-prompt` — an interactive dashboard / data app (`workflows/data-app.md`, `knowledge/replit-builds.md`).

They share one builder (`buildBuildPrompt`) so the rules (no emoji, preserve `[AAN TE VULLEN: …]` placeholders, lose no team decision, never invent data, nothing goes live) stay identical; only the artifact wording, the Replit app type, the knowledge node, and the section skeleton differ per kind. Other deliverables (`google-ads-csv`, `negative-keywords-csv`, `monthly-report-email`) are bulk-import or action artifacts handled the same way.

## Folder map

```
saerens-ai-team/
├── README.md            # What the system is, how it's organized
├── AGENTS.md            # Global rules + agency organisation (the constitution)
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
│   ├── demand-gen-specialist.md
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
│   ├── creative-designer.md
│   ├── brand-identity-designer.md
│   ├── legal-contracts-specialist.md
│   ├── operations-coordinator.md
│   └── personal-brand-strategist.md
│
├── clients/             # Client context (data, kept separate from agents)
│   ├── _template.md
│   └── client-example.md
│
├── workflows/           # Repeatable processes
│   ├── campaign-setup.md
│   ├── account-audit.md
│   ├── account-optimization.md
│   ├── budget-management.md
│   ├── monthly-reporting.md
│   ├── client-email.md
│   ├── client-update.md
│   ├── seo-audit.md
│   ├── content-production.md
│   ├── ad-copy.md
│   ├── ad-creatives.md
│   ├── meta-ads-setup.md
│   ├── demand-gen-setup.md
│   ├── shopping-feed-setup.md
│   ├── landing-page-review.md
│   ├── cro-experiment.md
│   ├── web-build.md
│   ├── slide-deck.md
│   ├── animated-video.md
│   ├── data-app.md
│   ├── tracking-setup.md
│   ├── measurement-audit.md
│   ├── competitor-research.md
│   ├── client-onboarding.md
│   ├── sales-proposal.md
│   ├── email-automation.md
│   ├── brand-identity.md
│   ├── legal-review.md
│   └── linkedin-personal-brand.md
│
├── templates/           # Reusable output formats
│   ├── campaign-brief.md
│   ├── google-ads-output.md
│   ├── reporting-output.md
│   ├── audit-report.md
│   ├── client-email.md
│   ├── ad-creative-output.md
│   ├── competitor-briefing.md
│   ├── onboarding-dossier.md
│   ├── proposal.md
│   └── task-output.md
│
├── knowledge/           # Agency standards (the quality bar)
    ├── agency-principles.md
    ├── tone-of-voice.md
    ├── belgian-market-context.md
    ├── naming-conventions.md
    ├── agent-personas.md
    ├── founder-voice.md
    ├── portrait-art-direction.md
    ├── saerens-brand.md
    ├── saerens-deck-layout.md
    ├── google-ads-standards.md
    ├── demand-gen.md
    ├── google-ads-policy.md
    ├── budget-management-standards.md
    ├── ad-copy-standards.md
    ├── meta-ads-standards.md
    ├── ad-creative-standards.md
    ├── seo-standards.md
    ├── helpful-content-standards.md
    ├── landing-page-standards.md
    ├── experimentation-standards.md
    ├── analytics-standards.md
    ├── reporting-standards.md
    ├── competitive-research-standards.md
    ├── screaming-frog-crawl-intake.md
    ├── replit-prompting.md
    ├── replit-slide-decks.md
    ├── replit-animated-videos.md
    ├── replit-data-apps.md
    ├── replit-canvas.md
    ├── premium-web-motion.md
    ├── clickup-platform.md
    ├── clickup-api.md
    ├── clickup-ai-agents.md
    └── clickup-webhooks.md
│
├── artifacts/           # The running app (the engine that reads the brain)
│   ├── api-server/      # Express API: orchestrator, generation engine, deliverables,
│   │                    #   live integrations, scheduler, email, client DB, billing
│   ├── system-map/      # React "Operations Atlas": the Kaart (doc-graph view),
│   │                    #   generation command bar, doc reader, clients, team, dashboard
│   ├── audit-car-audio-*/         # slide-deck artifacts
│   └── saerens-audit-deck-template/
│
├── lib/                 # Shared workspace libraries
│   ├── api-spec/        # OpenAPI spec (source for codegen)
│   ├── api-zod/         # Zod schemas generated from the spec
│   ├── api-client-react/# React Query hooks for the frontend
│   ├── brand/           # Saerens brand tokens
│   ├── db/              # Drizzle schema + client
│   └── integrations-anthropic-ai/  # AI access via the Replit proxy
│
└── deck-templates/      # Deck source kept out of the 7-artifact cap (uncounted)
```

## Request flow (today)

1. The **Orchestrator** reads the request and decides: which client, which workflow, which specialist, and what is missing.
2. If information is missing, the Orchestrator asks before handing off.
3. The chosen **specialist agent** receives the combined context and follows its workflow.
4. The agent produces output using the matching **template** and the **knowledge** standards.
5. A closing **quality gate** runs automatically after the team finishes: the **QA & Compliance Reviewer** always checks claims, policy, and live-spend safety, and the **Humanizer** adds a final natural-voice pass when the output is client-facing. These two are cross-cutting steps, not channel specialists, so individual workflows do not list them as team members.
6. The output is reviewed by a human before it is used in real work.

## How the app runs it (shipped)

The request flow above is no longer manual: the **API server** (`artifacts/api-server`) is the engine. It assembles layers 1–5 from the root markdown at runtime (an agent loader + prompt builder), retrieves supporting docs via hybrid BM25 + embedding search, calls the AI model through the Replit proxy, streams the run over SSE, applies the closing quality gate, and — when the workflow declares one — turns the result into a typed **deliverable**. Every run is archived with per-step records for an audit trail. The **Operations Atlas** frontend (`artifacts/system-map`) is the human surface: the Kaart (doc-graph view), the generation command bar, the doc reader, the client register, the team page, and the dashboard. The root markdown remains the configuration the engine reads — which is why the structure is kept clean.

## Execution layer (brain vs. executor)

The brain-vs-executor split keeps control in one place:

- **The app is the brain and source of truth.** It holds the agents, knowledge, client dossiers and live account data, and it *decides* what should happen.
- **An executor only carries out actions** — pulls data, performs the approved change, and writes the result back. It holds no strategy of its own.
- The executor is the **in-app scheduler** (a `croner` tick that fires due runs, with a compare-and-set guard against double-firing) plus the deliverable/email layer. n8n was evaluated and **dropped** in favour of keeping the executor in-process; 24/7 operation needs a Reserved VM deployment.
- Two safety categories hold: **read-only/reporting** may run end-to-end automatically; **proposing/acting** (anything touching the ad account or the client) always needs human approval before anything is sent or written. The monthly-report email, for example, is held in an approval queue and only delivered after a human approves.

Founder-priority automations, in order: **monthly reports** (shipped — generated, held for approval, then emailed), **search-term checks for negative keywords**, and **ad copy generation**.

Some data sources cannot be reached from the cloud at all. **Screaming Frog SEO Spider** is a licensed *desktop* crawler, so its technical crawl follows the brain-vs-executor split in a semi-automatic shape ("Model B"): the agency runs the crawl on their own machine and pushes the export to the brain, which stores the **latest** crawl per client and reads it during runs (never starting a crawl itself, never inventing numbers). The intake contract and the agent guidance live in `knowledge/seo-web-content.md`.

### ClickUp as the work-management & approval layer

Axel already runs the agency in ClickUp, so it is the natural surface for *tasks, assignment, statuses, and human approval* — the visible layer on top of the brain. The intent: the app creates a task per deliverable, assigns the responsible agent, posts the generated draft back, and a human moves the task to `Approved`; that approval (delivered via webhook) is what lets the executor act. ClickUp does **not** become a second brain — agent definitions, knowledge, and dossiers stay in this repo.

ClickUp also offers AI teammates ("Super Agents") that can be assigned tasks directly. That is appealing but gated behind a per-seat, all-or-nothing AI add-on, so the recommended default is a hybrid: app-as-brain, ClickUp-as-layer, agents represented by a custom field or a single bot user rather than a paid seat each. The full analysis and the platform/API details live in `knowledge/clickup.md`, `knowledge/clickup.md`, `knowledge/clickup.md`, and `knowledge/clickup.md`.

## Design rules

- One concept per folder. Do not mix client data into agent files or standards into workflows.
- New agents follow the shared agent file structure (role → character & personality → responsibilities → not responsible for → required input → output format) and get a persona per `knowledge/agent-personas.md`.
- New clients copy `clients/_template.md`.
- New output types get a template before agents are asked to produce them.
- Anything affecting live spend, tracking, or accounts must surface a **Human approval required** step.
