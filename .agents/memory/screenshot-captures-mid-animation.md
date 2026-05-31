---
name: screenshot tool captures mid-animation
description: app_preview screenshots reload the page and capture shortly after load, so time-delayed/animated states never appear
---

The `screenshot` tool (type=app_preview) reloads the page fresh and captures a
frame shortly after load — it does NOT reflect the live preview the user is
looking at, and it will not wait for delayed/animated states to settle.

**Why this matters:** an animated d3-force layout that relaxes over ~1-2s (per-tick
React renders) is always captured half-settled, so you cannot visually verify the
final layout or any setTimeout/`simulation.on("end")`-driven follow-up (e.g.
auto-fit). Sleeping before the screenshot does nothing because the capture
reloads and restarts everything.

**How to apply:** if you need to *see* a final state, make it render
synchronously/deterministically (e.g. run the force sim to completion in a tick
loop, then setState once) rather than animating it. Console logs that fire after
load also won't reliably show up in the screenshot's brief log capture.
