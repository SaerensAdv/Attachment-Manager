# Workflow: Web Build

<!-- deliverable: replit-prompt -->

## Goal

Turn an approved page specification or design direction into a working, reviewable, on-brand build — a landing page or simple site that is fast, responsive, and accessible. A human reviews and publishes; nothing goes live automatically. This workflow's deliverable is a Replit prompt; write it per `knowledge/replit-prompting.md`.

## When to use

After the Landing Page / Web Design Specialist has approved a page spec or structure, when a client needs a new or rebuilt page, or when an existing reference page must be faithfully cloned.

## Steps

1. Identify the client, business type, and the page's goal and traffic source (`clients/<client>.md`).
2. Confirm the approved page spec / structure (from the Landing Page / Web Design Specialist) or a clear brief. If the direction still needs exploring or a redesign is requested, use the Replit Canvas to generate and compare options first (`knowledge/replit-canvas.md`).
3. Gather brand assets (logo, colours, fonts) and final or draft copy (from the Copywriter).
4. Confirm platform / stack constraints and the tracking spec (from the Analytics & Tracking Specialist), if applicable.
5. Build the page mobile-first: responsive, accessible, and fast.
6. Implement the on-brand layout faithfully to the spec — no invented scope.
7. Apply a restrained, performant motion layer per `knowledge/premium-web-motion.md` (smooth scroll, scroll reveals, micro-interactions) with mandatory reduced-motion support.
8. Wire forms and conversion actions to the agreed tracking spec (never invent tracking IDs).
9. Note technical constraints, dependencies, and missing assets.

## Agents involved

- Orchestrator Agent (routes and briefs)
- Web Developer / Builder (lead)
- Landing Page / Web Design Specialist (provides the approved spec)
- Copywriter (page copy)
- Analytics & Tracking Specialist (tracking spec, where relevant)

## Required output

Follow `templates/task-output.md`. Must include:

- Build summary (what was built and against which spec)
- Implementation notes (stack, structure, key components)
- Page/section structure, with a pointer to the Copywriter's approved copy per section — do **not** re-transcribe the full copy here. The deliverable layer assembles the final paste-ready prompt from this spec plus the Copywriter's copy; re-typing all the copy a second time duplicates content and can truncate large multi-page builds (see `knowledge/replit-prompting.md`).
- For multi-page sites: structure the spec page by page so the build can proceed in slices.
- Responsiveness & accessibility coverage
- Tracking hooks wired, or what's still needed
- Open questions / missing assets
- Human approval required (a human reviews, deploys, and publishes — nothing goes live automatically)
