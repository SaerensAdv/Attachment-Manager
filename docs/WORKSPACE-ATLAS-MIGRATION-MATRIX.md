# Workspace Atlas migration matrix

**Repository:** `SaerensAdv/Attachment-Manager`  
**Branch:** `brain/workspace-graph-rebuild`  
**Baseline:** commit `a70479c`  
**Decision date:** 17 July 2026  
**Target:** migrate the current Replit application into the approved Saerens Workspace Graph artifact shell without rebuilding proven backend capabilities.

## Decision legend

| Decision | Meaning |
|---|---|
| **KEEP** | Preserve architecture and behavior. Only compatibility fixes allowed. |
| **ADAPT** | Preserve the capability and data contract, redesign its presentation or integration. |
| **REPLACE** | Retire the current implementation after a new implementation reaches parity. |
| **DELETE** | Remove after confirming there are no callers, data-retention needs or rollback dependencies. |
| **PARK** | Keep code inaccessible from the primary product until a real use case returns. |

## Executive decision

This is not a greenfield rebuild. The backend, database, authentication, generation engine, integrations, scheduler, ClickUp bridge, graph snapshot model and audit trail are valuable and remain in place.

The migration replaces the **frontend product shell and information architecture**. The approved Workspace Graph artifact becomes the visual and interaction system for the entire app. Existing capabilities move into contextual atlas surfaces instead of remaining a collection of unrelated dashboard pages.

Target model:

```plain
Saerens Workspace Atlas
├── Graph canvas               primary navigation and context
├── Command surface            generate, search, route, run
├── Inspector                  selected node details and actions
├── Operations tray            approvals, alerts, schedules, failures
├── Client workspace           live data and deliverables in node context
├── Knowledge reader           docs, workflows, agents and standards
└── Technical health           sync, queues, auth and integration state
```

## 1. Product shell and navigation

| Current asset | Decision | Target | Rationale / exit criterion |
|---|---|---|---|
| `artifacts/system-map` package | **KEEP** | Remains the React frontend package | Existing Vite, React, auth and generated API client integration are sound. |
| `App.tsx` route switch | **ADAPT** | Atlas shell with nested contextual routes | Keep Wouter and route contracts. Replace page-first chrome with persistent atlas shell. |
| `TabNav.tsx` | **REPLACE** | Artifact-style left rail plus contextual commands | Current horizontal 11-item nav fights the graph and exposes implementation categories. Remove after every route has an atlas destination. |
| `CommandPalette.tsx` | **ADAPT** | Global atlas search and command launcher | Keep keyboard-first behavior, merge graph search, generation and navigation commands. |
| `SmoothScroll.tsx` | **KEEP** | Enabled only on document/editorial surfaces | Must remain disabled on graph canvas and dense operations surfaces. |
| Route fade in `AnimatedRoutes` | **ADAPT** | Minimal opacity transitions inside atlas content zones | Full-page swaps become less common. Respect reduced motion. |
| `AuthGate.tsx` | **KEEP** | Wraps the entire Atlas | Security boundary must not move into individual pages. |
| `Toaster` / toast hook | **ADAPT** | Atlas notification rail/toast vocabulary | Keep behavior, restyle states. |
| Current public favicon / Open Graph image | **REPLACE** | Saerens Workspace Atlas identity | Replace only after the shell is approved. |
| `index.html` metadata | **ADAPT** | Atlas title, description and internal-tool metadata | Keep Vite entry. |

## 2. Workspace Graph

