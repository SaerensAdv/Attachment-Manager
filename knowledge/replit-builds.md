# Replit Builds — Prompting the Agent for Web, Decks, Videos & Data Apps

How Saerens hands build work to the Replit Agent across every build deliverable, plus the motion discipline that applies to all of them. Sections: **Replit prompting** (the general build loop and how to write a prompt), **Replit Canvas** (visual exploration), **Premium web motion & interaction standards**, **Replit slide decks**, **Replit animated videos**, and **Replit data apps**.

Shared principles across every Replit build (stated once here, do not repeat per section):
- **Recommend, don't deploy/publish.** The prompt prepares the build; a human reviews, tests, exports, and publishes. Nothing goes live automatically.
- **No emojis or decorative symbols**, in the prompt or in the output.
- **Never invent** claims, prices, figures, testimonials, logos, or data sources. Mark anything unconfirmed as **[AAN TE VULLEN: …]**.
- **Whose brand leads** follows `knowledge/saerens-brand.md`: agency-authored material uses the Saerens house style; a client's own product uses the client's brand (optionally with a Saerens signature).


---

## Replit Prompting — Writing Prompts the Agent Can Act On

A "how to use it" reference for prompting the Replit Agent well. When Saerens hands web work to Replit, the quality of the build depends on the quality of the prompt and how the loop is run. This applies most directly to the Web Build deliverable, which is itself a Replit prompt (`workflows/web-build.md`), but the same habits help any time someone writes for the Agent.

The mindset: you lead like a product owner. You bring the goal, the audience, the taste, the constraints, the feedback, and the decision about what ships. The Agent turns that direction into working software, makes changes, explains behaviour, and debugs. The better you lead, the better it builds.

### The build loop

1. **Start with the goal.** Describe the outcome — who it is for, what they should be able to do, and how it should feel — not the implementation.
2. **Build in small slices.** Ask for one piece that is complete enough to try, then add the next. Large "build everything" requests are hard to review and easy to misread.
3. **Manage context.** Give the right information at the right time (see below).
4. **Review and test.** Open the app and use it as the intended person would; do not just read what the Agent says it changed.
5. **Improve with feedback.** Tell it what to keep, what to change, and what to leave untouched.

Set direction once, then repeat steps 2 through 5 per slice.

### What to put in a prompt

Useful context types:

- **Goal** — "This page should collect catering requests."
- **Audience** — "Busy parents ordering birthday cakes."
- **Constraints** — "Keep the current colours and form fields."
- **Non-goals** — "Do not add payments yet."
- **Examples** — a screenshot, mockup, sample data, or reference page.
- **Project state** — the relevant file, component, error, or flow.
- **Definition of done** — "A visitor can submit the form and see a confirmation."

Persistent project context (brand rules, conventions, constraints to remember across sessions) belongs in `replit.md`; per-change context belongs in the current conversation. Relevant context beats volume — too much unrelated detail makes the Agent focus on the wrong thing.

### Principles for clear prompts

- **Plan first** — break the goal into logical stages, then prompt for each.
- **Be specific** — name routes, fields, formats, and edge cases.
- **Use positive language** — say what you want, not what to avoid.
- **Keep it simple** — plain language and bullet points over dense paragraphs.
- **Show examples** — a mockup, sample data, or reference URL removes ambiguity.
- **Build incrementally** — rely on checkpoints so you can roll back to a working state.
- **Provide relevant files** — point to the file that matters instead of attaching everything.
- **Start a fresh thread** when switching to an unrelated task, and summarise what still matters.

### Vague vs effective

- "Make a website." -> "Create a portfolio site with Home, About, and a Contact form; clean modern design; placeholder content."
- "Add animation." -> "Gently fade in the hero image when the landing page first loads, to create a welcoming effect."
- "Fix my code." -> "Logging in with correct credentials on `/login` returns 'User not found' in the console; here is the handler in `auth.js`."
- "Make it better." -> "Improve the spacing, labels, and submit button on the catering form; keep the same fields and do not change the specials section."

When a change goes too far, narrow the scope: "That changed too much — keep the new button style, restore the original layout, and only update the form."

