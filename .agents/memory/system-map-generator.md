---
name: System Map generator (Phase 2)
description: How the generation flow works — context assembly, SSE streaming, and the non-obvious prompt decisions.
---

# AI Team System Map — generation flow (Phase 2)

The system-map artifact turns the project docs into a live generator: user picks
client + workflow + agent + types a request → server assembles context → Claude
streams a Dutch (Flemish) markdown draft.

## UI surface: command bar on the Kaart (not a standalone page)
The flow no longer lives on a "/generate" page or "Genereren" tab — both are
retired ("/generate" redirects to "/"). It is now a ChatGPT-style command bar
docked bottom-center on the Kaart (Home) plus an expanding GenerationPanel above
it. All flow state/handlers live in `useGeneration(nodes, edges)` (shared hook);
CommandBar + GenerationPanel are thin views over it. The hook also exposes a
live-run map model — `involvedPaths`, `activePath`, `handoff {source,target}` —
that drives GraphViewer node highlighting/pulse + an animated hand-off edge.
**Why:** the generator and the org map are the same mental model; overlaying the
run on the map shows *who* is working. **How to apply:** node id === doc path, so
agent paths map directly to GraphViewer node ids; keep map overlays
pointer-events-scoped (container `pointer-events-none`, bar/panel `-auto`) so
they never block pan/zoom, and gate every animation on prefers-reduced-motion.

## Context assembly
The server stitches the prompt from existing docs read via `getDocFile`:
AGENTS.md (global rules) + selected agent + client + workflow, plus templates/
and knowledge/ files **referenced inside** the agent/workflow text (regex on
`templates|knowledge/<name>.md`). A few knowledge files are always included as
the quality bar (agency-principles, tone-of-voice, naming-conventions).

## Non-obvious decisions (keep consistent)
- **Always draft, never refuse.** The system prompt explicitly tells the model
  to always produce a complete first version and to mark missing data inline
  with `**[AAN TE VULLEN: …]**` instead of asking the user for more info.
  **Why:** a generator that refuses on sparse/empty client data (the example
  client has little content) is useless; the human-review step is what catches
  gaps. An earlier version without this rule made Claude refuse and ask questions.
- **Human-approval section is mandatory.** Output must always end with a
  `## Menselijke goedkeuring vereist` section — this mirrors the agents'
  draft-only / human-approval principle and must not be dropped. NOTE: the
  heading is now emoji-free (was `## ⚠️ ...`). **Why:** the product north star is
  "NO emojis anywhere"; generate-context.ts enforces an explicit "geen emoji's"
  rule, so the ⚠️ was intentionally removed. The no-emoji rule overrides the old
  ⚠️ convention — do not re-add the emoji.
- **Default output language = Dutch (Flemish)** (user choice), overridable only
  if the request explicitly asks another language.

## Streaming
- Custom `POST /api/generate` SSE endpoint (NOT codegen'd — orval can't generate
  SSE clients). Client consumes it with `fetch` + `ReadableStream`, splitting on
  `\n\n` and parsing `data: {content|done|error}`.
- Cancel propagation matters: pass an `AbortController` signal to
  `anthropic.messages.stream(...)` and abort on `res.on("close")`, plus a
  frontend unmount/Stop abort — otherwise tokens keep burning after disconnect.
- Validate selected paths by **doc category** (agent/client/workflow), not just
  non-empty, to avoid wrong/partial context.

## Auto-routing (orchestrator picks workflow + agent)
The "Genereren" tab no longer asks the user to pick workflow/agent manually. The
user picks a **client** (still an explicit dropdown — deliberate) + types a
request; `POST /api/route` runs the Orchestrator (Lotte) prompt and returns
`{ needsClarification, clarification, taskType, reasoning, workflow, agent,
additionalAgents }`. Frontend shows a review card (reasoning + editable
workflow/agent selects + "Mogelijk ook betrokken") before the existing
`/api/generate` stream runs. `route-request.ts` builds the prompt from
`orchestrator.md` + live workflow/agent lists; `parseRoutingJson` is a tolerant
extractor.

