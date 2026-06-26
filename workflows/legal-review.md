# Workflow: Legal & Contracts Review

## Goal

Draft or review a client-facing legal or compliance document — a service agreement/retainer, statement of work (SOW), NDA, GDPR data-processing agreement (DPA), or privacy/consent wording — in plain, fair language, with risks clearly flagged. This is **not** legal advice: a qualified human (and, where needed, a lawyer) approves before use.

## When to use

A client or the agency needs a contract, retainer, SOW, NDA, or DPA drafted or reviewed, or privacy/consent wording checked (e.g. for a tracking setup or lead form). (For conversion-tracking integrity itself, use `workflows/measurement-audit.md` or `workflows/tracking-setup.md`.)

## Steps

1. Review the client context and the document's purpose (`clients/<client>.md`): the parties, the scope, and what must be protected.
2. Confirm the document type and the key terms that are actually agreed (scope, fees/term, responsibilities, data handling) — never invent commercial terms.
3. Draft or review against the agreed terms and `knowledge/agency-foundations.md` (honesty, transparency, no overpromising); keep the language plain and fair to both sides.
4. For anything touching personal data, check GDPR basics: lawful basis, data processed, retention, sub-processors, and consent wording.
5. Identify and clearly flag risks, gaps, and anything that needs a qualified human or lawyer to decide — do not paper over uncertainty.
6. Prepare the human approval summary; state explicitly that this is a draft for review, not legal advice.

## Agents involved

- Orchestrator Agent (routes and briefs)
- Legal & Contracts Specialist (lead — drafting and review)
- Client Success Agent (client context and relationship sensitivities, where relevant)

## Required output

Follow `templates/task-output.md`. Must include:

- Document purpose and parties
- Key agreed terms used (scope, fees/term, responsibilities, data handling)
- The draft or reviewed document (plain, fair language)
- Risks, gaps, and open questions flagged for a human/lawyer
- Data-protection notes (where personal data is involved)
- Human approval required — this is a draft for review, not legal advice
