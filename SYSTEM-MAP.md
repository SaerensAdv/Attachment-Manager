# AI Team System Map — tekstoverzicht

> Momentopname van dezelfde graaf als de Kaart, maar als leesbaar document. Gegenereerd op 6 juni 2026.
> Dit bestand staat bewust in de root en is **geen** onderdeel van de doc-graaf (het beïnvloedt de Kaart dus niet).

**Totaal:** 65 nodes, 557 verbindingen (220 referenties, 20 routing, 88 vermeldingen, 229 laag-flow).

## Zo lees je dit document

**Categorieën** (zoals de kleuren op de Kaart):
- **Fundament** — 2 nodes
- **Agents** — 21 nodes
- **Klanten** — 5 nodes
- **Workflows** — 12 nodes
- **Sjablonen** — 6 nodes
- **Kennis** — 19 nodes

**Soorten verbindingen:**
- **Routing** — een expliciete overdracht vanuit de Orchestrator naar een specialist.
- **Referenties** — een document linkt expliciet naar een ander (een `pad.md` in de tekst).
- **Vermeldingen** — een document noemt de exacte titel van een ander in de lopende tekst.
- **Laag-flow** — de structurele pijplijn tussen lagen (zie hieronder). Die staan hier niet per node opgesomd, want het zijn many-to-many-verbindingen die het beeld net druk maken — daarom de Kaart soms onoverzichtelijk oogt.

## De pijplijn (vijf-lagen-flow)

De ruggengraat loopt in vaste volgorde, en elke laag voedt de volgende many-to-many:

```
AGENTS.md  →  agents/  →  clients/  →  workflows/  →  templates/
(grondwet)   (de agents)  (klanten)   (processen)    (output-sjablonen)
```

De laag **Kennis** (`knowledge/`) staat los van deze lineaire flow: die wordt door agents en workflows aangehaald via referenties (de standaarden, tone-of-voice, benchmarks, ClickUp-docs, enz.).

## Orchestrator-routing

De Orchestrator (`agents/orchestrator.md`) kan rechtstreeks overdragen naar:

- Analytics & Tracking Specialist (`agents/analytics-tracking-specialist.md`)
- Client Onboarding Agent (`agents/client-onboarding-agent.md`)
- Client Success Agent (`agents/client-success-agent.md`)
- Competitive Research Analyst (`agents/competitive-research-analyst.md`)
- Copywriter (`agents/copywriter.md`)
- Creative Designer (`agents/creative-designer.md`)
- CRO Specialist (`agents/cro-specialist.md`)
- Email & Marketing Automation Specialist (`agents/email-automation-specialist.md`)
- Google Ads Optimization Specialist (`agents/google-ads-optimization-specialist.md`)
- Google Ads Setup Specialist (`agents/google-ads-setup-specialist.md`)
- Google Ads Strategist (`agents/google-ads-strategist.md`)
- Humanizer (`agents/humanizer.md`)
- Landing Page / Web Design Specialist (`agents/landing-page-specialist.md`)
- Meta Ads Strategist (`agents/meta-ads-strategist.md`)
- QA & Compliance Reviewer (`agents/qa-compliance-reviewer.md`)
- Reporting Specialist (`agents/reporting-specialist.md`)
- Sales / Proposal Agent (`agents/sales-proposal-agent.md`)
- SEO Specialist (`agents/seo-specialist.md`)
- Shopping & Feed Specialist (`agents/shopping-feed-specialist.md`)
- Web Developer / Builder (`agents/web-developer.md`)

## Nodes per categorie

### Fundament (2)

#### AGENTS.md — The AI Team Constitution
`AGENTS.md`

This file defines how AI agents operate inside Saerens Advertising. It is the single source of truth for agent behavior. Every agent file in `agents/` inherits these rules.
- **Referenties →** Agent Personas (`knowledge/agent-personas.md`); Analytics & Tracking Specialist (`agents/analytics-tracking-specialist.md`); Client Onboarding Agent (`agents/client-onboarding-agent.md`); Client Success Agent (`agents/client-success-agent.md`); Competitive Research Analyst (`agents/competitive-research-analyst.md`); Copywriter (`agents/copywriter.md`); Creative Designer (`agents/creative-designer.md`); CRO Specialist (`agents/cro-specialist.md`); Email & Marketing Automation Specialist (`agents/email-automation-specialist.md`); Google Ads Optimization Specialist (`agents/google-ads-optimization-specialist.md`); Google Ads Setup Specialist (`agents/google-ads-setup-specialist.md`); Google Ads Strategist (`agents/google-ads-strategist.md`); Landing Page / Web Design Specialist (`agents/landing-page-specialist.md`); Meta Ads Strategist (`agents/meta-ads-strategist.md`); Orchestrator Agent (`agents/orchestrator.md`); QA & Compliance Reviewer (`agents/qa-compliance-reviewer.md`); Reporting Specialist (`agents/reporting-specialist.md`); Sales / Proposal Agent (`agents/sales-proposal-agent.md`); SEO Specialist (`agents/seo-specialist.md`); Shopping & Feed Specialist (`agents/shopping-feed-specialist.md`); Tone of Voice (`knowledge/tone-of-voice.md`); Web Developer / Builder (`agents/web-developer.md`)
- **Aangehaald door ←** Analytics & Tracking Specialist (`agents/analytics-tracking-specialist.md`); Client Onboarding Agent (`agents/client-onboarding-agent.md`); Client Success Agent (`agents/client-success-agent.md`); Competitive Research Analyst (`agents/competitive-research-analyst.md`); Copywriter (`agents/copywriter.md`); Creative Designer (`agents/creative-designer.md`); CRO Specialist (`agents/cro-specialist.md`); Email & Marketing Automation Specialist (`agents/email-automation-specialist.md`); Google Ads Optimization Specialist (`agents/google-ads-optimization-specialist.md`); Google Ads Setup Specialist (`agents/google-ads-setup-specialist.md`); Google Ads Strategist (`agents/google-ads-strategist.md`); Humanizer (`agents/humanizer.md`); Landing Page / Web Design Specialist (`agents/landing-page-specialist.md`); Meta Ads Strategist (`agents/meta-ads-strategist.md`); Orchestrator Agent (`agents/orchestrator.md`); QA & Compliance Reviewer (`agents/qa-compliance-reviewer.md`); Reporting Specialist (`agents/reporting-specialist.md`); Sales / Proposal Agent (`agents/sales-proposal-agent.md`); SEO Specialist (`agents/seo-specialist.md`); Shopping & Feed Specialist (`agents/shopping-feed-specialist.md`); Web Developer / Builder (`agents/web-developer.md`)

#### ARCHITECTURE
`ARCHITECTURE.md`

This document explains how the pieces of the Saerens Advertising AI team fit together. In this version everything is documentation, but the structure is designed so a future app (see `ROADMAP.md`) can use it directly.
- **Aangehaald door ←** ClickUp AI Agents — Autopilot vs Super Agents (`knowledge/clickup-ai-agents.md`); ClickUp Platform — Structure & Core Concepts (`knowledge/clickup-platform.md`); ClickUp Webhooks — Event Triggers (`knowledge/clickup-webhooks.md`)

### Agents (21)

#### Analytics & Tracking Specialist
`agents/analytics-tracking-specialist.md`

