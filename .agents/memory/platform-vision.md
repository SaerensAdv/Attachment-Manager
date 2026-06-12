---
name: Platform vision (multi-tenant productization)
description: Strategic direction to turn the single-tenant AI Operating System into a multi-tenant SaaS; concept sketched on the canvas.
---

# Platform vision — multi-tenant productization

Direction (brainstorm stage, NOT built): turn the current single-tenant agency app (one org = the owner's bureau) into a **multi-tenant platform**. Clients log in and see *their own* AI team instead of the owner's.

**Target audience:** anyone willing to digitalize their team — agencies, SMEs, teams (broad, not agencies-only).

**Signature mechanic — the "uitgeleende agent" (rented freelancer-agent):** one agent the owner lends to each client that (1) builds the client's AI team during onboarding and (2) stays as the permanent **liaison** between the client's team and the owner's team.

**Revenue model:** setup-fee (build their team, eenmalig) + monthly seat for the liaison-agent + per-tenant platform-fee + billable escalations (work the client team hands off to the owner's specialists). Productizes the agency relationship itself; the real bureau behind it is the moat.

**Biggest build shift:** single-tenant → multi-tenant with hard data isolation. MVP blocks identified: multi-tenant auth/orgs (Clerk), per-tenant data model (agents/departments/knowledge/clients), tenant isolation, liaison-agent role + cross-tenant bridge, onboarding wizard, escalation/request protocol, billing (Stripe).

**Open decisions (unresolved):** does the liaison live in the owner's tenant or embedded in the client's? template vs bespoke per client? self-serve vs done-for-you onboarding? data-trust concerns; pricing levels; cross-tenant knowledge visibility.

**Market validation (web-researched Jun 2026):** Category is real and large (AI-agents market ~$7.8B 2026 → ~$52B 2030 per market reports; figures vary by source). The "AI operating system / cockpit" framing the owner arrived at independently matches where analysts say value concentrates. Comparable/competing categories: horizontal AI-workforce platforms (Lindy, Relevance AI, Lyzr, CrewAI, Stack AI); white-label agent platforms agencies already resell (GoHighLevel, Vendasta, Stammer, Lety, Konverso); enterprise digital workers (Beam AI, Artisan, 11x, Cognosys, Cassidy); the "AI Automation Agency" done-for-you playbook. Google's **A2A protocol** (now Linux Foundation, 150+ enterprises) directly validates "linked teams" / cross-org agent collaboration — a standard to build on, not invent. **Verdict:** market existence is high-confidence; *this product winning* depends on a sharp wedge, not the market. White-label "build & resell agents" is already crowded/commoditizing — do NOT compete there generically. Real differentiation = the **hybrid managed model** (rented liaison agent + real agency expertise behind it, not just software) + **vertical depth** (start with marketing agencies he already understands, not "everyone"). Biggest execution risks: multi-tenant isolation is harder for AI (files/vector DB/memory, not just row security), plus agent reliability/trust.

**Where it lives:** full concept map drawn on the **canvas** (title "AI OPERATING SYSTEM — Platform-visie"), region roughly x -1200..7000, y 3480..8470 — title, core architecture, onboarding flow, inter-team protocol, revenue model, MVP scope, open questions, roadmap. Continue from there before any code.