- **Clarification fires ONLY when the AARD (type) of work is unclear.** Missing
  *content* data (cijfers/namen/USP's) must NOT trigger clarification — the
  specialist drafts with `[AAN TE VULLEN]`. **Why:** same principle as the
  generator; an earlier prompt asked for clarification on sparse data, blocking
  every real request. Verified: rapportage/copy/SEO route through, only "Doe
  iets" asks for clarification.
- **Orchestrator is never a valid executor.** `/route`'s `resolve()` rejects
  `agents/orchestrator.md` for the `agent` category (not just excluded from the
  candidate list) — it routes work, it doesn't do it.
- **Reset-on-change must abort BOTH controllers.** Changing client/request must
  abort in-flight routing *and* generation (guarded by a `hasActiveFlow` flag),
  or a stale route/stream leaks into a newer request.
## Multi-agent teamwork (sequential chain)
The detected chain (lead + `additionalAgents`) runs **sequentially** in one
`/api/generate` call: server builds an ordered, deduped, category-validated team
(orchestrator excluded), then loops members one at a time. Each member's prompt
includes the team roster + the **accumulated prior work** of earlier colleagues
(handoff), and only the **final** member writes the
`## Menselijke goedkeuring vereist` section (emoji-free); earlier members are told NOT to.
- **SSE protocol is per-member and indexed.** Events: `agent_start {index,total,
  agent,role}` → indexed `content {index}` deltas → `agent_done {index}`, repeated
  per member, then a single `{done:true}`. Frontend renders one segment per agent
  (`segment-<i>`) keyed off these indexes.
- **EOF ≠ success.** The frontend stream reader must only treat an explicit
  `{done:true}` as completion; a socket close without it (mid-chain server crash)
  must surface an error, not a false success. **Why:** a code review caught the
  reader calling `onDone()` on any EOF, masking mid-chain failures.
- **Per-member max_tokens is capped (4096), not 8192.** Each agent contributes one
  section, and N sequential full-length generations made the chain too slow to
  finish within reasonable time. **Why:** verified a single 8192-token member
  alone could exceed ~2 min; the team felt broken.
- Team is editable in the UI before generating (lead dropdown + removable member
  chips); combined output drives copy/download.
- **A long sequential chain needs instant + live feedback or users think it's
  broken.** On generate, the UI optimistically renders the WHOLE team as a queue
  ("In wachtrij") and shows a ticking elapsed timer + "Teamlid X/N"; the first
  `agent_start` reconciles the queue against the backend's authoritative `total`.
  **Why:** with multi-minute chains and silence before the first token, the first
  user reaction was literally "werkt dit wel?".

## Smart intake (after routing, before generate)
A separate `POST /api/intake` runs once routing is confirmed: it loads the chosen
agent (which declares a "Required input"/"Vereiste invoer" list) + workflow +
client and asks Claude which ESSENTIAL inputs are still missing from the request
AND the client context, returning `{ fields:[{key,label,hint,example}] }` (≤5,
empty if nothing missing). Frontend shows an editable "Aanvullende info"-blok in
the review card; filled answers are appended to the request as a
`## Aanvullende gegevens` block before `/api/generate`.
- **Intake must consider client context, not just the request.** It only asks for
  gaps absent from BOTH. **Why:** the example client already lists locations/budget/
  language; asking for those would be noise — verified it instead asks for
  landing-page URL + campaign focus.
- **Intake is best-effort, never blocking.** Fetch failures fall back to no fields;
  empty answers are allowed (the specialist still marks them `[AAN TE VULLEN]`) —
  this complements, not replaces, the always-draft rule.
- Re-fetches on agent/workflow override (effect keyed on routed+agent+workflow+
  client), preserving already-typed answers for still-relevant keys.

## Persistence + Archive ("Archief", Phase 4 foundation)
Finished generations are now persisted (own `generations` table) and browsable in
an "Archief" tab — a clients-style vertical slice (db schema+index → api-server
store+routes → openapi+orval codegen → frontend page+route+TabNav). List endpoint
omits the heavy markdown body; detail endpoint returns full `finalMarkdown`.
- **Save happens on stream completion and is non-blocking.** The run is saved
  right before the final SSE event, inside try/catch; a DB failure logs and still
  finishes the stream so the user keeps their result. **Why:** persistence must
  never destroy a successful generation.
- **The `done` SSE event carries `archived: boolean`.** The UI only shows
  "Bewaard in archief" + invalidates the archive list when `archived === true`,
  so it never claims a save that silently failed. **Why:** a code review caught
  the UI asserting success on every `done`, even when the DB write threw.
- Stored titles are stripped of their doc prefixes (`Client: `, `Workflow: `) for
  clean archive display.

## Earlier scope note
Phase 2 had no persistence by design. The conversations/messages DB tables from
the anthropic integration template were NOT copied; only
`lib/integrations-anthropic-ai` is used.

## Live-run map feedback (queued/working/done)
The Kaart shows per-agent progress during a run via three node states: queued,
working, done. GraphViewer takes an OPTIONAL additive `nodeStatus?: Map<id,
"queued"|"working"|"done">` (built in useGeneration from segments, threaded
Home → GraphViewer) alongside the original involved/active/handoff props.
- **Any new run-state prop must be optional + additive** — never break the
  existing involvedNodeIds / activeNodeId / handoff contract. **Why:** the map is
  also the default landing surface; a required prop would crash the at-rest view.
- **Every run animation is gated twice:** the JS `reducedMotion` flag swaps the
  animated className for "" AND a `prefers-reduced-motion` block in index.css
  sets `animation:none`. Each state keeps a STATIC fallback (solid/dashed ring,
  opacity/scale) so queued/working/done stay legible without motion.

## Spotlight framing must dodge the docked panel
The run-start spotlight (`fitToNodes`) frames the team into the band ABOVE the
docked GenerationPanel/command bar, not the full viewport — otherwise the live
rings/pulse/hand-off line hide behind the panel. Home measures the dock height
(ResizeObserver on the bottom stack) and passes it as `frameBottomInset`;
fitToNodes reserves it (capped at 60% of height) and centres in the usable band.
- **Re-frame as the panel grows, but rely on its plateau.** The panel grows from
  routing-review to its `max-h-[min(70vh,40rem)]` cap (then scrolls internally),
  so the inset stops growing. A growth-triggered re-frame (>48px, only while a
  spotlight is active) follows that growth and then settles — it does NOT chase
  streaming text. **Why:** continuous re-framing would fight the user's pan/zoom
  (the spotlight is otherwise one-shot on run start, see live-run map model).