Inherits all global rules in `AGENTS.md`.
- **Referenties →** Agent Personas (`knowledge/agent-personas.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Analytics & Tracking Standards (`knowledge/analytics-standards.md`); Template: Generic Task Output (`templates/task-output.md`); Tone of Voice (`knowledge/tone-of-voice.md`)
- **Vermeldingen →** Reporting Specialist (`agents/reporting-specialist.md`)
- **Aangehaald door ←** AGENTS.md — The AI Team Constitution (`AGENTS.md`); CRO Specialist (`agents/cro-specialist.md`); Orchestrator Agent (`agents/orchestrator.md`); Portretrichting — Team (`knowledge/portrait-art-direction.md`); Web Developer / Builder (`agents/web-developer.md`); Workflow: Google Ads Campaign Setup (`workflows/campaign-setup.md`); Workflow: Tracking Setup & Review (`workflows/tracking-setup.md`); Workflow: Web Build (`workflows/web-build.md`)

#### Client Onboarding Agent
`agents/client-onboarding-agent.md`

Inherits all global rules in `AGENTS.md`.
- **Referenties →** Agent Personas (`knowledge/agent-personas.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Analytics & Tracking Standards (`knowledge/analytics-standards.md`); Client: [Client name] (`clients/_template.md`); Naming Conventions (`knowledge/naming-conventions.md`); Template: Generic Task Output (`templates/task-output.md`); Tone of Voice (`knowledge/tone-of-voice.md`)
- **Vermeldingen →** Client Success Agent (`agents/client-success-agent.md`); Sales / Proposal Agent (`agents/sales-proposal-agent.md`)
- **Aangehaald door ←** AGENTS.md — The AI Team Constitution (`AGENTS.md`); Orchestrator Agent (`agents/orchestrator.md`)

#### Client Success Agent
`agents/client-success-agent.md`

Inherits all global rules in `AGENTS.md`.
- **Referenties →** Agent Personas (`knowledge/agent-personas.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Template: Client Email (`templates/client-email.md`); Tone of Voice (`knowledge/tone-of-voice.md`)
- **Vermeldingen →** Sales / Proposal Agent (`agents/sales-proposal-agent.md`)
- **Aangehaald door ←** AGENTS.md — The AI Team Constitution (`AGENTS.md`); Client Onboarding Agent (`agents/client-onboarding-agent.md`); Orchestrator Agent (`agents/orchestrator.md`); Workflow: Proactive Client Update (`workflows/client-update.md`)

#### Competitive Research Analyst
`agents/competitive-research-analyst.md`

Inherits all global rules in `AGENTS.md`.
- **Referenties →** Agent Personas (`knowledge/agent-personas.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Google Ads Standards (`knowledge/google-ads-standards.md`); SEO Standards (`knowledge/seo-standards.md`); Template: Generic Task Output (`templates/task-output.md`); Tone of Voice (`knowledge/tone-of-voice.md`)
- **Vermeldingen →** Copywriter (`agents/copywriter.md`); Google Ads Strategist (`agents/google-ads-strategist.md`); Meta Ads Strategist (`agents/meta-ads-strategist.md`)
- **Aangehaald door ←** AGENTS.md — The AI Team Constitution (`AGENTS.md`); Orchestrator Agent (`agents/orchestrator.md`)

#### Copywriter
`agents/copywriter.md`

Inherits all global rules in `AGENTS.md`.
- **Referenties →** Ad Creative Standards (`knowledge/ad-creative-standards.md`); Agent Personas (`knowledge/agent-personas.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Template: Ad Creative Output (`templates/ad-creative-output.md`); Tone of Voice (`knowledge/tone-of-voice.md`); Workflow: Ad Creative Production (`workflows/ad-creatives.md`)
- **Vermeldingen →** Creative Designer (`agents/creative-designer.md`); Meta Ads Strategist (`agents/meta-ads-strategist.md`)
- **Aangehaald door ←** Ad Creative Standards (`knowledge/ad-creative-standards.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Competitive Research Analyst (`agents/competitive-research-analyst.md`); Creative Designer (`agents/creative-designer.md`); CRO Specialist (`agents/cro-specialist.md`); Email & Marketing Automation Specialist (`agents/email-automation-specialist.md`); Google Ads Optimization Specialist (`agents/google-ads-optimization-specialist.md`); Google Ads Setup Specialist (`agents/google-ads-setup-specialist.md`); Humanizer (`agents/humanizer.md`); Landing Page / Web Design Specialist (`agents/landing-page-specialist.md`); Meta Ads Standards (`knowledge/meta-ads-standards.md`); Meta Ads Strategist (`agents/meta-ads-strategist.md`); Orchestrator Agent (`agents/orchestrator.md`); Portretrichting — Team (`knowledge/portrait-art-direction.md`); Template: Google Ads Output (`templates/google-ads-output.md`); Web Developer / Builder (`agents/web-developer.md`); Workflow: Ad Creative Production (`workflows/ad-creatives.md`); Workflow: Client Email Draft (`workflows/client-email.md`); Workflow: Google Ads Campaign Setup (`workflows/campaign-setup.md`); Workflow: Landing Page Review (`workflows/landing-page-review.md`); Workflow: Meta Ads Campaign Setup (`workflows/meta-ads-setup.md`); Workflow: Proactive Client Update (`workflows/client-update.md`); Workflow: Sales Proposal (`workflows/sales-proposal.md`); Workflow: Web Build (`workflows/web-build.md`)

#### Creative Designer
`agents/creative-designer.md`

Inherits all global rules in `AGENTS.md`.
- **Referenties →** Ad Creative Standards (`knowledge/ad-creative-standards.md`); Agent Personas (`knowledge/agent-personas.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Naming Conventions (`knowledge/naming-conventions.md`); Template: Ad Creative Output (`templates/ad-creative-output.md`); Template: Generic Task Output (`templates/task-output.md`); Tone of Voice (`knowledge/tone-of-voice.md`)
- **Vermeldingen →** Copywriter (`agents/copywriter.md`); Email & Marketing Automation Specialist (`agents/email-automation-specialist.md`); Meta Ads Strategist (`agents/meta-ads-strategist.md`)
- **Aangehaald door ←** AGENTS.md — The AI Team Constitution (`AGENTS.md`); Copywriter (`agents/copywriter.md`); Email & Marketing Automation Specialist (`agents/email-automation-specialist.md`); Orchestrator Agent (`agents/orchestrator.md`)

#### CRO Specialist
`agents/cro-specialist.md`

Inherits all global rules in `AGENTS.md`.
- **Referenties →** Agent Personas (`knowledge/agent-personas.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Analytics & Tracking Standards (`knowledge/analytics-standards.md`); Landing Page / Web Design Specialist (`agents/landing-page-specialist.md`); Landing Page & Conversion Standards (`knowledge/landing-page-standards.md`); Template: Generic Task Output (`templates/task-output.md`); Tone of Voice (`knowledge/tone-of-voice.md`)
- **Vermeldingen →** Analytics & Tracking Specialist (`agents/analytics-tracking-specialist.md`); Copywriter (`agents/copywriter.md`)
- **Aangehaald door ←** AGENTS.md — The AI Team Constitution (`AGENTS.md`); Landing Page / Web Design Specialist (`agents/landing-page-specialist.md`); Orchestrator Agent (`agents/orchestrator.md`)

#### Email & Marketing Automation Specialist
`agents/email-automation-specialist.md`

Inherits all global rules in `AGENTS.md`.
- **Referenties →** Agent Personas (`knowledge/agent-personas.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Analytics & Tracking Standards (`knowledge/analytics-standards.md`); Template: Generic Task Output (`templates/task-output.md`); Tone of Voice (`knowledge/tone-of-voice.md`)
- **Vermeldingen →** Copywriter (`agents/copywriter.md`); Creative Designer (`agents/creative-designer.md`)
- **Aangehaald door ←** AGENTS.md — The AI Team Constitution (`AGENTS.md`); Creative Designer (`agents/creative-designer.md`); Orchestrator Agent (`agents/orchestrator.md`)

#### Google Ads Optimization Specialist
`agents/google-ads-optimization-specialist.md`

Inherits all global rules in `AGENTS.md`.
- **Referenties →** Agent Personas (`knowledge/agent-personas.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Template: Google Ads Output (`templates/google-ads-output.md`); Tone of Voice (`knowledge/tone-of-voice.md`)
- **Vermeldingen →** Copywriter (`agents/copywriter.md`)
- **Aangehaald door ←** AGENTS.md — The AI Team Constitution (`AGENTS.md`); ClickUp AI Agents — Autopilot vs Super Agents (`knowledge/clickup-ai-agents.md`); Orchestrator Agent (`agents/orchestrator.md`); Shopping & Feed Specialist (`agents/shopping-feed-specialist.md`); Workflow: Google Ads Account Audit (`workflows/account-audit.md`); Workflow: Monthly Client Report (`workflows/monthly-reporting.md`)

#### Google Ads Setup Specialist
`agents/google-ads-setup-specialist.md`

Inherits all global rules in `AGENTS.md`.
- **Referenties →** Agent Personas (`knowledge/agent-personas.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Analytics & Tracking Standards (`knowledge/analytics-standards.md`); Google Ads Standards (`knowledge/google-ads-standards.md`); Naming Conventions (`knowledge/naming-conventions.md`); Template: Google Ads Output (`templates/google-ads-output.md`); Tone of Voice (`knowledge/tone-of-voice.md`)
- **Vermeldingen →** Copywriter (`agents/copywriter.md`)
- **Aangehaald door ←** AGENTS.md — The AI Team Constitution (`AGENTS.md`); Orchestrator Agent (`agents/orchestrator.md`); Shopping & Feed Specialist (`agents/shopping-feed-specialist.md`); Workflow: Google Ads Campaign Setup (`workflows/campaign-setup.md`)

#### Google Ads Strategist
`agents/google-ads-strategist.md`

Inherits all global rules in `AGENTS.md`.
- **Referenties →** Agent Personas (`knowledge/agent-personas.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Analytics & Tracking Standards (`knowledge/analytics-standards.md`); Template: Google Ads Output (`templates/google-ads-output.md`); Tone of Voice (`knowledge/tone-of-voice.md`)
- **Aangehaald door ←** AGENTS.md — The AI Team Constitution (`AGENTS.md`); Competitive Research Analyst (`agents/competitive-research-analyst.md`); Orchestrator Agent (`agents/orchestrator.md`); Shopping & Feed Specialist (`agents/shopping-feed-specialist.md`); Workflow: Google Ads Account Audit (`workflows/account-audit.md`); Workflow: Google Ads Campaign Setup (`workflows/campaign-setup.md`)

#### Humanizer
`agents/humanizer.md`

<!-- unlisted: cross-cutting final pass that polishes every agent's output, so it belongs to no single layer of the hierarchy. -->
- **Referenties →** Agency Principles (`knowledge/agency-principles.md`); Agent Personas (`knowledge/agent-personas.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Tone of Voice (`knowledge/tone-of-voice.md`)
- **Vermeldingen →** Copywriter (`agents/copywriter.md`); QA & Compliance Reviewer (`agents/qa-compliance-reviewer.md`)
- **Aangehaald door ←** Orchestrator Agent (`agents/orchestrator.md`); Workflow: Ad Creative Production (`workflows/ad-creatives.md`)

#### Landing Page / Web Design Specialist
`agents/landing-page-specialist.md`

Inherits all global rules in `AGENTS.md`.
- **Referenties →** Agent Personas (`knowledge/agent-personas.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Analytics & Tracking Standards (`knowledge/analytics-standards.md`); CRO Specialist (`agents/cro-specialist.md`); Landing Page & Conversion Standards (`knowledge/landing-page-standards.md`); Premium Web Motion & Interaction Standards (`knowledge/premium-web-motion.md`); Replit Canvas — Using It Across Flows (`knowledge/replit-canvas.md`); Tone of Voice (`knowledge/tone-of-voice.md`)
- **Vermeldingen →** Copywriter (`agents/copywriter.md`); SEO Specialist (`agents/seo-specialist.md`)
- **Aangehaald door ←** AGENTS.md — The AI Team Constitution (`AGENTS.md`); CRO Specialist (`agents/cro-specialist.md`); Orchestrator Agent (`agents/orchestrator.md`); Replit Canvas — Using It Across Flows (`knowledge/replit-canvas.md`); SEO Specialist (`agents/seo-specialist.md`); Web Developer / Builder (`agents/web-developer.md`); Workflow: Landing Page Review (`workflows/landing-page-review.md`); Workflow: Meta Ads Campaign Setup (`workflows/meta-ads-setup.md`); Workflow: SEO Audit (`workflows/seo-audit.md`); Workflow: Web Build (`workflows/web-build.md`)

#### Meta Ads Strategist
`agents/meta-ads-strategist.md`

Inherits all global rules in `AGENTS.md`.
- **Referenties →** Agent Personas (`knowledge/agent-personas.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Analytics & Tracking Standards (`knowledge/analytics-standards.md`); Meta Ads Standards (`knowledge/meta-ads-standards.md`); Tone of Voice (`knowledge/tone-of-voice.md`)
- **Vermeldingen →** Copywriter (`agents/copywriter.md`)
- **Aangehaald door ←** Ad Creative Standards (`knowledge/ad-creative-standards.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Competitive Research Analyst (`agents/competitive-research-analyst.md`); Copywriter (`agents/copywriter.md`); Creative Designer (`agents/creative-designer.md`); Orchestrator Agent (`agents/orchestrator.md`); Workflow: Ad Creative Production (`workflows/ad-creatives.md`); Workflow: Meta Ads Campaign Setup (`workflows/meta-ads-setup.md`)

#### Orchestrator Agent
`agents/orchestrator.md`

Inherits all global rules in `AGENTS.md`.
- **Routing →** Analytics & Tracking Specialist (`agents/analytics-tracking-specialist.md`); Client Onboarding Agent (`agents/client-onboarding-agent.md`); Client Success Agent (`agents/client-success-agent.md`); Competitive Research Analyst (`agents/competitive-research-analyst.md`); Copywriter (`agents/copywriter.md`); Creative Designer (`agents/creative-designer.md`); CRO Specialist (`agents/cro-specialist.md`); Email & Marketing Automation Specialist (`agents/email-automation-specialist.md`); Google Ads Optimization Specialist (`agents/google-ads-optimization-specialist.md`); Google Ads Setup Specialist (`agents/google-ads-setup-specialist.md`); Google Ads Strategist (`agents/google-ads-strategist.md`); Humanizer (`agents/humanizer.md`); Landing Page / Web Design Specialist (`agents/landing-page-specialist.md`); Meta Ads Strategist (`agents/meta-ads-strategist.md`); QA & Compliance Reviewer (`agents/qa-compliance-reviewer.md`); Reporting Specialist (`agents/reporting-specialist.md`); Sales / Proposal Agent (`agents/sales-proposal-agent.md`); SEO Specialist (`agents/seo-specialist.md`); Shopping & Feed Specialist (`agents/shopping-feed-specialist.md`); Web Developer / Builder (`agents/web-developer.md`)
- **Referenties →** Agent Personas (`knowledge/agent-personas.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Template: Campaign Brief (`templates/campaign-brief.md`); Template: Generic Task Output (`templates/task-output.md`); Tone of Voice (`knowledge/tone-of-voice.md`); Workflow: Ad Creative Production (`workflows/ad-creatives.md`); Workflow: Client Email Draft (`workflows/client-email.md`); Workflow: Google Ads Account Audit (`workflows/account-audit.md`); Workflow: Google Ads Campaign Setup (`workflows/campaign-setup.md`); Workflow: Landing Page Review (`workflows/landing-page-review.md`); Workflow: Meta Ads Campaign Setup (`workflows/meta-ads-setup.md`); Workflow: Monthly Client Report (`workflows/monthly-reporting.md`); Workflow: Proactive Client Update (`workflows/client-update.md`); Workflow: Sales Proposal (`workflows/sales-proposal.md`); Workflow: SEO Audit (`workflows/seo-audit.md`); Workflow: Tracking Setup & Review (`workflows/tracking-setup.md`); Workflow: Web Build (`workflows/web-build.md`)
- **Aangehaald door ←** AGENTS.md — The AI Team Constitution (`AGENTS.md`); Workflow: Ad Creative Production (`workflows/ad-creatives.md`); Workflow: Client Email Draft (`workflows/client-email.md`); Workflow: Google Ads Account Audit (`workflows/account-audit.md`); Workflow: Google Ads Campaign Setup (`workflows/campaign-setup.md`); Workflow: Landing Page Review (`workflows/landing-page-review.md`); Workflow: Meta Ads Campaign Setup (`workflows/meta-ads-setup.md`); Workflow: Monthly Client Report (`workflows/monthly-reporting.md`); Workflow: Proactive Client Update (`workflows/client-update.md`); Workflow: Sales Proposal (`workflows/sales-proposal.md`); Workflow: SEO Audit (`workflows/seo-audit.md`); Workflow: Tracking Setup & Review (`workflows/tracking-setup.md`); Workflow: Web Build (`workflows/web-build.md`)

#### QA & Compliance Reviewer
`agents/qa-compliance-reviewer.md`

Inherits all global rules in `AGENTS.md`.
- **Referenties →** Agency Principles (`knowledge/agency-principles.md`); Agent Personas (`knowledge/agent-personas.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Google Ads Standards (`knowledge/google-ads-standards.md`); Meta Ads Standards (`knowledge/meta-ads-standards.md`); Naming Conventions (`knowledge/naming-conventions.md`); Template: Generic Task Output (`templates/task-output.md`); Tone of Voice (`knowledge/tone-of-voice.md`)
- **Aangehaald door ←** Ad Creative Standards (`knowledge/ad-creative-standards.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Humanizer (`agents/humanizer.md`); Orchestrator Agent (`agents/orchestrator.md`); Workflow: Ad Creative Production (`workflows/ad-creatives.md`)

#### Reporting Specialist
`agents/reporting-specialist.md`

Inherits all global rules in `AGENTS.md`.
- **Referenties →** Agent Personas (`knowledge/agent-personas.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Reporting Standards (`knowledge/reporting-standards.md`); Template: Reporting Output (`templates/reporting-output.md`); Tone of Voice (`knowledge/tone-of-voice.md`)
- **Aangehaald door ←** AGENTS.md — The AI Team Constitution (`AGENTS.md`); Analytics & Tracking Specialist (`agents/analytics-tracking-specialist.md`); Orchestrator Agent (`agents/orchestrator.md`); Reporting Standards (`knowledge/reporting-standards.md`); Template: Reporting Output (`templates/reporting-output.md`); Workflow: Client Email Draft (`workflows/client-email.md`); Workflow: Google Ads Account Audit (`workflows/account-audit.md`); Workflow: Monthly Client Report (`workflows/monthly-reporting.md`); Workflow: Proactive Client Update (`workflows/client-update.md`); Workflow: SEO Audit (`workflows/seo-audit.md`); Workflow: Tracking Setup & Review (`workflows/tracking-setup.md`)

#### Sales / Proposal Agent
`agents/sales-proposal-agent.md`

Inherits all global rules in `AGENTS.md`.
- **Referenties →** Agent Personas (`knowledge/agent-personas.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Template: Generic Task Output (`templates/task-output.md`); Tone of Voice (`knowledge/tone-of-voice.md`)
- **Aangehaald door ←** AGENTS.md — The AI Team Constitution (`AGENTS.md`); Client Onboarding Agent (`agents/client-onboarding-agent.md`); Client Success Agent (`agents/client-success-agent.md`); Orchestrator Agent (`agents/orchestrator.md`); Workflow: Sales Proposal (`workflows/sales-proposal.md`)

#### SEO Specialist
`agents/seo-specialist.md`

Inherits all global rules in `AGENTS.md`.
- **Referenties →** Agent Personas (`knowledge/agent-personas.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Analytics & Tracking Standards (`knowledge/analytics-standards.md`); Google Ads Standards (`knowledge/google-ads-standards.md`); SEO Standards (`knowledge/seo-standards.md`); Tone of Voice (`knowledge/tone-of-voice.md`)
- **Vermeldingen →** Landing Page / Web Design Specialist (`agents/landing-page-specialist.md`)
- **Aangehaald door ←** AGENTS.md — The AI Team Constitution (`AGENTS.md`); Landing Page / Web Design Specialist (`agents/landing-page-specialist.md`); Orchestrator Agent (`agents/orchestrator.md`); Workflow: Landing Page Review (`workflows/landing-page-review.md`); Workflow: SEO Audit (`workflows/seo-audit.md`)

#### Shopping & Feed Specialist
`agents/shopping-feed-specialist.md`

Inherits all global rules in `AGENTS.md`.
- **Referenties →** Agent Personas (`knowledge/agent-personas.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Analytics & Tracking Standards (`knowledge/analytics-standards.md`); Naming Conventions (`knowledge/naming-conventions.md`); Template: Generic Task Output (`templates/task-output.md`); Tone of Voice (`knowledge/tone-of-voice.md`)
- **Vermeldingen →** Google Ads Optimization Specialist (`agents/google-ads-optimization-specialist.md`); Google Ads Setup Specialist (`agents/google-ads-setup-specialist.md`); Google Ads Strategist (`agents/google-ads-strategist.md`)
- **Aangehaald door ←** AGENTS.md — The AI Team Constitution (`AGENTS.md`); Orchestrator Agent (`agents/orchestrator.md`)

#### Web Developer / Builder
`agents/web-developer.md`

Inherits all global rules in `AGENTS.md`.
- **Referenties →** Agent Personas (`knowledge/agent-personas.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Premium Web Motion & Interaction Standards (`knowledge/premium-web-motion.md`); Replit Canvas — Using It Across Flows (`knowledge/replit-canvas.md`); Replit Prompting — Writing Prompts the Agent Can Act On (`knowledge/replit-prompting.md`); Template: Generic Task Output (`templates/task-output.md`); Tone of Voice (`knowledge/tone-of-voice.md`)
- **Vermeldingen →** Analytics & Tracking Specialist (`agents/analytics-tracking-specialist.md`); Copywriter (`agents/copywriter.md`); Landing Page / Web Design Specialist (`agents/landing-page-specialist.md`)
- **Aangehaald door ←** AGENTS.md — The AI Team Constitution (`AGENTS.md`); Orchestrator Agent (`agents/orchestrator.md`); Workflow: Tracking Setup & Review (`workflows/tracking-setup.md`); Workflow: Web Build (`workflows/web-build.md`)

### Klanten (5)

#### Client: [Client name]
`clients/_template.md`

Copy this file to `clients/<client-slug>.md` and fill it in. Keep all client-specific data here — never inside agent files. Agents read this file as context.
- **Aangehaald door ←** Client Onboarding Agent (`agents/client-onboarding-agent.md`)

#### Client: Car Audio Limburg
`clients/db/5.md`

Specialist in car audio en in-car multimedia: inbouw en upgrade van autoluidsprekers, versterkers, subwoofers, Apple CarPlay/Android Auto-schermen, navigatie en aanverwante systemen. Actief met een eigen studio/werkplaats en online zicht…

#### Client: Example Roofing Company (sample)
`clients/client-example.md`

This is a sample client used for testing the AI team. Replace or remove before using with a real client. All data here is illustrative.

#### Client: Saerens Advertising
`clients/db/2.md`

Saerens Advertising helpt bedrijven groeien door middel van slimme, datagedreven online advertenties. Wij zijn gespecialiseerd in Google Ads-beheer, conversietracking, oplossingen voor op maat gemaakte cookiebanners (ConsentEase), SEO en…

#### Client: Schoonpannendak
`clients/db/4.md`

Dakreiniging, Dakpannen schoonmaken ? Schoonpannendak; wij reinigen pannen en leien daken zonder hoge drukspuit. Veel van onze klanten besluiten wanneer hun dak eenmaal schoon is het dak schoon te houden. Door eens in de zoveel jaar het…

### Workflows (12)

#### Workflow: Ad Creative Production
`workflows/ad-creatives.md`

Produce a set of ready-to-review **paid-ad creatives** for a client — multiple distinct angles with on-image text and full post copy (primary text, headline, description) for a chosen platform and placement, plus the visual direction nee…
- **Referenties →** Ad Creative Standards (`knowledge/ad-creative-standards.md`); Template: Ad Creative Output (`templates/ad-creative-output.md`)
- **Vermeldingen →** Copywriter (`agents/copywriter.md`); Humanizer (`agents/humanizer.md`); Meta Ads Strategist (`agents/meta-ads-strategist.md`); Orchestrator Agent (`agents/orchestrator.md`); QA & Compliance Reviewer (`agents/qa-compliance-reviewer.md`)
- **Aangehaald door ←** Copywriter (`agents/copywriter.md`); Orchestrator Agent (`agents/orchestrator.md`)

#### Workflow: Client Email Draft
`workflows/client-email.md`

Draft a clear, on-brand client email — for example sharing results, proposing a change, requesting information, or following up — that a Saerens team member can review, adjust, and send.
- **Referenties →** Template: Client Email (`templates/client-email.md`); Tone of Voice (`knowledge/tone-of-voice.md`)
- **Vermeldingen →** Copywriter (`agents/copywriter.md`); Orchestrator Agent (`agents/orchestrator.md`); Reporting Specialist (`agents/reporting-specialist.md`)
- **Aangehaald door ←** Orchestrator Agent (`agents/orchestrator.md`); Workflow: Proactive Client Update (`workflows/client-update.md`)

#### Workflow: Google Ads Account Audit
`workflows/account-audit.md`

Assess the health of an existing Google Ads account and produce a prioritized list of improvements — the kind of "free audit" Saerens offers prospects, or a periodic deep-dive for an existing client.
- **Referenties →** Analytics & Tracking Standards (`knowledge/analytics-standards.md`); Google Ads Standards (`knowledge/google-ads-standards.md`)
- **Vermeldingen →** Google Ads Optimization Specialist (`agents/google-ads-optimization-specialist.md`); Google Ads Strategist (`agents/google-ads-strategist.md`); Orchestrator Agent (`agents/orchestrator.md`); Reporting Specialist (`agents/reporting-specialist.md`)
- **Aangehaald door ←** Orchestrator Agent (`agents/orchestrator.md`)

#### Workflow: Google Ads Campaign Setup
`workflows/campaign-setup.md`

Prepare a complete, implementation-ready Google Ads campaign setup for a client — from strategy to a structure a human can review and build.
- **Referenties →** Template: Google Ads Output (`templates/google-ads-output.md`)
- **Vermeldingen →** Analytics & Tracking Specialist (`agents/analytics-tracking-specialist.md`); Copywriter (`agents/copywriter.md`); Google Ads Setup Specialist (`agents/google-ads-setup-specialist.md`); Google Ads Strategist (`agents/google-ads-strategist.md`); Orchestrator Agent (`agents/orchestrator.md`)
- **Aangehaald door ←** Orchestrator Agent (`agents/orchestrator.md`)

#### Workflow: Landing Page Review
`workflows/landing-page-review.md`

Review a landing page against its traffic source and goal, and produce prioritized, conversion-focused recommendations so the clicks Saerens drives (paid and organic) convert better.
- **Referenties →** Landing Page & Conversion Standards (`knowledge/landing-page-standards.md`); Replit Canvas — Using It Across Flows (`knowledge/replit-canvas.md`)
- **Vermeldingen →** Copywriter (`agents/copywriter.md`); Landing Page / Web Design Specialist (`agents/landing-page-specialist.md`); Orchestrator Agent (`agents/orchestrator.md`); SEO Specialist (`agents/seo-specialist.md`)
- **Aangehaald door ←** Orchestrator Agent (`agents/orchestrator.md`)

#### Workflow: Meta Ads Campaign Setup
`workflows/meta-ads-setup.md`

Prepare a complete, implementation-ready Meta (Facebook & Instagram) Ads setup for a client — from strategy to a structure a human can review and build — positioned to complement the client's Google Ads.
- **Referenties →** Analytics & Tracking Standards (`knowledge/analytics-standards.md`); Meta Ads Standards (`knowledge/meta-ads-standards.md`)
- **Vermeldingen →** Copywriter (`agents/copywriter.md`); Landing Page / Web Design Specialist (`agents/landing-page-specialist.md`); Meta Ads Strategist (`agents/meta-ads-strategist.md`); Orchestrator Agent (`agents/orchestrator.md`)
- **Aangehaald door ←** Orchestrator Agent (`agents/orchestrator.md`)

#### Workflow: Monthly Client Report
`workflows/monthly-reporting.md`

<!-- deliverable: monthly-report-email -->
- **Referenties →** Template: Reporting Output (`templates/reporting-output.md`)
- **Vermeldingen →** Google Ads Optimization Specialist (`agents/google-ads-optimization-specialist.md`); Orchestrator Agent (`agents/orchestrator.md`); Reporting Specialist (`agents/reporting-specialist.md`)
- **Aangehaald door ←** Orchestrator Agent (`agents/orchestrator.md`)

#### Workflow: Proactive Client Update
`workflows/client-update.md`

Prepare a proactive client update or check-in that keeps the relationship transparent and on the Saerens "no surprises" footing — translating specialist work into clear, reassuring language. The output is a draft a human reviews and sends.
- **Referenties →** Template: Client Email (`templates/client-email.md`); Tone of Voice (`knowledge/tone-of-voice.md`); Workflow: Client Email Draft (`workflows/client-email.md`)
- **Vermeldingen →** Client Success Agent (`agents/client-success-agent.md`); Copywriter (`agents/copywriter.md`); Orchestrator Agent (`agents/orchestrator.md`); Reporting Specialist (`agents/reporting-specialist.md`)
- **Aangehaald door ←** Orchestrator Agent (`agents/orchestrator.md`)

#### Workflow: Sales Proposal
`workflows/sales-proposal.md`

Qualify a prospect and draft a proposal grounded in Saerens' real services and honest expectations — no guaranteed results. The output is a reviewable draft; a human approves pricing, commitments, and sending.
- **Referenties →** Template: Generic Task Output (`templates/task-output.md`); Tone of Voice (`knowledge/tone-of-voice.md`)
- **Vermeldingen →** Copywriter (`agents/copywriter.md`); Orchestrator Agent (`agents/orchestrator.md`); Sales / Proposal Agent (`agents/sales-proposal-agent.md`)
- **Aangehaald door ←** Orchestrator Agent (`agents/orchestrator.md`)

#### Workflow: SEO Audit
`workflows/seo-audit.md`

Assess a client's (or prospect's) organic search health across technical, on-page, and off-page SEO, and produce a prioritized roadmap of improvements — complementing, not duplicating, their paid search.
- **Referenties →** SEO Standards (`knowledge/seo-standards.md`)
- **Vermeldingen →** Landing Page / Web Design Specialist (`agents/landing-page-specialist.md`); Orchestrator Agent (`agents/orchestrator.md`); Reporting Specialist (`agents/reporting-specialist.md`); SEO Specialist (`agents/seo-specialist.md`)
- **Aangehaald door ←** Orchestrator Agent (`agents/orchestrator.md`)

#### Workflow: Tracking Setup & Review
`workflows/tracking-setup.md`

Define or review how a client's conversions are measured — across GA4, Google Ads, and Meta — so every other agent works from trustworthy, consistent data. The output is a clear measurement plan and tracking spec that a human implements.
- **Referenties →** Analytics & Tracking Standards (`knowledge/analytics-standards.md`); Template: Generic Task Output (`templates/task-output.md`)
- **Vermeldingen →** Analytics & Tracking Specialist (`agents/analytics-tracking-specialist.md`); Orchestrator Agent (`agents/orchestrator.md`); Reporting Specialist (`agents/reporting-specialist.md`); Web Developer / Builder (`agents/web-developer.md`)
- **Aangehaald door ←** Orchestrator Agent (`agents/orchestrator.md`)

#### Workflow: Web Build
`workflows/web-build.md`

<!-- deliverable: replit-prompt -->
- **Referenties →** Premium Web Motion & Interaction Standards (`knowledge/premium-web-motion.md`); Replit Canvas — Using It Across Flows (`knowledge/replit-canvas.md`); Replit Prompting — Writing Prompts the Agent Can Act On (`knowledge/replit-prompting.md`); Template: Generic Task Output (`templates/task-output.md`)
- **Vermeldingen →** Analytics & Tracking Specialist (`agents/analytics-tracking-specialist.md`); Copywriter (`agents/copywriter.md`); Landing Page / Web Design Specialist (`agents/landing-page-specialist.md`); Orchestrator Agent (`agents/orchestrator.md`); Web Developer / Builder (`agents/web-developer.md`)
- **Aangehaald door ←** Orchestrator Agent (`agents/orchestrator.md`); Replit Canvas — Using It Across Flows (`knowledge/replit-canvas.md`); Replit Prompting — Writing Prompts the Agent Can Act On (`knowledge/replit-prompting.md`)

### Sjablonen (6)

#### Template: Ad Creative Output
`templates/ad-creative-output.md`

Output format for paid-ad **creative packages** (Meta / Google Display & Demand Gen). Deliver multiple distinct angles. Use the sections relevant to the task; keep the order. Never invent offers, prices, or claims — mark unknowns as **[A…
- **Referenties →** Ad Creative Standards (`knowledge/ad-creative-standards.md`)
- **Aangehaald door ←** Copywriter (`agents/copywriter.md`); Creative Designer (`agents/creative-designer.md`); Workflow: Ad Creative Production (`workflows/ad-creatives.md`)

#### Template: Campaign Brief
`templates/campaign-brief.md`

Used by the Orchestrator (or Strategist) to hand a clean, complete brief to a specialist. Fill every field or mark it as "missing — to confirm".
- **Aangehaald door ←** Orchestrator Agent (`agents/orchestrator.md`)

#### Template: Client Email
`templates/client-email.md`

Used to draft client-facing emails. On-brand, clear, transparent. A human always reviews before sending.
- **Aangehaald door ←** Client Success Agent (`agents/client-success-agent.md`); Template: Google Ads Output (`templates/google-ads-output.md`); Workflow: Client Email Draft (`workflows/client-email.md`); Workflow: Proactive Client Update (`workflows/client-update.md`)

#### Template: Generic Task Output
`templates/task-output.md`

Fallback structure for any task that doesn't fit a specific template. Keeps every agent's output consistent and reviewable.
- **Aangehaald door ←** Analytics & Tracking Specialist (`agents/analytics-tracking-specialist.md`); Client Onboarding Agent (`agents/client-onboarding-agent.md`); Competitive Research Analyst (`agents/competitive-research-analyst.md`); Creative Designer (`agents/creative-designer.md`); CRO Specialist (`agents/cro-specialist.md`); Email & Marketing Automation Specialist (`agents/email-automation-specialist.md`); Orchestrator Agent (`agents/orchestrator.md`); QA & Compliance Reviewer (`agents/qa-compliance-reviewer.md`); Sales / Proposal Agent (`agents/sales-proposal-agent.md`); Shopping & Feed Specialist (`agents/shopping-feed-specialist.md`); Web Developer / Builder (`agents/web-developer.md`); Workflow: Sales Proposal (`workflows/sales-proposal.md`); Workflow: Tracking Setup & Review (`workflows/tracking-setup.md`); Workflow: Web Build (`workflows/web-build.md`)

#### Template: Google Ads Output
`templates/google-ads-output.md`

Shared output format for Strategist, Setup Specialist, and Optimization Specialist work. Use the sections relevant to the task; omit those that don't apply, but keep the order. Never invent data — mark unknowns as "to confirm".
- **Referenties →** Analytics & Tracking Standards (`knowledge/analytics-standards.md`); Google Ads Standards (`knowledge/google-ads-standards.md`); Naming Conventions (`knowledge/naming-conventions.md`); Template: Client Email (`templates/client-email.md`)
- **Vermeldingen →** Copywriter (`agents/copywriter.md`)
- **Aangehaald door ←** Google Ads Optimization Specialist (`agents/google-ads-optimization-specialist.md`); Google Ads Setup Specialist (`agents/google-ads-setup-specialist.md`); Google Ads Strategist (`agents/google-ads-strategist.md`); Workflow: Google Ads Campaign Setup (`workflows/campaign-setup.md`)

#### Template: Reporting Output
`templates/reporting-output.md`

Used by the Reporting Specialist for monthly and ad-hoc performance reports. The intended deliverable is a structured, client-tailored report (PDF) combining written analysis, recommendations, and charts — not just a plain email. Transpa…
- **Vermeldingen →** Reporting Specialist (`agents/reporting-specialist.md`)
- **Aangehaald door ←** Reporting Specialist (`agents/reporting-specialist.md`); Reporting Standards (`knowledge/reporting-standards.md`); Workflow: Monthly Client Report (`workflows/monthly-reporting.md`)

### Kennis (19)

#### Ad Creative Standards
`knowledge/ad-creative-standards.md`

Baseline standards for how Saerens builds **paid-ad creatives** (the visual ad together with its copy) for Meta (Facebook & Instagram) and Google (Display, Demand Gen, and RSA text). Agents apply these unless a client's context gives a d…
- **Referenties →** Agency Principles (`knowledge/agency-principles.md`); Tone of Voice (`knowledge/tone-of-voice.md`)
- **Vermeldingen →** Copywriter (`agents/copywriter.md`); Meta Ads Strategist (`agents/meta-ads-strategist.md`); QA & Compliance Reviewer (`agents/qa-compliance-reviewer.md`)
- **Aangehaald door ←** Copywriter (`agents/copywriter.md`); Creative Designer (`agents/creative-designer.md`); Template: Ad Creative Output (`templates/ad-creative-output.md`); Workflow: Ad Creative Production (`workflows/ad-creatives.md`)

#### Agency Principles
`knowledge/agency-principles.md`

The operating principles of Saerens Advertising. Every agent works in line with these.
- **Aangehaald door ←** Ad Creative Standards (`knowledge/ad-creative-standards.md`); Agent Personas (`knowledge/agent-personas.md`); Humanizer (`agents/humanizer.md`); QA & Compliance Reviewer (`agents/qa-compliance-reviewer.md`)

#### Agent Personas
`knowledge/agent-personas.md`

This standard defines how each AI agent becomes a distinct **team member** — an "employee" with its own name, character, and communication style — while still fitting the Saerens Advertising culture. It is the bridge between *what an age…
- **Referenties →** Agency Principles (`knowledge/agency-principles.md`); Tone of Voice (`knowledge/tone-of-voice.md`)
- **Aangehaald door ←** AGENTS.md — The AI Team Constitution (`AGENTS.md`); Analytics & Tracking Specialist (`agents/analytics-tracking-specialist.md`); Client Onboarding Agent (`agents/client-onboarding-agent.md`); Client Success Agent (`agents/client-success-agent.md`); Competitive Research Analyst (`agents/competitive-research-analyst.md`); Copywriter (`agents/copywriter.md`); Creative Designer (`agents/creative-designer.md`); CRO Specialist (`agents/cro-specialist.md`); Email & Marketing Automation Specialist (`agents/email-automation-specialist.md`); Google Ads Optimization Specialist (`agents/google-ads-optimization-specialist.md`); Google Ads Setup Specialist (`agents/google-ads-setup-specialist.md`); Google Ads Strategist (`agents/google-ads-strategist.md`); Humanizer (`agents/humanizer.md`); Landing Page / Web Design Specialist (`agents/landing-page-specialist.md`); Meta Ads Strategist (`agents/meta-ads-strategist.md`); Orchestrator Agent (`agents/orchestrator.md`); QA & Compliance Reviewer (`agents/qa-compliance-reviewer.md`); Reporting Specialist (`agents/reporting-specialist.md`); Sales / Proposal Agent (`agents/sales-proposal-agent.md`); SEO Specialist (`agents/seo-specialist.md`); Shopping & Feed Specialist (`agents/shopping-feed-specialist.md`); Web Developer / Builder (`agents/web-developer.md`)

#### Analytics & Tracking Standards
`knowledge/analytics-standards.md`

Measurement is the foundation of everything Saerens does — without reliable tracking, optimization and reporting are guesswork. These standards define what "properly measured" means. Agents reference this when preparing tracking checklis…
- **Aangehaald door ←** Analytics & Tracking Specialist (`agents/analytics-tracking-specialist.md`); Client Onboarding Agent (`agents/client-onboarding-agent.md`); CRO Specialist (`agents/cro-specialist.md`); Email & Marketing Automation Specialist (`agents/email-automation-specialist.md`); Google Ads Setup Specialist (`agents/google-ads-setup-specialist.md`); Google Ads Standards (`knowledge/google-ads-standards.md`); Google Ads Strategist (`agents/google-ads-strategist.md`); Landing Page / Web Design Specialist (`agents/landing-page-specialist.md`); Landing Page & Conversion Standards (`knowledge/landing-page-standards.md`); Meta Ads Standards (`knowledge/meta-ads-standards.md`); Meta Ads Strategist (`agents/meta-ads-strategist.md`); SEO Specialist (`agents/seo-specialist.md`); SEO Standards (`knowledge/seo-standards.md`); Shopping & Feed Specialist (`agents/shopping-feed-specialist.md`); Template: Google Ads Output (`templates/google-ads-output.md`); Workflow: Google Ads Account Audit (`workflows/account-audit.md`); Workflow: Meta Ads Campaign Setup (`workflows/meta-ads-setup.md`); Workflow: Tracking Setup & Review (`workflows/tracking-setup.md`)

#### ClickUp AI Agents — Autopilot vs Super Agents
`knowledge/clickup-ai-agents.md`

How ClickUp's own AI agents work, and the strategic question they raise for Saerens: should our AI team members *become* ClickUp Super Agents that Axel assigns tasks to, or should the app stay the brain while ClickUp is only the task/app…
- **Referenties →** ARCHITECTURE (`ARCHITECTURE.md`); ClickUp API — Integration Reference (`knowledge/clickup-api.md`); ClickUp Platform — Structure & Core Concepts (`knowledge/clickup-platform.md`); ClickUp Webhooks — Event Triggers (`knowledge/clickup-webhooks.md`); Google Ads Optimization Specialist (`agents/google-ads-optimization-specialist.md`); Google Ads Standards (`knowledge/google-ads-standards.md`)
- **Aangehaald door ←** ClickUp Platform — Structure & Core Concepts (`knowledge/clickup-platform.md`)

#### ClickUp API — Integration Reference
`knowledge/clickup-api.md`

The technical reference for connecting the Saerens app (the brain) to ClickUp (the work-management and approval layer). It covers authentication, limits, the endpoints we need to walk the hierarchy, create and assign tasks, post results…
- **Referenties →** ClickUp Platform — Structure & Core Concepts (`knowledge/clickup-platform.md`); ClickUp Webhooks — Event Triggers (`knowledge/clickup-webhooks.md`)
- **Aangehaald door ←** ClickUp AI Agents — Autopilot vs Super Agents (`knowledge/clickup-ai-agents.md`); ClickUp Platform — Structure & Core Concepts (`knowledge/clickup-platform.md`); ClickUp Webhooks — Event Triggers (`knowledge/clickup-webhooks.md`)

#### ClickUp Platform — Structure & Core Concepts
`knowledge/clickup-platform.md`

A reference for how ClickUp is organised, written so we can map the Saerens AI team and client work onto it correctly. ClickUp is the work-management surface Axel already uses day to day: a place where work lives as tasks, work is assign…
- **Referenties →** ARCHITECTURE (`ARCHITECTURE.md`); ClickUp AI Agents — Autopilot vs Super Agents (`knowledge/clickup-ai-agents.md`); ClickUp API — Integration Reference (`knowledge/clickup-api.md`); ClickUp Webhooks — Event Triggers (`knowledge/clickup-webhooks.md`)
- **Aangehaald door ←** ClickUp AI Agents — Autopilot vs Super Agents (`knowledge/clickup-ai-agents.md`); ClickUp API — Integration Reference (`knowledge/clickup-api.md`); ClickUp Webhooks — Event Triggers (`knowledge/clickup-webhooks.md`)

#### ClickUp Webhooks — Event Triggers
`knowledge/clickup-webhooks.md`

How ClickUp pushes events to us in real time, so an automation reacts to a status change instead of polling the API. Webhooks are the **trigger** side of the brain-vs-executor model in `ARCHITECTURE.md`: a human moves a task to `Approved…
- **Referenties →** ARCHITECTURE (`ARCHITECTURE.md`); ClickUp API — Integration Reference (`knowledge/clickup-api.md`); ClickUp Platform — Structure & Core Concepts (`knowledge/clickup-platform.md`)
- **Aangehaald door ←** ClickUp AI Agents — Autopilot vs Super Agents (`knowledge/clickup-ai-agents.md`); ClickUp API — Integration Reference (`knowledge/clickup-api.md`); ClickUp Platform — Structure & Core Concepts (`knowledge/clickup-platform.md`)

#### Google Ads Standards
`knowledge/google-ads-standards.md`

Baseline standards for how Saerens builds and manages Google Ads. Agents apply these unless a client's context gives a documented reason to deviate. These are agency conventions, not a substitute for current Google Ads policy — always de…
- **Referenties →** Analytics & Tracking Standards (`knowledge/analytics-standards.md`); Naming Conventions (`knowledge/naming-conventions.md`)
- **Aangehaald door ←** ClickUp AI Agents — Autopilot vs Super Agents (`knowledge/clickup-ai-agents.md`); Competitive Research Analyst (`agents/competitive-research-analyst.md`); Google Ads Setup Specialist (`agents/google-ads-setup-specialist.md`); QA & Compliance Reviewer (`agents/qa-compliance-reviewer.md`); SEO Specialist (`agents/seo-specialist.md`); Template: Google Ads Output (`templates/google-ads-output.md`); Workflow: Google Ads Account Audit (`workflows/account-audit.md`)

#### Landing Page & Conversion Standards
`knowledge/landing-page-standards.md`

Baseline standards for how Saerens reviews and recommends landing pages so paid and organic traffic converts. Agents apply these unless a client's context gives a documented reason to deviate. The page is where spend turns into results —…
- **Referenties →** Analytics & Tracking Standards (`knowledge/analytics-standards.md`); SEO Standards (`knowledge/seo-standards.md`)
- **Aangehaald door ←** CRO Specialist (`agents/cro-specialist.md`); Landing Page / Web Design Specialist (`agents/landing-page-specialist.md`); Premium Web Motion & Interaction Standards (`knowledge/premium-web-motion.md`); Replit Canvas — Using It Across Flows (`knowledge/replit-canvas.md`); Replit Prompting — Writing Prompts the Agent Can Act On (`knowledge/replit-prompting.md`); Workflow: Landing Page Review (`workflows/landing-page-review.md`)

#### Meta Ads Standards
`knowledge/meta-ads-standards.md`

Baseline standards for how Saerens builds and manages Meta (Facebook & Instagram) advertising. Agents apply these unless a client's context gives a documented reason to deviate. These are agency conventions, not a substitute for current…
- **Referenties →** Analytics & Tracking Standards (`knowledge/analytics-standards.md`)
- **Vermeldingen →** Copywriter (`agents/copywriter.md`)
- **Aangehaald door ←** Meta Ads Strategist (`agents/meta-ads-strategist.md`); QA & Compliance Reviewer (`agents/qa-compliance-reviewer.md`); Workflow: Meta Ads Campaign Setup (`workflows/meta-ads-setup.md`)

#### Naming Conventions
`knowledge/naming-conventions.md`

Consistent naming makes accounts readable, reports clear, and automation possible later. Agents apply these conventions when building or auditing campaigns. Adjust only with a documented reason.
- **Aangehaald door ←** Client Onboarding Agent (`agents/client-onboarding-agent.md`); Creative Designer (`agents/creative-designer.md`); Google Ads Setup Specialist (`agents/google-ads-setup-specialist.md`); Google Ads Standards (`knowledge/google-ads-standards.md`); QA & Compliance Reviewer (`agents/qa-compliance-reviewer.md`); Shopping & Feed Specialist (`agents/shopping-feed-specialist.md`); Template: Google Ads Output (`templates/google-ads-output.md`)

#### Portretrichting — Team
`knowledge/portrait-art-direction.md`

Hoe de portretten van het AI-team eruitzien. Dit document legt de drie verkende stijlrichtingen vast en de gedeelde art-direction, zodat een volledige portrettenset later consistent kan worden afgewerkt.
- **Vermeldingen →** Analytics & Tracking Specialist (`agents/analytics-tracking-specialist.md`); Copywriter (`agents/copywriter.md`)

#### Premium Web Motion & Interaction Standards
`knowledge/premium-web-motion.md`

Baseline standards for motion and interaction on the sites Saerens builds. The goal is a site that feels considered and premium without ever getting in the way of the message or the conversion. Motion is a finishing layer, not the produc…
- **Referenties →** Landing Page & Conversion Standards (`knowledge/landing-page-standards.md`); SEO Standards (`knowledge/seo-standards.md`)
- **Aangehaald door ←** Landing Page / Web Design Specialist (`agents/landing-page-specialist.md`); Replit Canvas — Using It Across Flows (`knowledge/replit-canvas.md`); Replit Prompting — Writing Prompts the Agent Can Act On (`knowledge/replit-prompting.md`); Web Developer / Builder (`agents/web-developer.md`); Workflow: Web Build (`workflows/web-build.md`)

#### Replit Canvas — Using It Across Flows
`knowledge/replit-canvas.md`

A "how to use it" reference for the Replit Canvas, written for the way Saerens works on client web pages. The Canvas is a visual workspace in the Replit project editor: an app you have already built appears as a frame, and you can ask th…
- **Referenties →** Landing Page & Conversion Standards (`knowledge/landing-page-standards.md`); Premium Web Motion & Interaction Standards (`knowledge/premium-web-motion.md`); Replit Prompting — Writing Prompts the Agent Can Act On (`knowledge/replit-prompting.md`); Workflow: Web Build (`workflows/web-build.md`)
- **Vermeldingen →** Landing Page / Web Design Specialist (`agents/landing-page-specialist.md`)
- **Aangehaald door ←** Landing Page / Web Design Specialist (`agents/landing-page-specialist.md`); Replit Prompting — Writing Prompts the Agent Can Act On (`knowledge/replit-prompting.md`); Web Developer / Builder (`agents/web-developer.md`); Workflow: Landing Page Review (`workflows/landing-page-review.md`); Workflow: Web Build (`workflows/web-build.md`)

#### Replit Prompting — Writing Prompts the Agent Can Act On
`knowledge/replit-prompting.md`

A "how to use it" reference for prompting the Replit Agent well. When Saerens hands web work to Replit, the quality of the build depends on the quality of the prompt and how the loop is run. This applies most directly to the Web Build de…
- **Referenties →** Landing Page & Conversion Standards (`knowledge/landing-page-standards.md`); Premium Web Motion & Interaction Standards (`knowledge/premium-web-motion.md`); Replit Canvas — Using It Across Flows (`knowledge/replit-canvas.md`); Workflow: Web Build (`workflows/web-build.md`)
- **Aangehaald door ←** Replit Canvas — Using It Across Flows (`knowledge/replit-canvas.md`); Web Developer / Builder (`agents/web-developer.md`); Workflow: Web Build (`workflows/web-build.md`)

#### Reporting Standards
`knowledge/reporting-standards.md`

How Saerens reports performance to clients. Reflects the agency promise of **full transparency and no surprises**. The Reporting Specialist follows these; other agents follow them whenever they present results.
- **Referenties →** Template: Reporting Output (`templates/reporting-output.md`)
- **Vermeldingen →** Reporting Specialist (`agents/reporting-specialist.md`)
- **Aangehaald door ←** Reporting Specialist (`agents/reporting-specialist.md`)

#### SEO Standards
`knowledge/seo-standards.md`

Baseline standards for how Saerens approaches organic search. Agents apply these unless a client's context gives a documented reason to deviate. These are agency conventions, not a substitute for current Google guidance — always defer to…
- **Referenties →** Analytics & Tracking Standards (`knowledge/analytics-standards.md`)
- **Aangehaald door ←** Competitive Research Analyst (`agents/competitive-research-analyst.md`); Landing Page & Conversion Standards (`knowledge/landing-page-standards.md`); Premium Web Motion & Interaction Standards (`knowledge/premium-web-motion.md`); SEO Specialist (`agents/seo-specialist.md`); Workflow: SEO Audit (`workflows/seo-audit.md`)

#### Tone of Voice
`knowledge/tone-of-voice.md`

How Saerens Advertising sounds — in client emails, reports, ad copy framing, and any text an agent produces. Individual clients may have their own tone (in `clients/<client>.md`); when writing *for* a client, that tone takes priority for…
- **Aangehaald door ←** Ad Creative Standards (`knowledge/ad-creative-standards.md`); Agent Personas (`knowledge/agent-personas.md`); AGENTS.md — The AI Team Constitution (`AGENTS.md`); Analytics & Tracking Specialist (`agents/analytics-tracking-specialist.md`); Client Onboarding Agent (`agents/client-onboarding-agent.md`); Client Success Agent (`agents/client-success-agent.md`); Competitive Research Analyst (`agents/competitive-research-analyst.md`); Copywriter (`agents/copywriter.md`); Creative Designer (`agents/creative-designer.md`); CRO Specialist (`agents/cro-specialist.md`); Email & Marketing Automation Specialist (`agents/email-automation-specialist.md`); Google Ads Optimization Specialist (`agents/google-ads-optimization-specialist.md`); Google Ads Setup Specialist (`agents/google-ads-setup-specialist.md`); Google Ads Strategist (`agents/google-ads-strategist.md`); Humanizer (`agents/humanizer.md`); Landing Page / Web Design Specialist (`agents/landing-page-specialist.md`); Meta Ads Strategist (`agents/meta-ads-strategist.md`); Orchestrator Agent (`agents/orchestrator.md`); QA & Compliance Reviewer (`agents/qa-compliance-reviewer.md`); Reporting Specialist (`agents/reporting-specialist.md`); Sales / Proposal Agent (`agents/sales-proposal-agent.md`); SEO Specialist (`agents/seo-specialist.md`); Shopping & Feed Specialist (`agents/shopping-feed-specialist.md`); Web Developer / Builder (`agents/web-developer.md`); Workflow: Client Email Draft (`workflows/client-email.md`); Workflow: Proactive Client Update (`workflows/client-update.md`); Workflow: Sales Proposal (`workflows/sales-proposal.md`)
