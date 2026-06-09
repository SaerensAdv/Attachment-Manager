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
| Weekly search-term audit → negative keywords | Weekly (schedule) | Proposing/acting | Founder priority. Needs an SOP defining when a term is wasteful + an approval gate before the executor writes negatives. |
| Ad copy generation | On request / schedule | Proposing/acting | Founder priority. Agent drafts ad copy from the dossier + `tone-of-voice.md` standards; generation is read-only, but a human approves before anything goes live. |
| Incoming client email handling | Email received (event) | Proposing/acting | Sensitive — human-in-the-loop required. `client-email.md` + client agents exist. Still to be discussed. |
| Monthly skill-refresh digest per agent | Monthly (schedule) | Proposing/acting | Self-initiated upkeep: each agent scans vetted, field-specific sources for what's new and returns proposals **with source + date**. Reuses the existing learning loop (one digest, per-item human approve/reject, non-destructive append). Guardrails against low-quality input: a pre-approved source whitelist per field (e.g. official Google Ads / Meta / GA4 changelogs), source+date mandatory, and dedupe against what the agent already knows. Default monthly; cadence can differ per role (fast-moving fields more often, stable roles softer or off). |
| _…more to be added_ | | | |

> **Today everything is still done by hand** — there are no automations yet. The founder's first three priorities are, in order, the **monthly report**, **search-term → negative-keyword checks**, and **ad copy generation** (the rows above). On tooling: **self-hosted n8n is free** (Community Edition — unlimited runs, commercial use allowed); only n8n *Cloud* is paid, so the executor choice is not cost-blocked. `pg-boss` remains the in-app scheduler fallback.

### New building block this phase needs

An **automation catalog + SOP convention**: every automation is documented *before* it is switched on — its trigger, which workflow it calls, which knowledge/SOP it depends on, and whether it has an approval step. Without this catalog, automation creates faster chaos instead of order (see the guiding principle at the top).

Open topics to discuss: which workflows/templates/knowledge are missing, whether new agents or SOPs are needed per automation, and the exact approval + decision-logging flow.

**Answers:** *Can the system act on its own schedule without losing human control?*

---

## Tooling & open-source improvements (cross-cutting)

These are not a phase of their own — they are open-source, free building blocks that make the existing phases more robust, cheaper, and easier to extend. Ordered by recommended sequence (cheap robustness first, larger refactors last). What is already in place is noted so we don't rebuild it.

Already in place: lexical retrieval (Orama / BM25), local multilingual semantic embeddings (Transformers.js, no API key), Drizzle + Postgres, Zod validation, Pino logging, Vitest.

### A. Cheap robustness wins (do first)
- **`supertest`** (on top of Vitest) — true end-to-end tests of the Express routes. First targets: the optimistic-locking `409` conflict on `PUT /clients/:id` and the partial-persist path in generation (the two gaps flagged in review).
- **`express-rate-limit` + `helmet`** — rate-limit the expensive `/api/generate` and `/api/route` (they cost LLM calls) and add standard security headers.
- **Zod env validation at boot** — fail fast with a clear message when a Google Ads secret has the wrong shape, instead of failing deep inside an API call.

### B. Smarter retrieval (build blocks already exist)
Today lexical (`retrieval.ts`) and semantic (`semantic.ts`) run separately, and embeddings live in memory (recomputed on every cold start).
- **Hybrid fusion (Reciprocal Rank Fusion)** — merge BM25 + embedding rankings into one. No new dependency; meaningfully better doc selection for agent context.
- **`pgvector` + Drizzle vector column** — persist embeddings in the existing Postgres. No recompute on restart, survives redeploys, and becomes the foundation for Phase 4 (memory / reusable outputs). This is the "vector upgrade path" the code already references.

### C. Phase 6 enabler — job scheduling
- **`pg-boss`** — a Postgres-backed job queue / scheduler that runs on the database we already have (no Redis, no extra infra). This is the missing building block for Phase 6 automations (monthly report, weekly audits). Keeps the principle intact: the brain stays in the app; the scheduler only triggers.

### D. Larger but valuable refactor
- **Vercel AI SDK (`ai`)** — provider-agnostic, works with the Anthropic-via-Replit proxy through a custom base URL. `generateObject` + Zod gives guaranteed-valid Orchestrator routing (no brittle JSON parsing); `streamText` replaces the hand-rolled SSE layer. Medium effort, hardens the two core flows (routing + generation).