| Current asset | Decision | Target | Rationale / exit criterion |
|---|---|---|---|
| `/graph` route | **KEEP** | Primary Atlas workspace route | Becomes the visual source of product navigation. |
| `WorkspaceGraph.tsx` | **REPLACE** | Artifact shell implemented natively in React | Preserve query orchestration, sync, progressive disclosure and selection behavior. Replace composition and information hierarchy. |
| `WorkspaceGraphCanvas.tsx` | **ADAPT** | Organic node canvas matching the artifact | Keep d3-force, zoom, pan, focus, drag and LOD. Continue refining visual fidelity and performance. |
| `GraphLegend.tsx` | **REPLACE** | Artifact search, mode bar and compact legend | Search API and filter state remain. Current legend panel is too tool-like. |
| `NodeDetailPanel.tsx` | **REPLACE** | Persistent desktop inspector, mobile bottom sheet | Preserve neighbor queries, deeplinks and expansion. Redesign hierarchy and actions. |
| `graph-model.ts` | **KEEP** | Canonical frontend graph view model | Exhaustive type mapping and pure helpers are well tested. Extend rather than bypass. |
| `graph-model.test.ts` | **KEEP** | Regression contract | Add tests as new node types or modes appear. |
| `GraphViewer.tsx` and old documentation graph | **PARK**, then **REPLACE** | Knowledge lens inside the Atlas | It is a second graph implementation with different semantics. Preserve until docs/agent navigation exists in the new canvas, then remove the old renderer. |
| `GraphLegend.tsx` and `GraphSearch.tsx` outside `workspace-graph/` | **PARK**, then **DELETE** | Unified Atlas controls | Remove only after the old Home/Kaart graph no longer imports them. |
| `graph-viewer-utils.ts` | **ADAPT** | Shared graph geometry/LOD helpers | Move reusable geometry into `workspace-graph/` or a neutral graph package. |
| Graph snapshot database model | **KEEP** | Read-only materialized Atlas snapshot | Correct separation from ClickUp source of truth. |
| `/api/graph/overview` | **KEEP** | Initial bounded graph | Maintain node/edge limits and truncation metadata. |
| `/api/graph/neighbors/:id` | **KEEP** | Progressive disclosure | Critical to avoid loading the workspace into blue spaghetti. |
| `/api/graph/search` | **KEEP** | Global atlas find | Search must find unloaded nodes. |
| `/api/graph/sync` and status | **KEEP** | Owner-gated snapshot refresh | Later add webhook-directed invalidation, not browser-to-ClickUp calls. |
| `lib/graph/build.ts`, `collect.ts`, `clickup-structure.ts` | **KEEP** | Graph ingestion pipeline | These are the migration foundation, not disposable Replit code. |
| `lib/graph/overview.ts` | **ADAPT** | Lens-aware overview selection | Add modes for operating system, clients, agents, active work and live flows without changing the normalized contract. |
| `lib/graph/snapshot-store.ts` | **KEEP** | Atomic valid snapshot activation | Preserve last-good snapshot on partial sync failure. |
| Graph backend and route tests | **KEEP** | Required release gate | Expand for lens selection, orphan handling and sensitive-data denylist. |

## 3. Current frontend pages

