---
name: System architecture direction (brain vs nervous system)
description: Agreed split between the system-map app and n8n/infra for the full automation vision.
---

# System architecture direction

The system-map app is the **brain + single source of truth**; n8n (plus APIs/cron)
is the **stateless nervous system / executor**. Decided with the user as the
guiding architecture for turning the agency into a 24/7 automated system.

**The contract (one direction):**
- n8n listens & schedules (cron, new lead, form submit, "GSC data ready").
- n8n calls the app's decision endpoint with context -> the app runs the right
  agent/workflow (orchestrator) -> returns a structured deliverable/decision.
- n8n executes the real-world action (publish, email, update Google Ads, post
  content) and writes the result back to the app as the client's new "current
  state".

**Why:** the app already holds what a brain needs and what you never want to
rebuild in n8n — per-client truth/profile, versioned agents + knowledge (markdown),
and the reasoning loop. n8n is strong at exactly what the app is bad at: triggers,
scheduling, retries, and connecting many SaaS APIs without custom code.

**Two failure modes to avoid:**
1. Making the app itself schedule/execute every SaaS -> a brittle monolith.
2. Putting prompts/logic into n8n nodes -> scattered, unversioned intelligence.

**How to apply:** keep intelligence + state in the app, keep glue + execution in
n8n. The app needs only a stable "decision endpoint" (generate loop already
exists) plus a way to receive results back. Phase 1 ("current state" per client)
is the structure n8n will write results into. Live integrations (Google Ads dev
token, Search Console/GA4 OAuth) are deferred (phase 3).

**Cost/licensing (confirmed June 2026):** self-hosted n8n Community Edition is
free for commercial use, full API, unlimited runs; only n8n *Cloud* is paid (its
permanent free plan was discontinued). So n8n-as-executor is NOT cost-blocked —
the founder's belief that local self-hosting is free is correct. `pg-boss` / the
in-app croner scheduler is the in-app trigger fallback.

**Progressive-intelligence principle (founder directive, June 2026):** every semi-
or non-automated step should get *smarter over time*, not stay static. Concretely:
reuse an account's existing state as a memory aid to build on rather than starting
fresh each run (e.g. existing campaign negatives already ground the negatives-CSV so
we don't re-suggest or duplicate them; future runs should likewise remember prior
decisions/learnings). **Why:** the founder wants the system to compound, not repeat.
**How to apply:** when adding/optimizing any flow, ask "what prior state or past
decision can this read first so it improves instead of re-deriving from scratch?"

**Founder's working style (interview, encoded in the doc-graph):** Saerens accepts
clients in principle (onboarding is setup, not a screening gate); client comms are
monthly report + ad-hoc proactive triggers with NO always-on channel today; first
automation priorities are monthly reports, search-term->negative-keyword checks,
and ad copy generation; everything is still manual today.
