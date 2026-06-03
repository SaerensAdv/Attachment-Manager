---
name: System Map app motion layer
description: Where premium motion lives in the app and the one route that must be excluded from smooth scroll.
---

# System Map app motion layer

The app has a tasteful "premium" motion layer: Lenis smooth scroll, framer-motion route fade transitions, an animated TabNav active indicator (`layoutId`), and subtle scroll reveals on editorial mastheads. framer-motion is already a dependency; `lenis` was added.

## Smooth scroll must be OFF on the Kaart route ("/")
**Rule:** Lenis is only initialised on the scrollable editorial routes (Genereren/Klanten/Archief). It must NOT run on the Kaart route ("/").
**Why:** Kaart is a full-screen `h-[100dvh] overflow-hidden` graph (Operations Atlas) with its own wheel-driven pan/zoom. There is no page scroll there, so Lenis adds nothing and its global wheel handling can fight the canvas interactions.
**How to apply:** Gate Lenis init on `location !== "/"` (see `SmoothScroll`). If new full-screen/canvas routes are added, exclude them too.

## Reduced motion is mandatory everywhere
Every motion path honours `prefers-reduced-motion`: Lenis is skipped, route fades become instant, the active-tab pill falls back to a static span, and reveals render final state immediately. Any new motion must add the same guard.

## Dev-only gotcha
Adding a new motion dependency (or the first import that makes Vite pre-bundle framer-motion) can throw a transient "Invalid hook call / more than one copy of React" during HMR. It clears on a full workflow restart — it is not a real bug.