### E. Optional / later
- **`remark` / `unified`** for edge derivation in `docs.ts` if it is currently regex-based — more robust link parsing (remark-gfm is already used on the frontend).
- **`google-ads-api` (Opteo)** — only worth adopting once we move from read-only to writing/mutating the ad account (Phase 5/6 "acting"). Not needed for the current read-only REST pull.

---

## Out-of-the-box / experimental ideas

Non-obvious, mostly free/open-source bets that lean into Saerens' actual reality (a Belgian Google Ads agency with a doc-graph brain and live read-only account data) and do things the big paid tools don't. Selected for impact-vs-effort. Both respect the core principle: advise/observe before acting, human reviews before real use.

### 1. Free competitive intelligence (no paid SEO tools)
- **Meta Ad Library API** — free and public. Pull the *live* running ads of any competitor without their account or consent (e.g. what a client's local rivals are advertising right now). An agent turns this into a "what the competition is doing" briefing for the client dossier. Unique selling point: most generic tools don't surface this for Belgian SMEs.
- **Optional extension — Wayback Machine API** (Internet Archive, free): diff competitor landing pages over time to detect changes in offer, pricing, or positioning. Same competitive-intel theme; pairs naturally with the Meta briefing.
- **Where it fits:** read-only intake/enrichment feeding the client dossier; the brain stays the source of truth, an agent synthesizes the briefing.

### 2. From advisor to watchdog (anomaly detection)
- Build on the Google Ads data we *already* pull (read-only). Detect anomalies locally — no new API needed — such as a spend spike or a CPA jump, then have an agent automatically draft an explanation plus a proposal.
- This is what makes the "AI team that watches your accounts 24/7" promise real, and it fits cleanly in Phase 6: read-only observation may run fully automatically, while any *action* still goes through human review.
- **Where it fits:** Phase 5 (live data) → Phase 6 (scheduled observation via the job scheduler), output always reviewable.

### 3. Squeeze more from data we already pull
- **Search-term mining** — use the search terms report (read-only, already accessible) so an agent proposes negative keywords and new ad groups automatically. Classic, recurring agency value, fully free.
- **Message-match check** — combine the landing page (via website-intake) with the live ad copy so an agent scores how well the message matches. A known Quality Score driver almost no one checks systematically.
- **Budget-pacing simulator** — take month-to-date spend (live data) + the monthly target, project the end-of-month spend, and flag over-/under-pacing. Pure math, no new API. A forward-looking cousin of the watchdog.

### 4. Proactive & calendar-aware (Belgian context)
- **Budget calendar** — combine Belgian public holidays + sector seasonality (e.g. *bouwverlof*, Black Friday, sales periods) so an agent proactively says "raise budget before this peak." Free (public holiday data).
- **Policy pre-check** — validate ad copy against Google Ads policies (no unproven superlatives, restricted categories) before launch. One agent with a policy doc in `knowledge/` prevents disapprovals.

### 5. A self-improving brain
- **Knowledge-gap detector** — analyze rejected outputs / low QA scores to identify which `knowledge/` docs are missing or weak, and propose SOP stubs. Feeds the learning loop: the knowledge base grows where it hurts.
- **Persona stress-test** — an agent that role-plays the client ("would a price-conscious roofer object to this?") and pressure-tests a proposal before it is sent. Raises quality, costs nothing.

### 6. Bilingual client communication (NL/FR)
- **"Explain it the way the client wants to hear it"** — an agent that rewrites internal analysis into a clear client email in the right language and tone. In Belgium, switching NL/FR is a real advantage; the brain already knows the content, this is just the packaging.

### 7. Smarter optimization & account hygiene
- **Impression-share gap** — read-only data shows impression share lost (to budget vs to rank), so an agent explains whether to raise budget or improve quality. Free.
- **Conversion-tracking health check** — detect broken or missing tracking (spend without conversions, missing tag when crawling the site) and warn immediately. Prevents weeks of optimizing on blind data.
- **"Red team" the account** — an adversarial agent that lists everything leaking money (broad match without negatives, display expansion on, search partners, etc.) as an audit checklist. Free, sharp value.

### 8. Onboarding autopilot ("Day 1 dossier")
- When a new client is added, automatically run a battery — website-intake + PageSpeed + KBO enrichment + a first competitor briefing — into one ready-made starter dossier. Glues existing building blocks together into a wow moment.

### 9. Self-improvement (a brain that gets better)
Three levels: learn from results, learn from how it is used, and guard against getting worse while it evolves. The existing learning loop and output archive are the foundations for all of this.

Learn from reality (closed loop):
- **Outcome feedback loop** — tie each past recommendation to the actual measured result weeks later (from live Ads data) and label it "worked / didn't." The brain learns which strategies work for which type of client — advice graded by reality, not opinion.
- **Win/loss analysis** — compare accepted vs rejected proposals to extract the implicit acceptance criteria and make them explicit guidelines.

Learn from how it is used:
- **Edit-diff auto-tuning** — when humans repeatedly tweak outputs before acceptance, diff those edits and propose improvements to the SOP/agent instructions (agents rewrite their own playbook, with human approval).
- **Retrieval self-eval** — log which retrieved docs were actually cited/used in accepted outputs vs ignored, then re-rank and prune the doc-graph and spot dead docs. Retrieval gets smarter from usage.

Stay reliable while it changes (quality CI):
- **Golden-set regression harness** — keep a set of representative tasks with known-good outputs and re-run them on every change to agents or `knowledge/`; the QA agent (LLM-as-judge) scores them to catch regressions before a human sees them. CI for the brain.
- **Confidence / uncertainty flagging** — agents report their own confidence; low-confidence output goes to a human first, and those cases become learning examples. The system asks for help exactly where it is weak.

Measure that it is actually improving:
- **Human-effort KPI** — track edit-distance (how much a human has to tweak) per agent over time. Falling = improving; rising = regression alarm. One hard metric for "is the brain getting smarter?".
- **Meta-supervisor over routing** — an agent that periodically reviews the orchestrator's routing decisions (did it pick the right agent?); mis-routes become improvements to the routing rules.

---

## Content to add (workflows / knowledge / templates)

This is content, not code: new markdown docs in the doc-graph. They fill real gaps in the current library (some agents have no workflow; some workflows have no output template) and back the experimental ideas above. Doc language stays English; UI labels stay Dutch.

Gaps that motivate this: `competitive-research-analyst`, `client-onboarding-agent` and `shopping-feed-specialist` have no dedicated workflow; `google-ads-optimization-specialist` only has account-audit; the `sales-proposal` workflow and the audit workflows have no matching output template.

### New workflows
- **competitor-research** — competitor briefing (Meta Ad Library, Wayback). Fills the competitive-research-analyst gap and backs the competitive-intelligence idea.
- **client-onboarding** — the "Day 1 dossier" as a process. Fills the client-onboarding-agent gap and backs the onboarding-autopilot idea.
- **account-optimization** — ongoing optimization: search-term mining, negatives, impression-share gap, red-team checklist.
- **shopping-feed-setup** — feed / Shopping / PMax. Fills the shopping-feed-specialist gap.
- **measurement-audit** — conversion-tracking health check (separate from tracking-setup, which defines the plan).
- **budget-management** — pacing, allocation, and the Belgian budget calendar.

### New knowledge
- **google-ads-policy** — policy rules for the policy pre-check (QA reviewer).
- **competitive-research-standards** — how to do competitor analysis ethically + which free sources (Meta Ad Library, Wayback) and their limits.
- **belgian-market-context** — NL/FR, KBO, *bouwverlof*, local seasonality (feeds the budget calendar + bilingual comms).
- **budget-management-standards** — pacing and allocation rules.
- **experimentation-standards** — A/B test design + statistical significance.

### New templates (output shapes)
- **competitor-briefing** — shape for the competitor briefing.
- **onboarding-dossier** — shape for the Day 1 dossier.
- **audit-report** — shared shape for account / SEO / red-team audits.
- **proposal** — shape for the sales proposal (workflow exists, template does not).

---

## Reference designs to learn from (external)

**Mark-XXXIX** (FatihMakes) — a Python desktop "Jarvis" personal assistant (voice, screen/webcam vision, OS control, browser automation, autonomous planning, task queue, persistent memory). Not for code reuse: it is a different stack (Python/PyQt6 desktop vs our TS monorepo + agency-brain purpose) and is licensed **CC BY-NC 4.0 (non-commercial only)**, which rules out lifting its code into a commercial product. We borrow patterns/ideas only, re-implemented in our own stack.

Three patterns worth borrowing (each validates a direction already on the roadmap):
- **Persistent memory model** — categorized store (identity / preferences / projects / notes) with automatic trim-to-limit. A concrete reference for **Phase 4 (Memory)**; for Saerens this maps to per-client and per-agent learnings.
- **Task queue** — priorities, statuses, cancel flag, worker loop, max-concurrency. Validates the **pg-boss / Phase 6 (controlled automations)** direction (pg-boss is the Node equivalent on our existing Postgres).
- **Planner with a strict tool schema** — goal → minimal steps using only allowed, typed tools. Aligns with **orchestrator routing** and guaranteed-valid tool calls via the AI SDK (Phase 3/5).

Out of scope from Mark-XXXIX: OS control, voice, screen vision, games, flight search — desktop-assistant territory, not relevant to an agency brain.

### Insights from the solo-agency model (external article)
Source: a "$40k MRR solo AI agency" article. Note: largely a business-model piece plus a marketing pitch for Kimi 2.6 — its specific numbers (6x cheaper, "indistinguishable quality", 300-agent swarm) are vendor claims, not independently verified. Saerens is an established Google Ads agency, not a solo automation shop, so the acquisition/economics parts are inspiration, not app features. The patterns below are what we actually take.

What we apply:
- **Cost-aware model-tier routing** — in the orchestrator, route by *cost of failure*: a cheap-but-capable workhorse for ~90% of work, a premium tier only for the ~10% high-stakes calls (anchor client, production data, novel problems), a free/local tier for cleanup. Feasible via the Replit proxy (OpenAI / Anthropic / Gemini / OpenRouter — OpenRouter can reach models like Kimi). Adding a specific external model is its own integration choice, not a free step.
- **Reusable skills capture ("solve once, reuse forever")** — distill accepted outputs into SOPs/templates so each similar job skips discovery. Folds into the "content to add" library and the self-improvement section.
- **Background + parallel agents** — continuous work (monitoring/maintenance) and fan-out for batch jobs. Ties to Phase 6 and the anomaly watchdog.

What sharpens the core idea (the map itself):
- **Add a cost/model dimension to the System Map** — show not just who does what in which layer, but on which model/at what cost. A cost-aware org chart — a distinctive feature few tools visualize.
- **Make the lifecycle explicit** — show each deliverable moving through Intake → Production → QA → Handoff, marking where a human *must* step in. Visually sells the human-in-the-loop principle.
- **"Graduated" status per workflow** — mark which workflows are proven/reusable vs still manual, and let the human-effort KPI show them getting cheaper over time. The map becomes a living picture of a system that gets smarter.
- **Re-prioritize around QA as the bottleneck** — if review capacity is the real limit, the QA agent + golden-set + fast-review tooling rank higher than "more agents." A direction shift, not a new feature.
- **Encode the "cost-of-failure" routing rule** explicitly in the orchestrator: the higher the stakes, the more careful/expensive the model — a principled, explainable routing policy.

Reframe: this pushes us from "a map of an AI team" toward "a map of a cost-aware, self-improving delivery system."

---

## From AI team to second brain (future direction)

Added 2026-06-09 as a direction note — captured to revisit later with fresh eyes, not scheduled work. The founder's framing: this app is becoming less "just an AI team" and more a **second brain / business operating system** for the agency. Three threads below.

### A. Finance & margin layer

Today the app tracks *expected* recurring revenue (the per-client and per-klantgroep `monthly_fee`, shown on the Dashboard against a €10k/month goal). The next layer turns "what should it earn" into "what do we actually earn — and keep."

- **Outgoing invoices** — record real billed/received amounts per client(group), alongside the planned fee. Surfaces the gap between agreed and invoiced, plus what is still outstanding. Foundation for everything below.
- **Monthly costs** — agency-level recurring costs (tools, subscriptions, ad spend, etc.) so the Dashboard can show *net*, not just revenue. The €10k goal gains a counterpart.
- **Cost per project/client** — attribute delivery cost (e.g. a separate Replit project) to a client. Combined with invoices + costs, this yields a real **margin per client(group)** — the most valuable number, and the hardest to source cleanly.
- **Decisive open question (for "minder shit aan mijn hoofd"):** where do these numbers live today? If invoicing already happens in a tool (e.g. Billit / Teamleader / Yuki), prefer an integration over manual entry; if it is Excel / in-the-head, a simple entry screen. Confirm before building.
- **Double-count caution:** reuse the fee rule already shipped — track each amount at exactly one level, and warn when both a group and its member fiches carry a value.

### B. Prospect CRM (growth layer)

A separate domain from delivery: a lightweight funnel — lead → conversation → proposal → won (a won lead becomes a client fiche). Connects to the existing "Klanten ontdekken" discovery flow and the founder's afternoon AI-maildraft rhythm. Bigger module; runs parallel to the finance layer rather than blocking it.

### C. The LLM Wiki pattern — validation, and ideas to borrow

Context the founder surfaced (June 2026): the popular "Claude + Obsidian second brain" setups, and Andrej Karpathy's **LLM Wiki** idea file (gist, April 2026: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f). The pattern: instead of RAG re-deriving knowledge on every query, the LLM **incrementally builds and maintains a persistent, interlinked markdown wiki** ("ingest once, reason forever"). Three layers — raw sources / LLM-owned wiki / a schema doc (CLAUDE.md or AGENTS.md) — and three operations: ingest, query (file good answers back as new pages), lint (health-check for contradictions, stale claims, orphans). Index-first navigation; embeddings only when you outgrow it.

**Why this matters here:** the app is already a domain-specific instantiation of this exact pattern, as a hosted web app rather than Obsidian + a CLI. The mapping is close:
- Raw sources → `knowledge/`, client docs, crawl snapshots, website intake
- Wiki + schema → `AGENTS.md` / `ARCHITECTURE.md`, the doc-graph, the Kaart (graph view)
- Ingest → intake / crawl / discovery flows
- Query + file-back → the generation engine + run archive + deliverables
- Lint → the learning loop (review → proposals → apply)
- The gist's optional hybrid search tool (`qmd`, BM25 + vector) → already built (Orama BM25 + local embeddings fused via RRF)

So the pattern **confirms the direction** rather than prescribing a rebuild — Obsidian is not required. Two concrete ideas worth stealing:
1. **Auto-file good answers back as knowledge** — when a generation/report produces something durable (a comparison, an analysis, a discovered connection), file it back into `knowledge/` so explorations compound instead of vanishing into run history.
2. **A "wiki-lint" over the doc-graph** — periodically health-check `knowledge/` + the doc-graph for orphans, stale/contradicted claims, and missing cross-references; feed findings into the existing learning loop. (Overlaps with the "knowledge-gap detector" under self-improvement.)

**Where it fits:** cross-cutting, brain-side; both ideas extend Phase 4 (memory) and the self-improvement section, and respect the core principle — observe/advise, human reviews before real use.

### D. Second-brain modules on the radar

A shortlist the founder flagged as worth keeping (from a longer brainstorm, June 2026). Not scoped yet — captured so they are not lost. Each leans on the same capture → distil → file-back loop the app already has, and on the north star of reducing mental load.

- **Day cockpit (today-view)** — one morning screen that proposes the deep-work block from open tasks, runs awaiting approval, and mails to review. Answers "where do I start?" and respects the morning/afternoon rhythm.
- **Communication brain (inbox)** — capture incoming client mail (Gmail already connected, read), triage it, draft replies in the afternoon, link each thread to the right client dossier, and track "waiting on …". Matches the afternoon AI-maildraft rhythm.
- **Meeting & call capture** — record/transcribe client calls, auto-summarize into the dossier, extract decisions + action items (NL/FR). Nothing is lost after a call.
- **Knowledge ingest (reading pipeline)** — drop an article/link/gist; an agent summarizes and files it into `knowledge/` with cross-links. Applied to Google Ads/Meta changelogs and marketing trends; feeds the skill-refresh digest. The Karpathy ingest operation made concrete.
- **Goals cockpit (north star)** — track the €10k goal plus other quarterly goals (#clients, margin, pipeline) with progress and blockers. The Dashboard becomes a goals overview, not just revenue.
- **Relationship brain (people, not just clients)** — a who's-who of contacts (client-side, suppliers, partners, freelancers): last contact, context, follow-up reminders. The people-graph beside the client-graph.
- **Continuous client narrative (reporting memory)** — remember what a client was told last month so reports form one continuous story rather than isolated snapshots. Builds on the monthly-report pipeline.

### E. Historical data as a learning corpus (warm start)

The founder's point: the brain should not start empty. Pull in *existing* history so it is smart from day one — and keeps getting smarter.

- **Email history** — ingest prior client email threads (the agency's own mailbox, read-only via the Gmail connection) to learn each client's tone, recurring questions, past commitments, and preferences. Distil into the client dossier — file *learnings*, not raw dumps.
- **Google Ads history** — go beyond the current snapshot and read a longer time range (read-only) to learn what actually worked per client/vertical: seasonality, which changes moved the needle, durable winners and losers. Feeds the outcome-feedback-loop and win/loss analysis already on the roadmap.
- **Why it matters:** turns the brain from "smart going forward" into "smart about this client's whole past" — exactly where a human's memory fades. The backfill is what makes the second brain feel like it has always been here.
- **Guardrails:** read-only; ingest is best-effort and deduped; store distilled learnings in the dossier / `knowledge/`, not bulk archives; same human-review principle before anything is acted on.

---

## What stays true across all phases

- Output is always reviewable by a human before real use.
- Agents never claim to have executed something they have not.
- Client data stays separate from agent instructions.
- Agency standards in `knowledge/` are the source of truth for quality.
