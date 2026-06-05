---
name: Schedule editing (Planning page)
description: Why editing a schedule must not blindly resend cronExpr.
---

# Editing schedules without clobbering custom crons

The Planning form only models 3 cron presets (daily / weekly-Mon / monthly-1st)
via `buildCron`. Editing reuses that same form. The risk: a schedule whose cron
is NOT one of those presets (manual/backfill/other source) cannot be represented
in the form, so rebuilding cron from the preset controls would silently rewrite
its timing.

**Rule:** on edit (PATCH), only send `cronExpr`/`timezone` when the user actually
changes the frequency/time controls (tracked by a `cronTouched` flag). If
untouched, omit them so the backend keeps the existing cron. `parseCron` returns
`null` for non-preset crons (no weekly fallback).

**Why:** a fallback-to-weekly + always-send-cron approach rewrote non-preset
schedules to Monday-weekly even when the user only changed the name.

**How to apply:** any future "edit via preset form" surface that wraps a
free-form value must gate resending that value behind an explicit user-change
flag, or preserve the original.
