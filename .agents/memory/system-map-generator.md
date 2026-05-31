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

## Scope boundary
No persistence in Phase 2 (deliberately — that's Phase 4). The conversations/
messages DB tables from the anthropic integration template were NOT copied; only
`lib/integrations-anthropic-ai` is used.
