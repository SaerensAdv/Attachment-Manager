# Workflow: Client Email Reply

<!-- deliverable: email-reply -->

## Goal

Draft a clear, helpful, on-brand reply to an inbound message from a client — in the client's language (Dutch/Vlaams by default) — reflecting Saerens' promise of honest advice and a response within 24 hours. The drafted reply is always held for human approval before it is sent; nothing reaches the client unattended.

## When to use

A client replied to an agency email (e.g. their monthly report) and the message needs a substantive answer: a question about results, a request, a concern, or a follow-up. The reply is sent in-thread, from the responsible department Head, with the agency owner in CC.

## Steps

1. Read the client's inbound message carefully and identify exactly what they ask, need, or worry about.
2. Review the client's context, goals and KPIs (`clients/<client>.md`) and any relevant recent work.
3. Answer every point the client raised — directly, in plain language, without jargon.
4. Be honest: if something is uncertain, not yet known, or needs checking, say so plainly rather than over-promising. Never invent figures, results or commitments.
5. Keep it concise and professional; warm but businesslike. Reflect the Saerens tone: transparent, no surprises, helpful.
6. Propose a concrete next step or a clear answer to close the loop where appropriate.

## Agents involved

- Orchestrator Agent (routes to the responsible department Head)
- The responsible department Head (lead) — derived from the conversation, sends the reply
- Any specialist whose input the answer requires

## Required output

A single, ready-to-send reply email body in the client's language. Plain prose (greeting → body → closing); no markdown headings, no emoji, no subject line (the subject is set from the thread).

- Answer only with information that is supported by the client context and the team's work — never invent figures, claims, tracking IDs or commitments.
- The client-facing reply must contain no placeholders and no internal-only sections. Put anything needing internal follow-up or approval under a final `## Interne nota's (niet voor de klant)` section, which is stripped before the reply is held for approval and sent.
- Do not add an AI-disclosure notice. If the client asks whether they are dealing with AI, answer honestly — but do not volunteer it unprompted.