### Debugging prompts

Give the exact error message, the relevant snippet, the file where it happens, what you were trying to achieve, and what you already tried.

### How we use this at Saerens

- The Web Build deliverable is a Replit prompt — write it to this standard so the build matches the approved spec.
- **The deliverable layer assembles the final paste-ready prompt.** The Web Developer's job in the team step is to deliver the build *spec* (structure, layout, components, technical notes) and to point to the Copywriter's copy — not to re-transcribe all the copy a second time. Re-typing the full copy inside the build step duplicates content and can truncate large multi-page builds. Reference it ("use the Copywriter's approved copy per section, verbatim"); the deliverable editor then weaves the real copy into the single paste-ready prompt.
- **Build in slices for large sites.** For multi-page sites, structure the spec page by page so the build can proceed one page at a time, rather than one giant "build everything" block.
- Pair it with the *Replit Canvas* section for visual exploration, and carry the brand and conversion standards (`knowledge/seo-web-content.md`) and the motion direction (the *Premium Web Motion* section) into the prompt's context.
- The same build loop and prompting habits apply to the other Replit build deliverables — the *Replit Slide Decks*, *Replit Animated Videos*, and *Replit Data Apps* sections below.
- Recommend, don't deploy: a human reviews, tests, and publishes — the prompt prepares the build, it does not put anything live.


---

## Replit Canvas — Using It Across Flows

A "how to use it" reference for the Replit Canvas, written for the way Saerens works on client web pages. The Canvas is a visual workspace in the Replit project editor: an app you have already built appears as a frame, and you can ask the Agent to generate alternative looks, compare them side by side, and apply the one you want — without rebuilding from scratch. For us it is the fastest way to explore visual direction for a client page before committing to a build.

Canvas is not tied to a single step. The same surface supports several of our flows — early design exploration, redesigning an existing page, and giving a client real options to choose from.

### When to use it

- **Explore direction before a build** — generate a few visual directions for a client page instead of describing them in words.
- **Redesign an existing page** — try a new look on a page that already exists, without committing to it.
- **Give the client options** — produce side-by-side variants so the choice is concrete, not abstract.
- **Settle a debate** — when the team is split on a direction, compare the alternatives on one board.

### Core flow (Reimagine → compare → apply)

1. **Open Canvas and pick the frame.** The app appears as a frame; select it to surface the **Reimagine** and **Preview** controls.
2. **Reimagine.** Choose a direction — *explore different vibes*, *try different layouts*, *explore different approaches*, *more like this but better*, *optimize for usability*, *show the opposite*, or *surprise me* — or describe one in your own words (e.g. "a dark theme, a minimal theme, and a colourful theme"). The Agent generates variations that keep the layout but shift the visual feel.
3. **Compare.** Zoom out to see the variations next to the original. Refine one before committing by asking the Agent (e.g. "I like the second one, but make the header bigger").
4. **Apply.** Select the variant and use **Build** — choose the **existing app** to apply the new design in place rather than create a separate copy. Then **Preview** and run the usual checks.
5. **Publish stays separate.** Publishing is a deliberate human step (see "Recommend, don't deploy" in `knowledge/seo-web-content.md`); nothing goes live automatically.

### Where it fits in our flows

- **Design exploration → approved spec.** Canvas variations feed the direction the Landing Page / Web Design Specialist shapes into an approved spec.
- **Build.** The Web Build workflow (`workflows/web-build.md`) then implements the chosen direction faithfully.
- **Review / redesign.** It also supports reworking an existing page during a landing-page review.

### Notes and cautions

- **Variations are starting points, not finished pages.** Message match, the conversion essentials, and brand fit still apply — review every direction against `knowledge/seo-web-content.md`.
- **Keep motion restrained and accessible** per the *Premium Web Motion* section; a flashier variant is not automatically a better one.
- **A human reviews, deploys, and publishes** — Canvas speeds up exploration, it does not change who signs off.

### Related

- The *Replit Prompting* section — how to write the Replit prompt that turns a chosen direction into a build.


---

## Premium Web Motion & Interaction Standards

