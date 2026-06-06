<!-- deliverable: google-ads-csv -->

# Workflow: Google Ads Ad Copy (Search RSA -> CSV)

## Goal

Produce ready-to-review **Responsive Search Ad (RSA) copy** for a client's live
Google Ads **Search** campaigns — headlines and descriptions per real ad group —
and package it as a **Google Ads Editor-compatible CSV** the user reviews and
bulk-imports. This is the text-ad counterpart to `workflows/ad-creatives.md`
(which covers *visual* Meta/Display creatives).

## When to use

A client needs new or refreshed **search ad copy**: a new campaign's ads, a
copy refresh on existing ad groups, new angles to test, or filling ad groups that
are thin on assets. Use this whenever the output should map onto real ad groups
and be uploadable, not just pasted.

## Data source — real account, never invented

The app pulls the client's **live, read-only** Search structure before the team
writes (campaigns, ad groups, each ad group's landing page / Final URL and
display paths from existing RSAs, the keyword themes per ad group, and any
existing RSA copy as refresh context). Copy is written **per real ad group** so
each line in the CSV belongs to an ad group that actually exists. If a client has
no Google Ads customer id configured, the copy is still produced but the CSV's
structure columns are marked for manual fill-in (the team never invents account
structure).

## Steps

1. Confirm the **offer**, primary benefit, and call to action; review the client
   file (`clients/<client>.md`) for tone, real proof points, and brand restrictions.
2. Read the injected **live ad-group structure** — keyword themes and landing page
   per ad group drive message match.
3. Write RSA copy **per ad group** following `knowledge/ad-copy-standards.md`:
   default to the full asset count (up to 15 headlines, 4 descriptions), the main
   keyword in a headline, distinct angles (not reworded twins), benefit + clear CTA.
4. Respect Google Ads **character limits** (headline <= 30, description <= 90, each
   display path <= 15) and **policy** (no unverifiable superlatives, no excessive
   punctuation, no competitor trademarks, no emojis).
5. Add a **QA & Compliance** pass for claims/policy before the human approval note.
6. The deliverable layer converts the approved copy + the real structure into one
   **Google Ads Editor CSV** for the user to review and import.

## Agents involved

- Orchestrator Agent (routes and briefs)
- Copywriter (lead — headlines, descriptions, angles)
- Google Ads Setup Specialist (ad-group mapping, paths, message match to structure)
- QA & Compliance Reviewer (claims / policy, before the file is used)

## Required output

The team's markdown (copy per ad group, with character counts and policy flags),
then the **CSV deliverable**: one row per ad group, columns exactly as in
`knowledge/ad-copy-standards.md` (`Campaign, Ad group, Ad type, Headline 1-15,
Description 1-4, Path 1, Path 2, Final URL`). Nothing goes live automatically —
the human reviews and imports the file via Google Ads Editor.

## Later upgrade paths

- **API write**: the Google Ads API can create/update RSAs directly (a live
  write), which would need a write OAuth scope and an explicit approval gate.
- **ClickUp**: an in-tool approval/tracking step around the file.

Both are out of scope for this CSV-first version, where the manual review-and-
import *is* the human-in-the-loop.
