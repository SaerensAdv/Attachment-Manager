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

**Update — the fix above was NOT enough for the SA logo.** Even a correctly
named `multipart/related; type="text/html"` inline part still lost the logo in
the DELIVERED mail (owner confirmed by real send). The robust fix is to stop
using `cid:` for the fixed brand logo entirely: serve it from a public,
UNAUTHENTICATED HTTPS endpoint (`GET /api/brand/logo.png`, added to
`requireAuth` PUBLIC_PATHS + a `routes/brand.ts` serving `saerensLogoPngBuffer()`
with `image/png` + immutable cache) and reference it as `<img src="https://…">`.
The absolute URL is built from `publicBaseUrl()` (`PUBLIC_BASE_URL` env override
for production, else `https://$REPLIT_DEV_DOMAIN`, else null → render NO logo, not
a broken image). Gmail's image proxy fetches that URL fine after send. All three
email builders (monthly report, SEO report, two-way reply) share `headerLogo` +
`buildBrandedEmail`, so the switch is one change point. Per-agent **portraits**
still ride on `cid:` (harder to host publicly per-agent) and may keep the
after-send limitation.
