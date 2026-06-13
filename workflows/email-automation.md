# Workflow: Email & Marketing Automation

## Goal

Design and draft an email marketing or lifecycle automation program — newsletters as a channel, lead nurturing, onboarding/retention flows, and list segmentation — that turns contacts into customers without overpromising or spamming. The output is a reviewable plan plus draft messages; a human reviews and activates.

## When to use

A client wants email marketing or automation: a welcome/onboarding sequence, a lead-nurturing flow that follows up on new leads (including the handoff into their CRM), a re-engagement or retention flow, a recurring newsletter, or list segmentation. (For a single one-off client email use `workflows/client-email.md`; for proactive client updates use `workflows/client-update.md`.)

## Steps

1. Review the client context, audience, and goals (`clients/<client>.md`) and the brand voice (`knowledge/tone-of-voice.md`).
2. Confirm the program goal and trigger: what event starts the flow (new lead, purchase, sign-up, inactivity) and the action each message should drive.
3. Map the audience and segments — who receives what, based on data the client actually has; never invent contact data.
4. Design the flow: the sequence of messages, timing/delays, and branch logic, plus where leads are written back to the client's CRM or list.
5. Draft each message (subject, preview, body, CTA) in the Saerens voice — honest and useful, respecting consent and unsubscribe rules.
6. Define the measurement: which opens/clicks/conversions matter and how success is judged, aligned with `knowledge/analytics-standards.md`.
7. Prepare the human approval summary; flag anything (claims, offers, data access, CRM/tool setup) that needs confirmation before activation.

## Agents involved

- Orchestrator Agent (routes and briefs)
- Email & Marketing Automation Specialist (lead — flow design and lifecycle)
- Copywriter (message copy and tone, where needed)
- Analytics & Tracking Specialist (measurement and CRM/data handoff, where relevant)

## Required output

Follow `templates/task-output.md` and `knowledge/tone-of-voice.md`. Must include:

- Program goal and trigger
- Audience segments and the data they rely on
- Flow map (messages, timing, branch logic, CRM/list write-back)
- Draft messages (subject + body + CTA per step)
- Measurement plan (the metrics that matter)
- Open questions / what to confirm (data access, offers, tooling)
- Human approval required before activation
