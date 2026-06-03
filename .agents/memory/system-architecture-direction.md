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
