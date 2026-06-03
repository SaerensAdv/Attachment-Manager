# Replit Canvas — Using It Across Flows

A "how to use it" reference for the Replit Canvas, written for the way Saerens works on client web pages. The Canvas is a visual workspace in the Replit project editor: an app you have already built appears as a frame, and you can ask the Agent to generate alternative looks, compare them side by side, and apply the one you want — without rebuilding from scratch. For us it is the fastest way to explore visual direction for a client page before committing to a build.

Canvas is not tied to a single step. The same surface supports several of our flows — early design exploration, redesigning an existing page, and giving a client real options to choose from.

## When to use it

- **Explore direction before a build** — generate a few visual directions for a client page instead of describing them in words.
- **Redesign an existing page** — try a new look on a page that already exists, without committing to it.
- **Give the client options** — produce side-by-side variants so the choice is concrete, not abstract.
- **Settle a debate** — when the team is split on a direction, compare the alternatives on one board.

## Core flow (Reimagine → compare → apply)

1. **Open Canvas and pick the frame.** The app appears as a frame; select it to surface the **Reimagine** and **Preview** controls.
2. **Reimagine.** Choose a direction — *explore different vibes*, *try different layouts*, *explore different approaches*, *more like this but better*, *optimize for usability*, *show the opposite*, or *surprise me* — or describe one in your own words (e.g. "a dark theme, a minimal theme, and a colourful theme"). The Agent generates variations that keep the layout but shift the visual feel.
3. **Compare.** Zoom out to see the variations next to the original. Refine one before committing by asking the Agent (e.g. "I like the second one, but make the header bigger").
4. **Apply.** Select the variant and use **Build** — choose the **existing app** to apply the new design in place rather than create a separate copy. Then **Preview** and run the usual checks.
5. **Publish stays separate.** Publishing is a deliberate human step (see "Recommend, don't deploy" in `knowledge/landing-page-standards.md`); nothing goes live automatically.

## Where it fits in our flows

- **Design exploration → approved spec.** Canvas variations feed the direction the Landing Page / Web Design Specialist shapes into an approved spec.
- **Build.** The Web Build workflow (`workflows/web-build.md`) then implements the chosen direction faithfully.
- **Review / redesign.** It also supports reworking an existing page during a landing-page review.

## Notes and cautions

- **Variations are starting points, not finished pages.** Message match, the conversion essentials, and brand fit still apply — review every direction against `knowledge/landing-page-standards.md`.
- **Keep motion restrained and accessible** per `knowledge/premium-web-motion.md`; a flashier variant is not automatically a better one.
- **A human reviews, deploys, and publishes** — Canvas speeds up exploration, it does not change who signs off.