| Current route / page | Decision | Atlas destination | Notes |
|---|---|---|---|
| `/` `Home.tsx` (Kaart) | **REPLACE** | `/graph` becomes home after parity | Current Home contains the older documentation/agent graph. Redirect `/` only after generation and doc opening work in Atlas. |
| `/graph` `WorkspaceGraph.tsx` | **REPLACE** | Atlas home | First migration surface. |
| `/dashboard` `Dashboard.tsx` | **ADAPT**, then **PARK** | Operations summary overlay/tray | Preserve useful revenue, run and health queries. Delete decorative metrics. Do not keep a separate generic dashboard as primary navigation. |
| `/team` `Team.tsx` | **ADAPT** | Agent lens and inspector | Preserve agent data, stats, persona and portraits. Move editing to an inspector action, not a standalone page-first experience. |
| `/clients` `Clients.tsx` | **ADAPT** | Client lens and client inspector | Preserve ClickUp linking, client live data and dossier access. ClickUp remains master. |
| `/crawl` `CrawlUpload.tsx` | **ADAPT** | Client node → SEO tools → crawl intake | Keep upload/history functionality. Remove from global navigation. |
| `/zoektermen` `Zoektermen.tsx` | **ADAPT** | Active Work / Google Ads lens | Preserve review and gated apply workflows. Surface review tasks through ClickUp-linked nodes. |
| `/history` `History.tsx` | **ADAPT** | Runs lens and run inspector | Preserve full audit and approval data. Replace 54k standalone page with composable run list/detail modules. |
| `/todo` `Todo.tsx` | **ADAPT** | Operations tray | Alerts, pending approvals and proposals belong in one persistent queue. |
| `/planning` `Planning.tsx` | **ADAPT** | Automation/Schedules lens | Preserve schedule CRUD and run-now. Remove page from primary nav. |
| `/controle` `Controle.tsx` | **ADAPT** | Technical health and governance lens | Keep validation, alerts and technical status. Recompose into atlas inspector/tray. |
| `/visuals` `VisualStudio.tsx` | **DELETE** after caller audit | None | Explicitly pruned but still present. Remove route, page, frontend helpers and backend visual routes after confirming no active calls. |
| `not-found.tsx` | **ADAPT** | Atlas-aware recovery state | Offer search and graph-home return. |

## 4. Frontend components and hooks

| Asset family | Decision | Target |
|---|---|---|
| `GenerationPanel`, `CommandBar`, `useGeneration`, `lib/generate.ts` | **ADAPT** | Atlas command surface and run drawer. Preserve SSE, fan-out, QA and deliverable handling. |
| `ApprovalPanel` | **ADAPT** | Operations tray and run inspector. Later defer canonical approval to ClickUp webhook flow. |
| `DocPanel`, `MarkdownView` | **ADAPT** | Knowledge inspector/reader opened from graph nodes. Preserve rendering and source links. |
| `ClientToolbox`, client components, `useClientEditor` | **ADAPT** | Client inspector tabs. Disable local master-data edits that conflict with ClickUp ownership. |
| `HandoffBrief`, `RunLegend` | **ADAPT** | Run inspector and animated active-flow overlay. |
| `Reveal`, `lib/motion.ts` | **KEEP** | Shared restrained motion primitives. |
| `ui/` primitives | **KEEP selectively** | Buttons, inputs, popovers, sheets and accessibility primitives remain. Restyle with Atlas tokens. Remove unused primitives after route migration. |
| `visuals/`, `lib/visuals.ts`, `visual-export.ts` | **DELETE** with Visual Studio | Remove only in one atomic cleanup with API routes and dependencies. |
| `clients-form.ts` | **ADAPT** | Separate editable operational fields from ClickUp-owned fields. |
| `route.ts`, `useGeneration.ts` | **KEEP** | Core command routing behavior. |
| `use-mobile.tsx` | **KEEP** | Responsive inspector behavior. |
| `use-toast.ts` | **ADAPT** | Keep API, restyle output. |

## 5. Backend core

