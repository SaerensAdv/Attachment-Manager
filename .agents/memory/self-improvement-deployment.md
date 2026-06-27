---
name: Self-improvement features need a Reserved VM (not Autoscale)
description: Why the learning loop + scheduler + persona editing require an always-on, persistent-disk deployment, and the source-of-truth divergence caveat.
---

The "self-improvement" surface — the learning loop (feedback -> AI proposals -> human-confirmed apply, in `lib/improvements.ts` + routes `generations.ts`/`proposals.ts`), in-app persona editing (`lib/team.ts`), and the 60s scheduler (`lib/scheduler.ts`) firing autonomous runs — has two hard deployment requirements that Replit **Autoscale cannot meet**:

1. `applyProposal`/`applyToFile` and persona edits do `writeFileSync` to the agent/knowledge **.md files on disk at runtime**. Autoscale's filesystem is ephemeral and per-instance, so learned rules would be lost on every redeploy/scale and never shared between instances.
2. The scheduler is a `setInterval` always-on loop; Autoscale scales to zero. An external cron hitting `/api/generate/autonomous` (gated by `AUTONOMOUS_TRIGGER_SECRET`, 503 if unset) is the only Autoscale-compatible substitute.

**Therefore: deploy these on a Reserved VM** (always-on + persistent writable disk) and set `AUTONOMOUS_TRIGGER_SECRET` in the deployment. As of Jun 2026 `.replit` `deploymentTarget` is `gce` (Reserved VM) and the app is published there.

**Why this still isn't fully "solved" even on a Reserved VM:** runtime .md writes live only inside the deployed container and do NOT flow back to the source repo / dev environment. A redeploy rebuilds from the repo and overwrites them. So the deployed "brain" silently diverges from the source of truth (see system-architecture-direction). The durable fix is to make learned rules live in the DATABASE (already true for client `restrictions`) or to push doc edits back to the repo — don't assume on-disk doc edits survive a redeploy.

**Partial fix shipped:** accepted *file* proposals (the learning loop's `knowledge/*.md` rule writes) are persisted as DB proposal rows, and are now **replayed onto the rebuilt .md files at boot** (`reapplyAcceptedFileProposals`, run best-effort BEFORE `warmSemanticIndex` so the index includes them). The replay is tolerant: per-proposal catch+warn, skips missing files and db-client targets, never throws into boot. So accepted learned rules now survive a redeploy. The divergence caveat REMAINS for any on-disk edit that is NOT a DB-backed accepted proposal (e.g. ad-hoc persona `.md` edits) — those still get overwritten on redeploy.

**How to apply:** before publishing anything that depends on agents learning or scheduling, switch `deploymentTarget` to a Reserved VM and confirm `AUTONOMOUS_TRIGGER_SECRET` is set. Flag the divergence tradeoff to the user — it's a cost + architecture decision, not a silent default.
