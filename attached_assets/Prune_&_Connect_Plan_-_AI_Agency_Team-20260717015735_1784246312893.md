# Prune & Connect Plan - AI Agency Team

# Prune & Connect Plan: AI Agency Team
**Datum:** 17 juli 2026
**Doel:** De bestaande Replit app (Saerens Brain) snoeien en verbinden met ClickUp zodat het dagelijks bruikbaar wordt als technische extensie van de ClickUp workspace.
**Uitvoerder:** Replit AI Agent
**Reviewer:** Axel Saerens
**Geschatte effort:** 5-7 dagen
## Architectuurprincipe
ClickUp is de cockpit (klanten, werk, scope, goedkeuringen, rapportage). Replit is de engine (externe API's, AI-uitvoering, deliverables). Ze communiceren via:
*   **Push (fase 1):** Replit schrijft data naar ClickUp (docs, tasks, comments).
*   **Pull (fase 2):** ClickUp triggert Replit via webhooks (approvals, status changes).

De app is NIET de source of truth voor klanten, werk of governance. ClickUp is dat. De app is de source of truth voor AI-configuratie (agents, workflows, knowledge) via GitHub.

* * *
## Fase 1: Prune (agent cleanup & feature strip)
### 1.1 Agent deactivering
**Wat:** Van de 26 agents in `agents/` zijn er vermoedelijk <6 die regelmatig worden aangeroepen. De rest moet gedeactiveerd worden.

**Actie:**
1. Query de `generations` tabel: `SELECT DISTINCT agent FROM generation_steps WHERE created_at > NOW() - INTERVAL '30 days'`.
2. Agents met 0 runs in 30 dagen krijgen een `active: false` flag.
3. Voeg aan `AGENTS.md` een sectie toe:

```markdown
## Agent lifecycle
- Active: agents die beschikbaar zijn voor routing
- Paused: agents die tijdelijk niet gerouteerd worden
- Deprecated: agents die permanent uitgeschakeld zijn
```

1. Update de Orchestrator routing logica: skip agents met `active: false` in `agents/<agent>.md` frontmatter.
2. Verwijder de agent files NIET uit de repo. Voeg alleen frontmatter toe:

```yaml
---
active: false
paused_date: 2026-07-17
reason: No runs in 30 days, paused during prune phase
---
```

**Verwacht resultaat:** Alleen actieve agents (vermoedelijk Orchestrator, Reporting Specialist, Google Ads Optimization, Shopping Feed, QA Reviewer, Copywriter) worden gerouteerd. Minder noise, snellere routing.
### 1.2 Feature strip: Visual Studio
**Wat:** De Visual Studio (LinkedIn visuals met HTML templates + AI backgrounds) wordt niet regelmatig gebruikt en voegt complexiteit toe.

**Actie:**
1. Verwijder de `/api/visuals` endpoint uit de Express router.
2. Verwijder de `artifacts/system-map` frontend components gerelateerd aan Visual Studio.
3. Verwijder de OpenAI image generation proxy calls die alleen voor visuals worden gebruikt.
4. Laat de Anthropic proxy intact (die wordt voor generatie gebruikt).
5. Commit message: `prune: remove Visual Studio feature (unused, reduces OpenAI dependency)`
### 1.3 Feature strip: Multi-tenant concepten
**Wat:** De codebase bevat Partner API, partner keys, en multi-tenant concepten die nooit geactiveerd zijn.

**Actie:**
1. De Partner API (`/api/v1/partner`) NIET verwijderen. We hergebruiken dit als de ClickUp-push endpoint (zie fase 3).
2. Verwijder WEL:
    *   `partner_keys` admin UI in de frontend (als die bestaat)
    *   Multi-tenant routing logica (als die bestaat)
    *   Referenties naar "rented liaison agent mechanic" in documentatie
3. Hernoem conceptueel: Partner API wordt **Integration API** (voor ClickUp en eventuele andere consumers).
### 1.4 Feature strip: Client discovery & enrichment
**Wat:** De MCC discovery flow (scan MCC → propose new clients → confirm-to-apply) is onboarding-functionaliteit die niet dagelijks wordt gebruikt.

**Actie:**
1. NIET verwijderen. Markeer als `phase: later` in de code.
2. Verwijder het uit de frontend navigatie/dashboard zodat het geen ruimte inneemt.
3. Het endpoint blijft beschikbaar maar is niet zichtbaar in de UI.
### 1.5 Dubbele Roadmap-lijsten (ClickUp)
**Wat:** De ClickUp folder heeft zowel `Roadmap` als `Product Roadmap`. Eén moet weg.

**Actie (in ClickUp, niet in Replit):**
1. Merge naar één lijst: `Roadmap`.
2. Verwijder `Product Roadmap`.
3. Dit is een ClickUp-actie, geen code change. Vermeld het hier voor completeness.

* * *
## Fase 2: Client Sync (ClickUp = master)
### 2.1 Architectuurbeslissing
**ClickUp Companies list is de enige customer master.** De app-database (`clients` tabel) wordt een read-only cache die periodiek synct vanuit ClickUp.
### 2.2 ClickUp API client bouwen
**Wat:** Een nieuwe module die de ClickUp API v2 kan aanspreken.

**Locatie:** `artifacts/api-server/src/lib/clickup/`

**Files:**

```plain
clickup/
├── client.ts          # HTTP client met auth, rate limiting, retry
├── types.ts           # TypeScript types voor ClickUp responses
├── companies.ts       # Companies list lezen + mappen naar app-schema
├── tasks.ts           # Tasks lezen/schrijven
├── docs.ts            # Docs lezen/schrijven
└── index.ts           # Barrel export
```

**Auth:** Gebruik een Personal API Token (opslaan als `CLICKUP_API_TOKEN` env var). Geen Bearer prefix. Rate limit: 100 req/min.

**Key IDs die je nodig hebt (uit de workspace):**
*   Workspace ID: `9015913612`
*   Companies list (HQ): ID ophalen via API call `GET /team/9015913612/space` → find space "01 Saerens HQ" → folder "CRM" → list "Companies"
*   Client Delivery space: ID ophalen op dezelfde manier
### 2.3 Client sync implementatie
**Wat:** Periodiek (elke 6 uur of on-demand) de Companies list ophalen en de lokale `clients` tabel updaten.

**Mapping:**

| ClickUp field | App DB field |
| ---| --- |
| Task name | name |
| Custom: Company status | status |
| Custom: Company type | type |
| Custom: Primary contact | contact\_name |
| Custom: Primary email | contact\_email |
| Custom: Website | website |
| Custom: Services active | services (array) |
| Custom: Monthly fee (van Engagement) | monthly\_fee |
| Custom: Included hours/month (van Engagement) | included\_hours |
| Task ID | clickup\_company\_id (nieuw veld) |

**Actie:**
1. Voeg `clickup_company_id` toe aan de `clients` tabel (Drizzle migration).
2. Bouw sync functie die:
    *   GET Companies list tasks via ClickUp API
    *   Per task: upsert in lokale DB op basis van `clickup_company_id`
    *   Markeer lokale records die niet meer in ClickUp staan als `synced: false`
3. Voeg scheduler entry toe: `0 */6 * * *` (elke 6 uur).
4. Voeg manual trigger toe: `POST /api/clickup/sync-clients`.
5. Log elke sync run met timestamp en aantal gesynctete records.
### 2.4 Client markdown rendering updaten
**Wat:** De huidige `clients/<client>.md` synthetic rendering moet nu vanuit de gesynctete DB-data komen in plaats van handmatig onderhouden markdown.

**Actie:**
1. De bestaande `clients/` directory wordt NIET meer handmatig bewerkt.
2. Bij elke sync: regenereer de `clients/<client>.md` files vanuit de DB.
3. Template blijft `clients/_template.md` maar wordt nu automatisch gevuld.
4. Engagement-data (scope, fee, hours) wordt apart opgehaald uit de client's Overview list.

* * *
## Fase 3: Push (Replit → ClickUp)
### 3.1 Push endpoint architectuur
**Principe:** De app pusht gestructureerde data naar ClickUp. Drie typen:

1. **Report data** → ClickUp Doc page (per klant, per periode)
2. **Search terms** → ClickUp Doc page (wekelijks, per account)
3. **Alerts** → ClickUp task comment of DM
### 3.2 Report push
**Wanneer:** Na een succesvolle reporting run (monthly-reporting workflow).

**Wat wordt gepusht:**
*   Rapport-content (markdown) → nieuwe page in het klant Reporting Doc
*   Metadata: periode, agent, run ID, status

**Implementatie:**

```typescript
// artifacts/api-server/src/lib/clickup/push-report.ts
async function pushReportToClickUp(report: GeneratedReport) {
  // 1. Find client's Reporting & Billing list via clickup_company_id
  // 2. Create a task of type "Report" with:
  //    - Name: "[YYYY-MM] {client} - Monthly Report"
  //    - Description: report markdown content
  //    - Status: "Draft" (awaiting Axel approval)
  //    - Custom fields: period, source_run_id
  // 3. Optionally: create a Doc page under the client's Reporting doc
  // 4. Return the ClickUp task URL
}
```

**Trigger:** Voeg toe aan het einde van de `monthly-reporting` workflow executor:

```typescript
if (run.status === 'completed' && run.workflow === 'monthly-reporting') {
  await pushReportToClickUp(run.output);
}
```

### 3.3 Search terms push
**Wanneer:** Elke maandag 07:00 (vóór Axel's werkdag begint).

**Wat wordt gepusht:**
*   Per account: zoektermen van afgelopen 7 dagen
*   Geclassificeerd: irrelevant, mis-routed, monitor
*   Voorgestelde negatives als lijst
*   Import-ready CSV als attachment

**Implementatie:**

```typescript
// artifacts/api-server/src/lib/clickup/push-search-terms.ts
async function pushSearchTermsToClickUp(analysis: SearchTermAnalysis[]) {
  // 1. Find or create a Doc/task for weekly search terms
  //    Location: a fixed Doc or task in a designated list
  // 2. Per account, write a section with:
  //    - Account name and ID
  //    - Table: term | impressions | clicks | cost | classification | action
  //    - Proposed negatives list
  // 3. Attach the CSV
  // 4. Set status to "Ready for review"
}
```

**Scheduler:** Voeg toe aan croner: `0 7 * * 1` (maandag 07:00 Brussels time).

**Data source:** Gebruik de bestaande Google Ads API integration:
*   `GET /api/clients/:id/google-ads` already fetches search terms
*   De `account-optimization` workflow al classificeert
*   Combineer: scheduled run van optimization workflow → push results
### 3.4 Alert push
**Wanneer:** Bij scope-overschrijding, anomalieën of failures.

**Wat wordt gepusht:**
*   Alert type en ernst
*   Klant en context
*   Aanbevolen actie

**Implementatie:**

```typescript
// artifacts/api-server/src/lib/clickup/push-alert.ts
async function pushAlertToClickUp(alert: SystemAlert) {
  // 1. Create a comment on the client's Engagement task
  //    OR create a task in Internal Work list
  // 2. Include: alert type, severity, client, context, recommended action
  // 3. Tag with priority based on severity
}
```

**Triggers:**
*   Run failed → alert
*   Budget >90% consumed → alert
*   Hours >75% of included (als time tracking data beschikbaar is) → alert

* * *
## Fase 4: Pull / Webhooks (ClickUp → Replit, fase 2)
### 4.1 Webhook setup
**Wat:** ClickUp stuurt events naar de app wanneer Axel een actie goedkeurt.

**Niet nu bouwen.** Dit is fase 2. Documenteer alleen de architectuur:

```typescript
// Future: artifacts/api-server/src/lib/clickup/webhook.ts
// POST /api/clickup/webhook
// Verify X-Signature HMAC
// Events to handle:
//   - task_status_updated (status → "Approved") → trigger send
//   - comment_posted (contains "GO" or "Akkoord") → trigger action
```

**Prerequisite:** Eerst moeten de push-flows stabiel werken. Dan pas bidirectioneel.
### 4.2 Approval flow (toekomst)

```plain
App genereert rapport → pusht naar ClickUp (status: Draft)
    → Axel reviewt in ClickUp
    → Axel zet status op "Approved"
    → Webhook naar app
    → App verstuurt email naar klant
```

Dit vervangt de huidige in-app approval queue met een ClickUp-native flow.

* * *
## Fase 5: Daily Loop (wat de app elke week doet)
Na prune en connect moet de app drie concrete dingen doen:
### 5.1 Maandag: Zoektermen (SOP-003)

```plain
07:00 - Scheduler triggert account-optimization workflow per actief Google Ads account
07:15 - Resultaten gepusht naar ClickUp (doc/task)
09:00 - Axel opent ClickUp, reviewt voorstellen
09:30 - Axel keurt negatives goed → importeert CSV in Google Ads
```

### 5.2 Maandelijks: Rapportage (SOP-002)

```plain
Dag 1-3 nieuwe maand - Scheduler triggert monthly-reporting per klant
Rapport gepusht naar ClickUp (Reporting & Billing task/doc)
Axel reviewt in ClickUp
Na goedkeuring: app verstuurt email (fase 2: via webhook; fase 1: handmatig)
```

### 5.3 Doorlopend: Alerts

```plain
Bij anomalie → alert in ClickUp
Bij run failure → alert in ClickUp
Bij budget/scope threshold → alert in ClickUp
```

* * *
## Technische checklist per fase
### Fase 1: Prune
- [ ] Query generations tabel voor agent usage (30 dagen)
- [ ] Voeg `active` frontmatter toe aan ongebruikte agents
- [ ] Update Orchestrator routing om inactive agents te skippen
- [ ] Verwijder Visual Studio endpoints en frontend components
- [ ] Verwijder multi-tenant UI elementen
- [ ] Hernoem Partner API → Integration API (conceptueel, niet breaking)
- [ ] Verberg client discovery uit frontend navigatie
- [ ] Test: generatie-engine werkt nog met gereduceerde agentset
- [ ] Commit en deploy
### Fase 2: Client Sync
- [ ] Maak `artifacts/api-server/src/lib/clickup/` module
- [ ] Implementeer ClickUp API client met auth en rate limiting
- [ ] Voeg `clickup_company_id` toe aan clients tabel (Drizzle migration)
- [ ] Bouw sync functie: ClickUp Companies → lokale DB
- [ ] Voeg scheduler entry toe (elke 6 uur)
- [ ] Voeg manual sync endpoint toe
- [ ] Update client markdown rendering naar DB-driven
- [ ] Test: clients in app matchen ClickUp Companies
- [ ] Commit en deploy
### Fase 3: Push
- [ ] Implementeer `push-report.ts`
- [ ] Implementeer `push-search-terms.ts`
- [ ] Implementeer `push-alert.ts`
- [ ] Voeg push-call toe aan reporting workflow completion
- [ ] Voeg maandag-scheduler toe voor search terms
- [ ] Voeg alert triggers toe bij failures en thresholds
- [ ] Test: data verschijnt correct in ClickUp
- [ ] Commit en deploy
### Fase 4: Pull (later)
- [ ] Webhook endpoint bouwen met signature verification
- [ ] Approval flow implementeren
- [ ] Test: end-to-end approval → send

* * *
## Wat NIET verandert
*   De 5-layer prompt assembly engine blijft intact.
*   De generation engine, SSE streaming en audit trail blijven intact.
*   Alle bestaande live read-only integraties (Google Ads, GA4, SC, etc.) blijven intact.
*   De scheduler en CAS guard blijven intact.
*   Gmail two-way email blijft intact.
*   PDF/deck generation blijft intact.
*   De learning loop blijft intact.
*   GitHub blijft canoniek voor agents/, workflows/, knowledge/, templates/.
*   De database schema blijft intact (alleen toevoegingen, geen breaking changes).

* * *
## Env vars toe te voegen

```plain
CLICKUP_API_TOKEN=pk_...
CLICKUP_WORKSPACE_ID=9015913612
CLICKUP_COMPANIES_LIST_ID=<op te halen via API>
CLICKUP_SEARCH_TERMS_DOC_ID=<aan te maken>
```

* * *
## Validatiecriteria
Het plan is geslaagd wanneer:

1. De app routeert alleen naar actieve agents (geen noise van 20+ ongebruikte agents).
2. Klantdata in de app matcht ClickUp Companies (sync werkt).
3. Elke maandag verschijnen zoektermen-voorstellen in ClickUp.
4. Maandelijkse rapporten worden naar ClickUp gepusht na generatie.
5. Alerts bij failures/thresholds landen in ClickUp.
6. Axel hoeft niet meer in de Replit UI te werken voor zijn dagelijkse ritme.
7. Geen bestaande werkende functionaliteit is gebroken.

* * *
## Gerelateerde OS-documenten
*   Alignment Audit - AI Agency Team vs. Operating System
*   Integratiepatronen: Super Agents ↔ AI Agency Team
*   SOP-002 Produce monthly client report
*   SOP-003 Optimize Google Ads accounts weekly
*   Standard: Google Ads Operations
*   Standard: Client Reporting
*   Super Agent Registry (regels over externe data en push-model)
## Change history

| Versie | Datum | Auteur | Reden |
| ---| ---| ---| --- |
| 1.0 | 17 juli 2026 | Axel Saerens + ClickUp Brain | Initieel plan op basis van alignment audit en OS-beslissingen |