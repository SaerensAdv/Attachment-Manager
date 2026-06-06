---
name: Monthly report pipeline (client-facing + periods)
description: Rules for sanitizing the client report and computing the 3 comparison periods.
---

# Client-facing sanitization

The archived run keeps the FULL report (internal notes + approval checklist). The
PDF and cover email use a sanitized copy that strips internal-only heading
sections, placeholder-only sections, and stray "[AAN TE VULLEN]" lines.

**Rule:** there is NO fallback to the raw body for the client outputs. If
sanitizing yields an empty string, the send fails loudly instead of leaking
internal content.
**Why:** a `sanitized || raw` fallback silently reintroduced internal/placeholder
content into the PDF whenever stripping over-matched.
**How to apply:** the agent routes internal/approval content under the EXACT
heading `## Interne nota's (niet voor de klant)` (and `## Menselijke goedkeuring
vereist`); the strip matches on those titles. Keep doc instructions and the strip
heuristic in lockstep — if you rename the internal heading, update both.

# Comparison periods

A monthly report compares three calendar months: report month (previous month),
MoM (the month before that), and YoY (same month one year earlier). All three are
fetched best-effort — report month is required, MoM and YoY are independent
try/catch so one failure does not blank the others.

**Rule:** anchor the "current month" on `Europe/Brussels`, not UTC `new Date()`.
**Why:** a scheduled run in the first/last local hours of a month resolves to the
wrong calendar month under UTC (e.g. 00:30 Brussels on the 1st is still the prior
month in UTC), shifting every period by one.
**How to apply:** derive year/month via `Intl.DateTimeFormat(... timeZone:
"Europe/Brussels")`, then build the inclusive YYYY-MM-DD day strings with
`Date.UTC` (calendar-only, no tz shift) for the GAQL `segments.date BETWEEN`
clause.