Baseline standards for motion and interaction on the sites Saerens builds. The goal is a site that feels considered and premium without ever getting in the way of the message or the conversion. Motion is a finishing layer, not the product. Agents apply these unless a client's brand or context gives a documented reason to deviate.

### Principles

- **Restraint over spectacle.** A premium feel comes from a few precise, consistent movements — not from animating everything. If a motion does not help the visitor understand, focus, or act, remove it.
- **Motion has a purpose.** Every animation should do a job: guide attention, show a relationship, confirm an action, or smooth a transition. Decoration that distracts from the primary call to action is a defect.
- **Performance is non-negotiable.** Motion must never make the page feel slow. Conversion and Core Web Vitals come first (coordinate with `knowledge/seo-web-content.md` and `knowledge/seo-web-content.md`).
- **Accessibility is mandatory.** Respect the visitor. Honour reduced-motion preferences and never rely on motion alone to convey meaning.
- **Consistency.** Reuse the same durations, easing, and patterns across the whole site so it feels like one designed system.

### Smooth scroll

- Use a smooth-scroll layer (for example, Lenis) only when it adds a calm, premium feel — typically on long editorial or marketing pages. It is optional, not a default for every page.
- Smooth scroll must never trap or fight native scrolling: nested scroll areas, modals, and embedded content keep their own scrolling. Keyboard, anchor links, and focus navigation must continue to work.
- Disable smooth scroll entirely when the visitor prefers reduced motion.

### Scroll-triggered reveals

- Reveal content as it enters the viewport with subtle fade and short translate (a few pixels), not large slides or zooms.
- Trigger once; do not re-animate on every scroll pass. Stagger groups gently rather than animating items individually.
- Content must be present and readable without JavaScript-driven motion — reveals enhance, they never gate the content. Under reduced motion, show everything immediately.

### Micro-interactions

- Buttons, links, cards, and form fields get small, fast feedback on hover, focus, and press (subtle lift, color, or underline). Keep transitions short (roughly 150-250ms).
- Focus states must remain clearly visible for keyboard users — never remove focus outlines for the sake of aesthetics.
- Loading and state changes should feel intentional (skeletons or fades) rather than abrupt jumps.

### Page & section transitions

- Keep route and section transitions quick and simple (short fades or small moves). Avoid long, blocking transitions that delay the content the visitor came for.
- Never animate layout in a way that causes content to jump (protect Cumulative Layout Shift). Animate transform and opacity, not properties that trigger layout.

### Performance budget

- Animate only `transform` and `opacity` for movement; avoid animating width, height, top, left, or box-shadow in hot paths.
- Target 60fps; keep concurrent animations few and short. Prefer CSS transitions for simple hover/focus and a motion library for orchestrated sequences.
- Do not block first paint or interactivity on motion code or heavy animation libraries — keep the critical path lean.

### Reduced motion (required)

- Always honour `prefers-reduced-motion: reduce`. When set: disable smooth scroll, skip reveal animations (show final state immediately), and reduce or remove non-essential micro-interactions.
- Provide an equivalent, fully usable experience with motion off. Motion is never required to access content or complete a conversion.

### Apply with

Use alongside `knowledge/seo-web-content.md` (structure and conversion), `knowledge/seo-web-content.md` (speed and Core Web Vitals), and any client brand guidelines. When in doubt, choose the calmer option.


---

## Replit Slide Decks — Building Presentations with the Agent

A "how to use it" reference for handing slide-deck work to the Replit Agent. When Saerens turns an approved narrative into a presentation, the build is produced by the Replit Agent from a prompt. The quality of the deck depends on the quality of that prompt. Pair this with the *Replit Prompting* section (general prompting habits), `knowledge/agency-foundations.md` (Saerens voice), and — because a pitch/sales/results deck is agency-authored — `knowledge/saerens-brand.md` (the Saerens house style to apply).

### What a Replit slide deck is