| Backend family | Decision | Rationale |
|---|---|---|
| Express app bootstrap, Helmet, CORS, logging, rate limits | **KEEP** | Mature security and operational baseline. |
| Replit owner auth and session middleware | **KEEP** | The Atlas remains a single-owner internal app. |
| API route registration and OpenAPI generation | **KEEP** | Frontend migration must not fork handwritten clients. |
| Generation engine, context assembly, agent runner, orchestrator, routing, text and types | **KEEP** | This is the core product value. No frontend migration should rewrite it. |
| Generation deliverable executor | **KEEP** | Preserve typed deliverables and approval behavior. |
| Generations store, route and tests | **KEEP** | Audit trail and run inspection foundation. |
| Retrieval, semantic store, embeddings and backlinks | **KEEP** | Powers search and contextual knowledge. Expose through Atlas, do not rebuild. |
| Docs loader, validation and docs routes | **ADAPT** | Keep technical GitHub knowledge. Present it through graph nodes and reader. Eliminate in-app editing where GitHub is canonical. |
| Team/portraits | **ADAPT** | Preserve data, move UI into agent inspector. Review whether portrait editing remains worth its complexity. |
| Alerts store/routes | **ADAPT** | Feed the operations tray and ClickUp alert push. |
| Proposals/improvements | **ADAPT** | Show reviewable proposals in operations tray. Keep non-destructive apply. |
| Scheduler/schedule store/routes | **KEEP** | Required for daily loop; expose health and run-now contextually. |
| Email inbound/reply/send/threads/identity | **KEEP** | Valuable integration. Outbound client communication remains approval-gated. |
| Object storage and ACL | **KEEP** | Required for portraits, report assets and deliverables. |
| PDF/report/deck/invoice/proposal generation | **KEEP**, then review | Preserve until usage evidence says otherwise. These are deliverable capabilities, not shell concerns. |
| Website intake | **PARK** | Keep API but remove from primary Atlas until actively used. |
| Client discovery | **PARK** | Already designated later-phase. No primary navigation. |
| Visual plan and Visual Studio routes | **DELETE** after dependency audit | Contradicts completed prune decision and adds OpenAI image dependency. |
| Partner API and partner-key auth | **ADAPT** | Rename conceptually to Integration API. Keep only endpoints used by ClickUp or verified consumers. |
| Partner key admin route/store | **PARK**, then **DELETE** if unused | No UI and no speculative multi-tenant administration. |
| Legacy `lib/clickup.ts` plus newer `lib/clickup/` | **ADAPT**, then consolidate | Two ClickUp layers exist. Move all callers to typed, rate-limited `lib/clickup/`; remove legacy module after import audit. |

## 6. ClickUp integration

| Asset | Decision | Target |
|---|---|---|
| ClickUp HTTP client with retry/rate limits | **KEEP** | Single server-side client. |
| Companies mapper and sync | **KEEP** | ClickUp Companies remains customer master. |
| Client linking route/tests | **KEEP**, **ADAPT UI** | Read-only mapping surfaced in client inspector. |
| Push report/search terms/alert modules | **KEEP** | Phase 3 foundation. Complete live mapping and end-to-end validation. |
| Idempotency module and push records | **KEEP** | Mandatory safety boundary. |
| ClickUp push route | **ADAPT** | Keep owner-gated diagnostics/dry-run; hide technical controls from normal user flow. |
| Webhook pull/approval flow | **ADD** | Phase 4. Signature verification, allowlist, CAS claim and immutable output snapshot. |
| Graph import of ClickUp structure | **KEEP** | Primary Atlas data source. |
| Browser-direct ClickUp access | **PROHIBIT** | Tokens remain server-side. |

## 7. Data model

| Schema | Decision | Notes |
|---|---|---|
| `auth` sessions/users | **KEEP** | No migration. |
| `clients` | **ADAPT** | Keep runtime cache and integration IDs. Mark ownership per field. ClickUp-owned fields become read-only locally. |
| `client_groups` | **REVIEW / ADAPT** | Keep if group-level billing is genuinely active. Otherwise park UI, retain data. |
| `generations` and generation steps | **KEEP** | Core run/audit model. |
| `clickup_push_records` | **KEEP** | Required idempotency/audit. |
| `graph_snapshots` | **KEEP** | Core Atlas read model. |
| `schedules` | **KEEP** | Daily loop. |
| `monitored_terms` | **KEEP** | Search-term workflow. |
| `email_threads` | **KEEP** | Two-way email continuity. |
| `proposals` / improvement proposals | **KEEP** | Learning loop and review queue. |
| `invoices` | **PARK / KEEP DATA** | Do not delete financial records. Hide UI if ClickUp/accounting becomes canonical. |
| `partner_keys` | **PARK**, then migration decision | Retain until all consumers are identified; do not expose admin UI. |
| pgvector tables outside Drizzle | **KEEP**, governance fix later | Do not mix this frontend migration with schema ownership cleanup. |
| crawl snapshots outside Drizzle | **KEEP**, governance fix later | Same rule. |
| Future webhook events/dead letters | **ADD** | Required for Phase 4 exactly-once processing. |

