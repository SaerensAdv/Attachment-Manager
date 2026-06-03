# Premium Web Motion & Interaction Standards

Baseline standards for motion and interaction on the sites Saerens builds. The goal is a site that feels considered and premium without ever getting in the way of the message or the conversion. Motion is a finishing layer, not the product. Agents apply these unless a client's brand or context gives a documented reason to deviate.

## Principles

- **Restraint over spectacle.** A premium feel comes from a few precise, consistent movements — not from animating everything. If a motion does not help the visitor understand, focus, or act, remove it.
- **Motion has a purpose.** Every animation should do a job: guide attention, show a relationship, confirm an action, or smooth a transition. Decoration that distracts from the primary call to action is a defect.
- **Performance is non-negotiable.** Motion must never make the page feel slow. Conversion and Core Web Vitals come first (coordinate with `knowledge/landing-page-standards.md` and `knowledge/seo-standards.md`).
- **Accessibility is mandatory.** Respect the visitor. Honour reduced-motion preferences and never rely on motion alone to convey meaning.
- **Consistency.** Reuse the same durations, easing, and patterns across the whole site so it feels like one designed system.

## Smooth scroll

- Use a smooth-scroll layer (for example, Lenis) only when it adds a calm, premium feel — typically on long editorial or marketing pages. It is optional, not a default for every page.
- Smooth scroll must never trap or fight native scrolling: nested scroll areas, modals, and embedded content keep their own scrolling. Keyboard, anchor links, and focus navigation must continue to work.
- Disable smooth scroll entirely when the visitor prefers reduced motion.

## Scroll-triggered reveals

- Reveal content as it enters the viewport with subtle fade and short translate (a few pixels), not large slides or zooms.
- Trigger once; do not re-animate on every scroll pass. Stagger groups gently rather than animating items individually.
- Content must be present and readable without JavaScript-driven motion — reveals enhance, they never gate the content. Under reduced motion, show everything immediately.

## Micro-interactions

- Buttons, links, cards, and form fields get small, fast feedback on hover, focus, and press (subtle lift, color, or underline). Keep transitions short (roughly 150-250ms).
- Focus states must remain clearly visible for keyboard users — never remove focus outlines for the sake of aesthetics.
- Loading and state changes should feel intentional (skeletons or fades) rather than abrupt jumps.

## Page & section transitions

- Keep route and section transitions quick and simple (short fades or small moves). Avoid long, blocking transitions that delay the content the visitor came for.
- Never animate layout in a way that causes content to jump (protect Cumulative Layout Shift). Animate transform and opacity, not properties that trigger layout.

## Performance budget

- Animate only `transform` and `opacity` for movement; avoid animating width, height, top, left, or box-shadow in hot paths.
- Target 60fps; keep concurrent animations few and short. Prefer CSS transitions for simple hover/focus and a motion library for orchestrated sequences.
- Do not block first paint or interactivity on motion code or heavy animation libraries — keep the critical path lean.

## Reduced motion (required)

- Always honour `prefers-reduced-motion: reduce`. When set: disable smooth scroll, skip reveal animations (show final state immediately), and reduce or remove non-essential micro-interactions.
- Provide an equivalent, fully usable experience with motion off. Motion is never required to access content or complete a conversion.

## Apply with

Use alongside `knowledge/landing-page-standards.md` (structure and conversion), `knowledge/seo-standards.md` (speed and Core Web Vitals), and any client brand guidelines. When in doubt, choose the calmer option.