- Presentations built as real **React components** — not static images — so they export pixel-perfect and fully editable to **PPTX, Google Slides, or PDF**, and can be **deployed as a live, shareable URL** with a built-in presenter mode.
- **One-shot generation**: the Agent creates a complete deck (layout, text, visuals) from a single, well-formed prompt, then refines through conversation.
- Brand-aware: the Agent matches uploaded **brand guidelines** (colours, fonts, visual style) or an uploaded **reference deck** used as a foundation.
- Editing after generation: the **Visual Editor** changes text, colours, spacing directly; slides can be duplicated/deleted. Drag-and-drop of elements within a slide is not supported — rearranging is done by asking the Agent.

### What to put in a slide-deck prompt

- **Goal & audience** — what the deck must achieve and who is in the room (e.g. "convince a Flemish heat-pump installer to start Google Ads with Saerens").
- **Narrative arc** — the slides in order, each with its single purpose. A strong deck has one idea per slide.
- **Per-slide content** — the headline and the concrete bullet points / numbers for each slide, taken from the team's work. Do not invent figures.
- **Visuals per slide** — charts (and what they show), icons, imagery direction. Name the chart type and the data behind it.
- **Theme & layout** — colours, fonts, and visual style. A pitch/sales/results deck is agency-authored, so apply the Saerens house style (`knowledge/saerens-brand.md`): the deck is Saerens-branded, not the client's brand. Light or dark sections per the house style. For the fixed slide-by-slide layout and reusable blocks, follow `knowledge/saerens-brand.md` rather than inventing a structure.
- **Slide count** — an explicit number (e.g. "10 slides").

### Good prompting habits for decks

- Describe the outcome and the story first, then the slide-by-slide breakdown.
- Be specific per slide ("Make the problem slide concise: one stat + one sentence"), not vague.
- Keep real numbers and claims exactly as the team approved them; mark anything unconfirmed as **[AAN TE VULLEN: …]**.
- Iterate after the first version (content, styling, add/remove/reorder slides) — expect one or two refinement rounds.

### What it is good for

Pitch decks, product overviews, team/all-hands presentations, client-facing sales decks, educational/training material.

### How Saerens uses this

- Use for sales/pitch decks and client result presentations. Ground every deck in the real client fiche (`clients/<client>.md`), the brand, and `knowledge/agency-foundations.md`.
- Never invent client logos, testimonials, or numbers — use clearly marked placeholders.
- No emojis or decorative symbols, in the prompt or in the deck.
- **Recommend, don't publish**: the prompt prepares the build; a human reviews, edits, exports, and presents or deploys. Nothing goes live automatically.


---

## Replit Animated Videos — Building Motion Graphics with the Agent

A "how to use it" reference for handing animated-video work to the Replit Agent. Saerens turns an approved concept into a short motion-graphics video that the Replit Agent builds from a prompt. Pair this with the *Replit Prompting* section (general prompting) and the *Premium Web Motion* section (restrained, tasteful motion). The client's own brand leads the content; sign it off with a Saerens logo reveal / end-card per `knowledge/saerens-brand.md`.

### What a Replit animated video is

- **Programmatic motion graphics built with React** — website animation libraries plus custom Agent skills. **Not** Remotion, and **not** AI-generated video like Runway or Sora (though AI-generated images can be used inside the animation).
- Can include text overlays, smooth transitions, and AI-generated imagery.
- **Auto-plays in a loop** in the preview; there is no built-in pause/scene selector unless you ask for one (which can reduce design quality).
- **Exports to MP4** (server-side render): resolution 720p or 1080p, frame rate 30 or 60 fps, aspect ratio 16:9 by default. Can also be published as a shareable link.
- Expect to **iterate through 2–3 versions** to land the exact result.

### What to put in an animated-video prompt

- **Goal & length** — what the video is for and a target duration (explainers and promos work best at ~30–60 seconds).
- **Scene-by-scene storyboard** — each scene in order with: what is shown, the on-screen text/overlay, and the transition into the next scene. This is the backbone of a good video prompt.
- **Visual style** — colour scheme, typography, mood (e.g. "clean, calm, dark blue and gold"), and pacing.
- **Brand assets** — logo and where it appears (e.g. a logo reveal at the end), brand colours, imagery direction.
- **End CTA** — the closing message / call to action.

### Good prompting habits for video