## 8. Shared packages

| Package | Decision | Target |
|---|---|---|
| `lib/api-spec` | **KEEP** | Canonical API contract. |
| `lib/api-zod` | **KEEP** | Runtime validation. |
| `lib/api-client-react` | **KEEP** | Generated frontend bindings. Never fork manually. |
| `lib/db` | **KEEP** | Drizzle source of truth for managed schema. |
| `lib/replit-auth-web` | **KEEP** | Frontend session integration. |
| `lib/integrations-anthropic-ai` | **KEEP** | Core generation path. |
| `lib/integrations-openai-ai-server` | **PARK**, then **DELETE** if only Visual Studio uses it | Verify all imports first. |
| `lib/brand` | **ADAPT** | Split durable Saerens corporate brand from Atlas product UI tokens. Current purple/amber deck palette should not dictate graph semantics. |

## 9. Brand and design system

| Current choice | Decision | Target |
|---|---|---|
| Plus Jakarta Sans + Outfit brand package | **KEEP for client deliverables** | Reports, PDFs, decks and external brand outputs. |
| Inter / Playfair / Space Mono app mix | **REPLACE / CONSOLIDATE** | Atlas uses one readable UI family plus one mono metadata family. No decorative serif unless it earns a structural role. |
| Purple/amber corporate accent | **ADAPT** | Keep for Saerens identity and external outputs, not as default observability palette. |
| Artifact dark cyan/orange graph palette | **KEEP as Atlas semantic palette** | Cyaan structure, blue knowledge, orange execution, green healthy flow, red errors only. |
| HSL global tokens | **ADAPT** | New Atlas tokens should use OKLCH. Existing shadcn HSL tokens may remain temporarily for non-migrated pages. |
| Square editorial card system | **REPLACE in Atlas** | Use spatial grouping, rails and panels. Avoid endless card grids. |
| Current `.dark` fake light theme | **DELETE after migration** | Atlas dark theme is explicit and scoped, not a fake global dark class. |
| `wg-canvas` scoped theme | **ADAPT** | Promote into the Atlas shell token layer once all primary routes migrate. |

## 10. Repository content outside runtime code

| Asset family | Decision | Notes |
|---|---|---|
| `AGENTS.md`, `agents/`, `workflows/`, `knowledge/`, `templates/` | **KEEP** | Versioned AI configuration and technical knowledge remain canonical in GitHub. |
| Paused agent files | **KEEP** | Preserve history, exclude from routing and default graph overview. |
| `clients/` generated markdown | **ADAPT** | Generated cache only. Never manually maintained. |
| `SYSTEM-MAP.md` | **REPLACE** | Regenerate from normalized graph snapshot or retire. Current June snapshot is stale. |
| `ARCHITECTURE.md`, `ROADMAP.md` | **ADAPT** | Update after migration decisions land. |
| `STRESS-TEST.md` and scripts | **KEEP** | Useful release gates, but update route assumptions. |
| `attached_assets`, outputs, deliverables, client reports | **REVIEW** | Separate fixtures from generated/runtime artifacts. Generated output should not accumulate in Git unless intentionally versioned. |
| Audit deck artifacts | **PARK** | Keep until deliverable strategy review. Not part of Atlas shell migration. |
| `mockup-sandbox` | **DELETE** after confirming no build dependency | Temporary artifact. |
| Example client data | **DELETE or isolate as fixtures** | Must not appear in production graph or retrieval. |

## 11. Dependency decisions

