# Screaming Frog crawl intake (technical SEO)

How the brain receives technical-crawl data from Screaming Frog SEO Spider. Use
this when a workflow needs site-wide technical SEO health (broken links, missing
or duplicate titles/descriptions, missing H1s, indexability, redirect
chains/loops, slow or large pages).

## Why it works this way

Screaming Frog is a licensed **desktop** crawler, not a cloud API. The brain
runs in the cloud and cannot drive a desktop app on someone's machine. So crawl
data follows the agency's standard brain-vs-executor contract, in the
"semi-automatic" (Model B) shape:

1. The agency runs Screaming Frog on their own licensed machine (on a schedule,
   or manually) and exports a crawl.
2. A small push uploads that export to the brain.
3. The brain stores the **latest** crawl per client and reads it during runs.
   When no crawl exists yet, or it is stale, the deliverable says so plainly
   instead of inventing numbers.

The brain never starts a crawl itself and never claims a crawl is "live now"; it
reports on the most recent export it was given, with the crawl date attached.

## What to export from Screaming Frog

Export the **Internal: All** tab as CSV. That single file carries every field
the brain uses per URL: status code, indexability, title, meta description, H1,
response time, size, and redirect target. Column matching is tolerant, so minor
SeoSpider version differences are fine.

## How it reaches the brain

`POST /api/crawl-intake?clientId=<N>` with the CSV as the request body and the
header `x-trigger-secret: <SCREAMING_FROG_INTAKE_SECRET>` (falls back to
`AUTONOMOUS_TRIGGER_SECRET`). An optional `?crawledAt=<ISO>` records when the
crawl actually ran. The brain parses the export, derives Dutch signals, and
stores them on the client as `crawlLive` / `crawlLiveAt`, rendered into the
client doc under "Technical crawl (Screaming Frog)".

## How agents should use it

Treat the crawl block as read-only diagnostics. High-severity signals (5xx,
redirect loops, large numbers of 404s or missing titles) are real problems to
raise; info signals (non-indexable pages, large pages) may be intentional and
should be checked, not assumed broken. Always pair a recommendation with the
crawl date so the reader knows how fresh it is.
