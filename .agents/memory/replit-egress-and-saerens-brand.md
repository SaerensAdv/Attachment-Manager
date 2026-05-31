---
name: Replit egress quirk + Saerens brand tokens
description: Container curl can't reach the internet but sandbox fetch() can; plus Saerens Advertising's real domain and brand identity.
---

## Container egress quirk
- `curl`/HTTP from the container to external sites returns `http=000` / size 0 (egress effectively blocked).
- The `code_execution` sandbox `fetch()` DOES reach external sites, and `extractBranding` / `webSearch` / `webFetch` work server-side.
- **How to apply:** to fetch external pages, CSS, branding, or download remote assets (logos/images), use `fetch()` inside `code_execution` (or `extractBranding`/`webFetch`), not shell `curl`.

## Saerens Advertising brand
- Real domain is **saerensadvertising.com** (the `.be` does not resolve — don't waste attempts on it).
- Belgian Google Ads agency for KMO's / e-commerce; positioning "Van Clicks Naar Klanten"; Google Partner; no yearly contract.
- Brand tokens (via extractBranding on /nl): dark theme, bg `#0A0A0B`, primary purple `#716BEB`, amber CTA `#F4A425`, secondary indigo `#29274E`; headings = **Plus Jakarta Sans**, body = **Outfit**; pill buttons.
- Logo: `https://saerensadvertising.com/SA_logo-100.webp` (transparent webp line-art mark; `_next/image` only allows w=256 and returns jpeg without alpha — fetch the raw `.webp` instead). It's a single-color mark, so `filter: brightness(0) invert(1)` makes it white for any background.
- Real proof points: 3,93× gem. ROAS, €1,58M conversiewaarde, 1.820+ leads, €456K adspend beheerd (last 365 days).
