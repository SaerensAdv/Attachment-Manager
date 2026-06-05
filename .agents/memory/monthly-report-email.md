---
name: Monthly report email deliverable
description: How the monthly-reporting workflow turns a team run into a PDF emailed to the client, and the bundling/security constraints that path imposes.
---

# Monthly report email deliverable (`monthly-report-email`)

A workflow can opt into emailing its output as a PDF by carrying the deliverable
marker for kind `monthly-report-email`. When the engine runs such a flow it:
1. At run start, best-effort injects the client's **previous calendar month**
   Google Ads data into the in-memory client DocFile (LAST_MONTH range).
2. Runs the agent team to write the report.
3. After the loop, generates a short Dutch cover email, renders the report
   markdown to a branded PDF, and emails the PDF to the client's `reportEmail`.
4. Records the delivery as an audit step.

**Best-effort by design:** the LAST_MONTH injection and the email send are
best-effort — a missing `googleAdsCustomerId` or a send failure marks the run
`partial` but never loses the team's written report. Do NOT turn this into a hard
precondition without an explicit product decision; the workflow spec chose
best-effort on purpose.

## Bundling gotcha (esbuild)
**Why:** the api-server build is an esbuild bundle, not a watch/tsx run. pdfkit
(and its dep fontkit) read font-metric data files (`data/Helvetica.afm`) by path
at runtime relative to their package dir. Bundling drops those files →
`ENOENT ... Helvetica.afm` only at PDF-render time (the build/typecheck pass).
**How to apply:** keep `pdfkit` and `fontkit` in the `external` list in
`build.mjs` so they resolve from node_modules. (pdfkit→fontkit also needs
`@swc/helpers` available at runtime; it's a direct dep for that reason.)

## Mail-send security
**Why:** the raw RFC 822 MIME is hand-built; an unsanitized `To`/`Subject`/
attachment filename with a CR/LF would allow header/MIME injection (extra
recipients, headers, body parts).
**How to apply:** all header-bearing fields must be stripped of `\r\n`/control
chars before going into a header line, and the recipient must pass a single-
address regex (`assertValidRecipient`). Never interpolate raw model/DB strings
into MIME headers.
