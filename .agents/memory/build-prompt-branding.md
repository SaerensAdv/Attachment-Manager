---
name: Build-prompt branding & pre-fill
description: How Saerens branding and placeholder pre-fill are applied to generated Replit build-prompt deliverables, and the whose-brand-leads rule per kind.
---

# Build-prompt branding & placeholder pre-fill

The build-prompt deliverables (replit/website, slide-deck, animated-video, data-app)
inject branding via a `brand` mode on each kind's spec. The mode decides which brand block
goes into the editor's system prompt.

## Whose brand leads (the rule)
- **agency** (slide-deck, data-app): Saerens is the author → inject the FULL house style
  (palette, fonts, logo, voice, working-model copy, and proof-point numbers gated to
  "only when context calls for it"). The artifact is Saerens-branded, not the client's.
- **client** (website/replit-prompt): the client's own product → client brand leads,
  Saerens house style is explicitly NOT applied.
- **client+signature** (animated-video): client brand leads the content/design; Saerens
  appears ONLY as an end-card/logo-reveal signature.

**Why:** user feedback was that agency-authored deliverables (decks, dashboards) were
missing Saerens branding and should resemble the branded Google Ads report PDF, while a
client product video must stay the client's, not be taken over by Saerens.

## client+signature must use a separate signature-only block
Do NOT inject the full house style plus a "limit it to signature" note — that is
self-contradictory and intermittently over-brands / leaks agency proof points into
client-led material. Use a dedicated signature block that contains only logo + tagline +
subtle accent colours, and EXPLICITLY forbids agency proof points (ROAS/leads/budget) and
agency working-model copy on client-led material.

## Pre-fill over placeholders
The shared editor rule pre-fills everything already known (today's date in nl-BE
Europe/Brussels, agency facts from the house-style block, client facts from the client
context) and resolves existing `[AAN TE VULLEN: …]` markers when the answer is derivable.
Keep a placeholder ONLY for genuinely unknown task/client specifics (exact monthly fee,
phone number, the client's own logo file, final production URL). Never invent a missing
fact. House-style fonts override any generic team font choice (e.g. team said "Inter").

**How to apply:** real agency facts are baked in code (name, "Van clicks naar klanten",
Official Google Partner, 100% remote BE+NL, no yearly contract, reply 24h, Axel Saerens /
axel@saerensadvertising.com). The site phone number is a dummy — never bake it.
Verify renders cheaply by streaming the editor over saved `*.team.md` and writing each
delta to disk synchronously (bg processes get torn down between tool calls; piped stdout
is lost on timeout-kill, so incremental file writes are the only reliable capture).