| Dependency/family | Decision | Notes |
|---|---|---|
| React 19, Vite 7, Wouter, TanStack Query | **KEEP** | No framework migration. |
| d3-force | **KEEP** | Organic layout engine. |
| react-zoom-pan-pinch | **KEEP initially** | Replace only if measurable interaction limitations appear. |
| Framer Motion | **KEEP selectively** | Layout/state transitions, not gratuitous animation. |
| Tailwind 4 | **KEEP** | Existing component ecosystem. Atlas may use scoped CSS for canvas precision. |
| Radix/shadcn primitives | **KEEP selectively** | Accessibility foundation. Remove unused packages after migration. |
| Recharts | **PARK** | Keep for real analytics surfaces only. |
| Mermaid, Shiki, CodeMirror | **ADAPT/PARK** | Keep where knowledge reader or code editing genuinely needs them. |
| next-themes | **DELETE after audit** | No theme switcher; product has a deliberate Atlas theme. |
| Lenis | **KEEP only for editorial surfaces** | Never on canvas. |
| html-to-image / jsPDF | **REVIEW** | Keep only if export remains active. |
| OpenAI image integration | **DELETE if Visual Studio-only** | Reduces cost and attack surface. |

## 12. Target route map

| Target route | Purpose | Sources absorbed |
|---|---|---|
| `/` and `/graph` | Atlas graph home | Current Home + WorkspaceGraph |
| `/graph/:nodeId` | Deep-linked selected object | Detail panels from clients, agents, docs and runs |
| `/operations` | Alerts, approvals, proposals, schedules and failures | Todo + Planning + parts of Controle + Dashboard |
| `/runs` | Run archive and audit inspection | History |
| `/clients/:id` | Optional direct client deep link into Atlas lens | Clients + ClientToolbox + Crawl + live data |
| `/agents/:slug` | Optional direct agent deep link | Team |
| `/ads/search-terms` | Focused high-density review workspace | Zoektermen |
| `/health` | Technical diagnostics | Controle |

Routes may remain as compatibility redirects while the Atlas absorbs their capabilities.

## 13. Migration waves

### Wave 0: freeze and baseline

- Keep draft PR unmerged.
- Capture route/API/test baseline.
- Protect `main` and require PRs.
- Mark artifact as the visual reference.

### Wave 1: Atlas shell

- Implement persistent header, rail, canvas, inspector and command/search shell.
- Make `/graph` visually faithful to the artifact.
- Keep every existing route reachable.

### Wave 2: Knowledge and agents

- Open Docs, Pages, agents, workflows and SOPs in the inspector/reader.
- Bring generation command and run state into the shell.
- Retire old Home graph after parity.

### Wave 3: Clients and active work

- Add client lens, client inspector tabs and live-data actions.
- Move search terms and crawl intake behind relevant client/work nodes.
- Enforce ClickUp-owned field read-only behavior.

### Wave 4: Operations

- Merge Todo, Planning, approvals, alerts and health into operations surfaces.
- Keep History as run lens, then decompose its monolithic page.

### Wave 5: cleanup

- Remove old TabNav and redundant graph implementation.
- Remove Visual Studio and OpenAI image path.
- Consolidate ClickUp modules.
- Remove unused UI primitives and dependencies.
- Replace stale SYSTEM-MAP snapshot.

### Wave 6: ClickUp pull and daily loop

- Add verified webhook approval flow.
- Activate Monday search-term and monthly-report schedules.
- Show live flows and failures in Atlas.

## 14. Hard release gates

A route or component is removed only when:

1. its Atlas replacement has feature parity;
2. typecheck, unit tests and production build are green;
3. canonical data ownership is unchanged;
4. deep links or compatibility redirects exist where needed;
5. rollback is documented;
6. Axel approves the visual and operational result in Replit.

## 15. Immediate next decision

Proceed with **Wave 1 only** on the current branch. Do not yet merge, delete routes or redesign backend contracts. The next implementation objective is pixel-level artifact fidelity plus a stable shell API that later surfaces can plug into.
