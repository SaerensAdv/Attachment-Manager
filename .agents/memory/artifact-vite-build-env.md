---
name: Artifact vite build env vars
description: Running `vite build`/`vite` for an artifact outside its workflow fails fast unless PORT and BASE_PATH are set.
---

The system-map (and similarly-scaffolded) artifacts have a `vite.config.ts` that
*throws at config load* if `PORT` or `BASE_PATH` are missing — this fires for
`vite build`, `vite preview`, and `vite dev` alike, not just the dev server.

**Why:** the workflow injects these env vars; a plain shell (agent terminal,
ad-hoc `npx vite build`) does not, so the build dies with
`PORT environment variable is required` then `BASE_PATH environment variable is required`
before any compilation happens.

**How to apply:** to verify an artifact build from the shell, run e.g.
`PORT=5000 BASE_PATH=/system-map npx vite build` from the artifact dir. The
BASE_PATH should match the artifact's previewPath. For typecheck-only, `npx tsc -b`
needs neither var.