- Lead with the message and the story, then the scene breakdown — outcome before implementation.
- Be specific about changes when iterating ("make the transitions smoother", "add a logo reveal at the end", "change the palette to dark blue and gold").
- Keep claims and figures exactly as approved; mark unconfirmed items as **[AAN TE VULLEN: …]**.

### What it is good for

Product/feature launch promos, brand and cinematic videos, 30–60s explainers, social-media motion graphics, animated landing-page hero sections, investor/milestone announcements.

### How Saerens uses this

- Use for client explainers, promos, and ad/hero motion. Ground the concept in the real client fiche (`clients/<client>.md`), the brand, and `knowledge/agency-foundations.md`.
- Honour brand restrictions; never invent claims, prices, subsidies, or testimonials — use clearly marked placeholders.
- No emojis or decorative symbols, in the prompt or in the video.
- **Recommend, don't publish**: the prompt prepares the build; a human reviews, renders, and shares. Nothing goes live automatically.


---

## Replit Data Apps — Building Dashboards with the Agent

A "how to use it" reference for handing data-app (data-visualization) work to the Replit Agent. Saerens turns a reporting need into an interactive dashboard that the Replit Agent builds from a prompt. Pair this with the *Replit Prompting* section (general prompting), `knowledge/measurement-reporting.md` (reporting and analytics standards), and — because a dashboard is an agency reporting tool like the Saerens report — `knowledge/saerens-brand.md` (the Saerens house style to apply).

### What a Replit data app is

- An **interactive dashboard or reporting tool**: describe the goal and where the data lives, and the Agent selects KPIs, chart types, and layout and builds a complete dashboard in one shot.
- **Connected data sources**: the project's Replit Database, **warehouse connectors** (BigQuery, Databricks, Snowflake) set up via Integrations, external APIs, or uploaded files (e.g. CSV).
- **Built-in features in every dashboard**: refresh and auto-refresh, export to PDF, export individual chart data to CSV, and light/dark mode.
- **Analysis summary**: the Agent generates insights from the request and the resulting data, and can produce a more detailed analysis document on request.
- Can share the same backend/database as other artifacts (web app, slide deck) in the same project.
- **Availability**: data visualization requires a paid Replit plan.

### What to put in a data-app prompt

- **Goal** — what decision the dashboard supports and what it must track (e.g. "Google Ads performance for one client: spend, leads, CPL, by campaign and over time").
- **Data source & connection** — exactly where the data lives and how to connect (Replit DB, a named warehouse connector, an API, or an uploaded file). Never invent a data source.
- **Metrics / KPIs** — the specific numbers to surface, grounded in the team's reporting work and `knowledge/measurement-reporting.md`.
- **Chart types** — which visual for which metric (trend line, bar by campaign, table, single-stat tile).
- **Filters & interactivity** — e.g. date-range filter, campaign/region selector, search, drill-downs.
- **Layout & branding** — grouping and priority of tiles; colours/typography. A dashboard is an agency reporting tool (like the Saerens report), so apply the Saerens house style (`knowledge/saerens-brand.md`): the dashboard is Saerens-branded, not the client's brand. Light/dark per the house style.

### Good prompting habits for data apps

- State the goal and the data source first; the Agent uses parallel multi-agent search to explore a warehouse schema, so name the dataset/tables when you know them.
- Be explicit about metric definitions so the dashboard computes what you mean.
- Add filters and drill-downs in follow-up prompts after the first build.
- Never fabricate metrics, rows, or connections — mark anything unconfirmed as **[AAN TE VULLEN: …]**.

### What it is good for

Analytics dashboards (revenue, signups, engagement over time), client-facing reporting tools that stakeholders can filter without database access, data-exploration interfaces, monitoring panels for near-real-time data.

### How Saerens uses this

- Use for client performance dashboards (Google Ads / GA4 / Search Console) and internal reporting. Ground every dashboard in the real data source and the team's approved metrics; never invent data.
- No emojis or decorative symbols, in the prompt or in the dashboard.
- **Recommend, don't deploy**: the prompt prepares the build; a human connects the real data, reviews, and publishes. Nothing goes live automatically.
