---
name: Factuur (invoice) PDF deliverable
description: Deterministic invoicing — gapless numbering, frozen snapshot, proforma vs issue, VAT/verlegd, LPAD trap.
---

Deterministic (no-LLM) invoice feature for the Saerens agency app.

**Gapless numbering**: invoice number = `year + seq`, sequence per year. Issue via a single
`INSERT ... SELECT` with a `WITH next` CTE computing `MAX(seq)+1` for that year. Unique index
on `(year, seq)`. Retry on 23505 (check both `err.code` and `err.cause.code`, node-postgres) a
few times for concurrent READ COMMITTED races. Gaplessness holds because a row is created only on
successful insert.

**LPAD display trap**: `LPAD(seq::text, 3, '0')` TRUNCATES at seq ≥ 1000 ("2026-1000"→"2026-100",
colliding with seq 100's display string). Uniqueness is on (year, seq) not on the string, so the
collision is display-only — still wrong. Use `LPAD(next.seq::text, GREATEST(3, length(next.seq::text)), '0')`.

**Frozen snapshot = immutability**: at issue time, freeze recipient (name/address/vat/country),
amounts (cents), btwMode, periodLabel, and a sender_snapshot JSON into the row. The reprint route
reads EVERYTHING from the stored row — never recompute from the current client/fee. If PDF render
fails after the row is committed, the row still exists so reprint recovers (no number gap).

**Proforma never writes**: the preview route renders a PDF with `number=null` and inserts no row.
Verify empirically (invoices table stays at 0 rows after preview testing).

**VAT math**: fee stored in WHOLE EUROS. `subtotalCents = fee*100`, `vatCents = round(subtotalCents*vatRateBp/10000)`.
`btw_21` → vatRateBp 2100; `verlegd` → 0 and print the art. 196 Richtlijn 2006/112/EG note. `verlegd`
requires the client's VAT number (block otherwise). Auto-derive when btwMode empty: BE-prefixed VAT → btw_21,
else verlegd; explicit btwMode always wins. (Caveat: no-VAT + no-mode defaults to verlegd — B2C needs an explicit mode.)

**Sender data**: IBAN/VAT/address live ONLY in `saerens-billing.ts` (agency's own public invoicing details,
code-config by design) plus the frozen per-row snapshot. Never persist beyond the snapshot.

**Belgian context**: B2B Peppol e-invoice mandate since 1 Jan 2026 → this PDF is a courtesy/leesbare copy,
surfaced as a caveat in the UI and on the PDF; not a replacement for the Peppol e-invoice.

**effectiveFee precedence**: client-fiche fee overrides the group fee (both server `resolveFeeEuros` and the
UI must agree). UI gates the buttons on unsaved form state; server validates the persisted row and returns a
clear "bewaar eerst" 400 if you act before saving — acceptable by design.
