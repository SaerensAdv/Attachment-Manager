---
name: New-artifact DIDNT_OPEN_A_PORT
description: A freshly createArtifact'd web/slides artifact can fail workflow startup with DIDNT_OPEN_A_PORT even though its dev server binds fine; cause + fix.
---

# New-artifact workflow fails with DIDNT_OPEN_A_PORT

Symptom: after `createArtifact`, restarting the artifact's web workflow fails with
`DIDNT_OPEN_A_PORT: didn't open port <N>` — yet the vite log shows
`ready in … ms` and `Local: http://localhost:<N>/...`, and running the dev
command manually serves HTTP 200 from the artifact's own shell.

**Root cause:** the workflow runner only detects ports that are *declared* in the
top-level `.replit` `[[ports]]` table (each maps a `localPort` → `externalPort`).
Every running artifact has an entry; the new artifact's `localPort` is missing one
because the `artifact.toml` → `.replit` port reconciliation did not add it. An
undeclared port that opens is never registered, so the runner times out.

**Diagnose:** `grep -nE 'localPort|externalPort' .replit` and compare against each
`artifacts/*/.replit-artifact/artifact.toml` `localPort`. The new artifact's port
will be absent from `.replit`. Often there are also a couple of *declared-but-unused*
mappings left over (e.g. `8082→4200`, `8099→8099`) that no artifact claims.

**Fix (within-guidance):** repoint the artifact to a pre-declared, unused
`localPort` via `verifyAndReplaceArtifactToml` — change BOTH `[[services]].localPort`
and `[services.env].PORT` to the free declared port (e.g. 8082), then
`restart_workflow`. Avoid hand-editing `.replit`; the toml callback is the sanctioned
path and re-registers the proxy route. (`verifyAndReplaceArtifactToml` with the same
content does NOT add a missing `.replit` port mapping, so a no-op re-sync won't help.)

**Why:** burned many restart attempts assuming it was a startup-time/cartographer/
resource issue (the error even hints "optimize resource-intensive startup"); it was
purely the missing port declaration.

**How to apply:** the moment a brand-new artifact's workflow reports
DIDNT_OPEN_A_PORT, check `.replit` `[[ports]]` first — do not re-debug the app code.

## Side quirk: workflow netns ≠ agent shell
Workflow dev servers run in a different network namespace from the agent's bash /
code_execution sandbox. So `ss -ltn` from bash won't list a *running* workflow's
listener, and a `fetch`/`node -e fetch` to `localhost:<port>` from the sandbox can
fail even though the workflow is serving. A manual run from bash only proves the
artifact *code* is sound — it says nothing about the workflow runner's port state.
To verify a workflow is actually reachable, screenshot via the proxy
(`localhost:80<previewPath>`), not a direct localhost probe.
