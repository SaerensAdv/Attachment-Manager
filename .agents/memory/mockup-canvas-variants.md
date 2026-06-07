---
name: Mockup canvas variant workflow
description: Gotchas when fanning out DESIGN subagents to build canvas mockup variants and wiring iframes
---

# Building Kaart-style canvas variants via DESIGN subagents

Pattern that works: parent creates a shared read-only `_data.ts` (sample dataset +
deterministic layout helpers) in the mockup group folder so every variant renders the
SAME data and only the look differs; place N `building` iframes via `create-auto`; fan
out one `startAsyncSubagent({specialization:"DESIGN"})` per variant; subagents only WRITE
the component file (they cannot restart workflows or reliably touch the canvas); parent
restarts the preview workflow once, typechecks, then flips all iframes to live.

## Two recurring gotchas

- **DESIGN subagents sometimes emit template literals with literal backslash escapes**
  in the written `.tsx` — i.e. the file contains `` \` `` and `\${` instead of `` ` `` and
  `${`. This compiles to TS1127 "Invalid character" / TS1381 / unterminated-template
  errors. Fix in bulk: `perl -0pi -e 's/\\\`/\`/g; s/\\\$\{/\$\{/g' File.tsx`.
  **Why:** it's a quirk of how the subagent serializes code into the write tool, not a
  logic error. **How to apply:** always `tsc --noEmit` the sandbox after the subagents
  finish and grep for `\\\`` before presenting.

- **Canvas iframe UPDATE payload** (flipping building→live): use `type:"update"` with an
  `updates` object (NOT `shape`, which is the create-action key), and `updates` MUST
  include `shapeType:"iframe"` alongside `state:"live"` + `url`. Missing either field
  errors out.

## Verification

Container `curl` is blocked, so verify rendering with the `screenshot` tool
(`type:"app_preview"`, `artifact_dir_name:"mockup-sandbox"`,
`path:"/preview/<group>/<Component>"`). Always end with
`presentArtifact({artifactId, shapeIds})` — the Canvas artifact id is distinct from the
system-map web artifact.
