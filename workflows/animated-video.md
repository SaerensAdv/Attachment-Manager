# Workflow: Animated Video Build

<!-- deliverable: animated-video-prompt -->

## Goal

Turn an approved concept into a paste-ready Replit build prompt for an **animated video** — short motion graphics the Replit Agent builds with React (not Remotion, not AI-generated video) that export to MP4. A human reviews, renders, and shares; nothing goes live automatically. This workflow's deliverable is a Replit prompt; write it per `knowledge/replit-builds.md`, `knowledge/replit-builds.md`, and `knowledge/replit-builds.md`.

## When to use

A client needs a short animated video: a product/feature promo, a 30–60s explainer, a brand/cinematic clip, a social motion graphic, or an animated landing-page hero — and we want it buildable by the Replit Agent.

## Steps

1. Identify the client and the video's goal and target duration (`clients/<client>.md`).
2. Set the creative concept with the Creative Designer (and Meta/social context where relevant).
3. Write the scene-by-scene storyboard: per scene what is shown, the on-screen text/overlay (from the Copywriter), and the transition to the next scene.
4. Set the visual style (palette, typography, mood, pacing). The client's own brand leads the content; sign it off with a Saerens logo reveal / end-card per the Saerens house style (`knowledge/saerens-brand.md`), grounded also in `knowledge/agency-foundations.md`.
5. Define the closing message / CTA.
6. Keep claims and figures exactly as approved. Pre-fill what the agency already knows; mark only genuinely unknown items as `[AAN TE VULLEN: …]`. Prepare the human approval summary.

## Agents involved

- Orchestrator Agent (routes and briefs)
- Web Developer / Builder (lead — assembles the build spec)
- Creative Designer (concept, storyboard, visual style)
- Copywriter (script and on-screen text)

## Required output

Follow `templates/task-output.md`. Must include:

- Video goal and target duration
- Scene-by-scene storyboard (visual + on-screen text + transition per scene)
- Visual style, pacing, and brand assets (logo placement, colours)
- Closing message / CTA
- Technical notes (MP4 export, 16:9, auto-play loop)
- Open questions / missing assets (claims, prices, figures as placeholders)
- Human approval required (a human reviews, renders, and shares — nothing goes live automatically)
