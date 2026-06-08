# Replit Animated Videos — Building Motion Graphics with the Agent

A "how to use it" reference for handing animated-video work to the Replit Agent. Saerens turns an approved concept into a short motion-graphics video that the Replit Agent builds from a prompt. Pair this with `knowledge/replit-prompting.md` (general prompting) and `knowledge/premium-web-motion.md` (restrained, tasteful motion). The client's own brand leads the content; sign it off with a Saerens logo reveal / end-card per `knowledge/saerens-brand.md`.

## What a Replit animated video is

- **Programmatic motion graphics built with React** — website animation libraries plus custom Agent skills. **Not** Remotion, and **not** AI-generated video like Runway or Sora (though AI-generated images can be used inside the animation).
- Can include text overlays, smooth transitions, and AI-generated imagery.
- **Auto-plays in a loop** in the preview; there is no built-in pause/scene selector unless you ask for one (which can reduce design quality).
- **Exports to MP4** (server-side render): resolution 720p or 1080p, frame rate 30 or 60 fps, aspect ratio 16:9 by default. Can also be published as a shareable link.
- Expect to **iterate through 2–3 versions** to land the exact result.

## What to put in an animated-video prompt

- **Goal & length** — what the video is for and a target duration (explainers and promos work best at ~30–60 seconds).
- **Scene-by-scene storyboard** — each scene in order with: what is shown, the on-screen text/overlay, and the transition into the next scene. This is the backbone of a good video prompt.
- **Visual style** — colour scheme, typography, mood (e.g. "clean, calm, dark blue and gold"), and pacing.
- **Brand assets** — logo and where it appears (e.g. a logo reveal at the end), brand colours, imagery direction.
- **End CTA** — the closing message / call to action.

## Good prompting habits for video

- Lead with the message and the story, then the scene breakdown — outcome before implementation.
- Be specific about changes when iterating ("make the transitions smoother", "add a logo reveal at the end", "change the palette to dark blue and gold").
- Keep claims and figures exactly as approved; mark unconfirmed items as **[AAN TE VULLEN: …]**.

## What it is good for

Product/feature launch promos, brand and cinematic videos, 30–60s explainers, social-media motion graphics, animated landing-page hero sections, investor/milestone announcements.

## How Saerens uses this

- Use for client explainers, promos, and ad/hero motion. Ground the concept in the real client fiche (`clients/<client>.md`), the brand, and `knowledge/tone-of-voice.md`.
- Honour brand restrictions; never invent claims, prices, subsidies, or testimonials — use clearly marked placeholders.
- No emojis or decorative symbols, in the prompt or in the video.
- **Recommend, don't publish**: the prompt prepares the build; a human reviews, renders, and shares. Nothing goes live automatically.
