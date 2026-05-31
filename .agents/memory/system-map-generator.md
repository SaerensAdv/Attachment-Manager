---
name: System Map generator (Phase 2)
description: How the "Genereren" tab works — context assembly, SSE streaming, and the non-obvious prompt decisions.
---

# AI Team System Map — "Genereren" tab (Phase 2)

The system-map artifact has a second tab that turns the project docs into a live
generator: user picks client + workflow + agent + types a request → server
assembles context → Claude streams a Dutch (Flemish) markdown draft.

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
  `## ⚠️ Menselijke goedkeuring vereist` section — this mirrors the agents'
  draft-only / human-approval principle and must not be dropped.
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
- Foundation only: real multi-agent chained TEAMWORK (several agents work before
  a result appears) is the intended next step — `additionalAgents` already
  surfaces the chain but execution is still single-agent.

## Scope boundary
No persistence in Phase 2 (deliberately — that's Phase 4). The conversations/
messages DB tables from the anthropic integration template were NOT copied; only
`lib/integrations-anthropic-ai` is used.
