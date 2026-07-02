---
name: Gmail inline cid images survive send
description: Why the hand-built MIME names its inline images and tags multipart/related — the rule that makes cid: logos/portraits survive Gmail's send-time rewrite.
---

# Gmail inline `cid:` images: draft renders, delivered mail breaks

**Symptom:** an inline image (`<img src="cid:...">` carried as a MIME part) shows
correctly in the Gmail **draft** view but is a broken/dangling image in the mail
the recipient receives **after send**.

**Why:** Gmail renders the raw MIME you insert verbatim in the draft view, so a
bare `cid:` part works there. On **send**, Gmail re-writes the message and only
re-hosts inline parts it recognises as *named attachments*; an inline part with
no `name`/`filename`, or a `multipart/related` missing the RFC 2387
`type="text/html"` root param, loses the cid linkage and the image goes dangling.
The draft looking fine is NOT proof the sent mail will — the two render paths
differ.

**How to apply (in `buildMime`, email.ts — the single shared builder for BOTH
`sendEmail` and `createGmailDraft`):**
- Every inline image part must carry `Content-Type: <type>; name="<cid>.<ext>"`
  AND `Content-Disposition: inline; filename="<cid>.<ext>"` (keep disposition
  `inline`, not `attachment`, so it stays hidden from the attachment list while
  the HTML references it by cid).
- Both the related-only container and the nested `multipart/related` inside the
  `multipart/mixed` (html+inline+PDF) case must include `type="text/html"`.
- Derive `ext` from the mime subtype but strip it to alphanumerics with a `png`
  fallback (`image/svg+xml` → `svgxml`), and keep the cid sanitized
  (`sanitizeHeaderValue` + strip `<>"`) since it now also feeds a quoted param.

**Verification limit:** unit tests + re-fetching the created draft in
`format=raw` prove the MIME is structurally correct, but only an actual **send**
(e.g. owner sends a test copy to himself) empirically confirms the delivered
rendering. Recommend that as the last check, don't claim it from code alone.
