import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  clientsTable,
  clientGroupsTable,
  invoicesTable,
  type Client,
} from "@workspace/db";
import {
  renderFactuurPdf,
  type FactuurRecipient,
} from "../lib/factuur-pdf";
import {
  renderOffertePdf,
  type OfferteLine,
  type OfferteRecurrence,
} from "../lib/offerte-pdf";
import { toClientFacingReport } from "../lib/generate-engine";
import {
  SAERENS_SENDER,
  STANDARD_VAT_RATE_BP,
  DEFAULT_PAYMENT_TERM_DAYS,
  REVERSE_CHARGE_NOTE,
  asBtwMode,
  defaultBtwMode,
} from "../lib/saerens-billing";
import { parseId } from "./clients-shared";

const router: IRouter = Router();

// --- Facturatie -----------------------------------------------------------
// Deterministische factuur/proforma uit het klantdossier. Geen LLM. De
// proforma-preview verbruikt geen nummer; pas bij het uitgeven (POST) wordt
// een rij aangemaakt met sluitende per-jaar nummering.

const DEFAULT_LINE_LABEL = "Beheer Google Ads — maandelijkse vergoeding";

/** nl-BE datum, geanker op Europe/Brussels. */
function brusselsDateLabel(d: Date): string {
  return new Intl.DateTimeFormat("nl-BE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Brussels",
  }).format(d);
}

/** nl-BE maand + jaar (bv. "juni 2026"), geanker op Europe/Brussels. */
function brusselsMonthLabel(d: Date): string {
  return new Intl.DateTimeFormat("nl-BE", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Brussels",
  }).format(d);
}

/** Kalenderjaar in Europe/Brussels (factuurnummering loopt per jaar). */
function brusselsYear(d: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      timeZone: "Europe/Brussels",
    }).format(d),
  );
}

/** Resolveer de factureerbare maandfee (klant-fiche ?? groep), in hele euro. */
async function resolveFeeEuros(row: Client): Promise<number | null> {
  if (row.monthlyFee != null) return row.monthlyFee;
  if (row.groupId != null) {
    const [group] = await db
      .select()
      .from(clientGroupsTable)
      .where(eq(clientGroupsTable.id, row.groupId));
    if (group?.monthlyFee != null) return group.monthlyFee;
  }
  return null;
}

/** Verplichte facturatievelden controleren; geeft een NL-melding of null. */
function checkBilling(row: Client): string | null {
  if (!row.billingAddress?.trim()) {
    return "Vul eerst het facturatieadres in bij Facturatie en bewaar.";
  }
  const btwMode = asBtwMode(row.btwMode, defaultBtwMode(row.vatNumber));
  if (btwMode === "verlegd" && !row.vatNumber?.trim()) {
    return "Voor verlegde btw is het btw-nummer van de klant verplicht. Vul het in bij Facturatie en bewaar.";
  }
  return null;
}

/** Reken bedragen + ontvanger uit voor één factuurregel (de maandfee). */
function computeFactuur(
  row: Client,
  feeEuros: number,
  opts: { lineLabel?: string | null; period?: string | null },
) {
  const issuedAt = new Date();
  const dueDate = new Date(
    issuedAt.getTime() + DEFAULT_PAYMENT_TERM_DAYS * 86_400_000,
  );
  const btwMode = asBtwMode(row.btwMode, defaultBtwMode(row.vatNumber));
  const subtotalCents = Math.round(feeEuros * 100);
  const vatRateBp = btwMode === "verlegd" ? 0 : STANDARD_VAT_RATE_BP;
  const vatCents = Math.round((subtotalCents * vatRateBp) / 10_000);
  const totalCents = subtotalCents + vatCents;
  const recipient: FactuurRecipient = {
    name: row.billingName?.trim() || row.name,
    addressLines: (row.billingAddress ?? "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean),
    vatNumber: row.vatNumber?.trim() || null,
    country: row.billingCountry?.trim() || null,
  };
  return {
    recipient,
    lineLabel: opts.lineLabel?.trim() || DEFAULT_LINE_LABEL,
    periodLabel: opts.period?.trim() || brusselsMonthLabel(issuedAt),
    subtotalCents,
    vatRateBp,
    vatCents,
    totalCents,
    btwMode,
    issuedAt,
    dueDate,
    issuedDateLabel: brusselsDateLabel(issuedAt),
    dueDateLabel: brusselsDateLabel(dueDate),
  };
}

function isUniqueViolation(err: unknown): boolean {
  const code =
    (err as { code?: string })?.code ??
    (err as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

/** Slug uit een naam voor de bestandsnaam van de download. */
function nameSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "klant"
  );
}

/**
 * Geef atomair een factuur uit: bereken het volgende per-jaar volgnummer en
 * insert in één query (geen gat/duplicaat bij gelijktijdige uitgifte). Bij een
 * unieke-constraint-botsing opnieuw proberen.
 */
async function issueInvoice(input: {
  year: number;
  clientId: number;
  issuedAt: Date;
  dueDate: Date;
  periodLabel: string;
  recipientName: string;
  recipientAddress: string | null;
  recipientVatNumber: string | null;
  recipientCountry: string | null;
  btwMode: string;
  lineLabel: string;
  subtotalCents: number;
  vatRateBp: number;
  vatCents: number;
  totalCents: number;
  senderSnapshot: string;
}): Promise<{ id: number; number: string }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await db.execute(sql`
        WITH next AS (
          SELECT COALESCE(MAX(seq), 0) + 1 AS seq
          FROM invoices WHERE "year" = ${input.year}
        )
        INSERT INTO invoices
          ("year", seq, "number", client_id, issued_at, due_date, period_label,
           recipient_name, recipient_address, recipient_vat_number,
           recipient_country, btw_mode, line_label, subtotal_cents, vat_rate_bp,
           vat_cents, total_cents, sender_snapshot)
        SELECT
          ${input.year}, next.seq,
          ${input.year}::text || '-' || LPAD(next.seq::text, GREATEST(3, length(next.seq::text)), '0'),
          ${input.clientId}, ${input.issuedAt}, ${input.dueDate},
          ${input.periodLabel}, ${input.recipientName}, ${input.recipientAddress},
          ${input.recipientVatNumber}, ${input.recipientCountry}, ${input.btwMode},
          ${input.lineLabel}, ${input.subtotalCents}, ${input.vatRateBp},
          ${input.vatCents}, ${input.totalCents}, ${input.senderSnapshot}
        FROM next
        RETURNING id, "number";
      `);
      const r = (result.rows ?? [])[0] as
        | { id: number; number: string }
        | undefined;
      if (r) return r;
      throw new Error("Geen rij teruggegeven bij factuur-uitgifte.");
    } catch (err) {
      if (isUniqueViolation(err) && attempt < 3) continue;
      throw err;
    }
  }
  throw new Error("Kon geen uniek factuurnummer toewijzen.");
}

// Proforma-preview: render zonder een nummer te verbruiken.
router.get("/clients/:id/factuur-preview.pdf", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const [row] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Klant niet gevonden." });
    return;
  }
  const feeEuros = await resolveFeeEuros(row);
  if (feeEuros === null) {
    res.status(400).json({
      error:
        "Deze klant heeft nog geen maandelijkse fee (op de klant of de groep). Vul die in en bewaar eerst.",
    });
    return;
  }
  const billingErr = checkBilling(row);
  if (billingErr) {
    res.status(400).json({ error: billingErr });
    return;
  }
  try {
    const c = computeFactuur(row, feeEuros, {
      lineLabel:
        typeof req.query.lineLabel === "string" ? req.query.lineLabel : null,
      period: typeof req.query.period === "string" ? req.query.period : null,
    });
    const pdf = await renderFactuurPdf({ number: null, ...c });
    res.status(200);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(pdf.length));
    res.setHeader(
      "Content-Disposition",
      `inline; filename="proforma-${nameSlug(row.name)}.pdf"`,
    );
    res.end(pdf);
  } catch (err) {
    res.status(502).json({
      error: "Kon de proforma niet opstellen.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

// Factuur uitgeven: maak een rij (sluitende nummering) en render de PDF.
router.post("/clients/:id/invoices", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const [row] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Klant niet gevonden." });
    return;
  }
  const feeEuros = await resolveFeeEuros(row);
  if (feeEuros === null) {
    res.status(400).json({
      error:
        "Deze klant heeft nog geen maandelijkse fee (op de klant of de groep). Vul die in en bewaar eerst.",
    });
    return;
  }
  const billingErr = checkBilling(row);
  if (billingErr) {
    res.status(400).json({ error: billingErr });
    return;
  }
  const body = (req.body ?? {}) as { lineLabel?: unknown; period?: unknown };
  try {
    const c = computeFactuur(row, feeEuros, {
      lineLabel: typeof body.lineLabel === "string" ? body.lineLabel : null,
      period: typeof body.period === "string" ? body.period : null,
    });
    const issued = await issueInvoice({
      year: brusselsYear(c.issuedAt),
      clientId: row.id,
      issuedAt: c.issuedAt,
      dueDate: c.dueDate,
      periodLabel: c.periodLabel,
      recipientName: c.recipient.name,
      recipientAddress: row.billingAddress?.trim() || null,
      recipientVatNumber: c.recipient.vatNumber,
      recipientCountry: c.recipient.country,
      btwMode: c.btwMode,
      lineLabel: c.lineLabel,
      subtotalCents: c.subtotalCents,
      vatRateBp: c.vatRateBp,
      vatCents: c.vatCents,
      totalCents: c.totalCents,
      senderSnapshot: JSON.stringify(SAERENS_SENDER),
    });
    const pdf = await renderFactuurPdf({ number: issued.number, ...c });
    res.status(201);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(pdf.length));
    res.setHeader("X-Invoice-Number", issued.number);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="factuur-${issued.number}.pdf"`,
    );
    res.end(pdf);
  } catch (err) {
    res.status(502).json({
      error: "Kon de factuur niet uitgeven.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

// Herdruk van een uitgegeven factuur (uit de bevroren snapshot).
router.get("/invoices/:invoiceId/factuur.pdf", async (req, res) => {
  const id = parseId(req.params.invoiceId);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const [inv] = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.id, id));
  if (!inv) {
    res.status(404).json({ error: "Factuur niet gevonden." });
    return;
  }
  let sender: typeof SAERENS_SENDER | undefined;
  try {
    sender = JSON.parse(inv.senderSnapshot) as typeof SAERENS_SENDER;
  } catch {
    sender = undefined;
  }
  try {
    const pdf = await renderFactuurPdf({
      number: inv.number,
      issuedDateLabel: brusselsDateLabel(inv.issuedAt),
      dueDateLabel: brusselsDateLabel(inv.dueDate),
      periodLabel: inv.periodLabel,
      recipient: {
        name: inv.recipientName,
        addressLines: (inv.recipientAddress ?? "")
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean),
        vatNumber: inv.recipientVatNumber,
        country: inv.recipientCountry,
      },
      lineLabel: inv.lineLabel,
      subtotalCents: inv.subtotalCents,
      vatRateBp: inv.vatRateBp,
      vatCents: inv.vatCents,
      totalCents: inv.totalCents,
      btwMode: asBtwMode(inv.btwMode, "btw_21"),
      sender,
    });
    res.status(200);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(pdf.length));
    res.setHeader(
      "Content-Disposition",
      `inline; filename="factuur-${inv.number}.pdf"`,
    );
    res.end(pdf);
  } catch (err) {
    res.status(502).json({
      error: "Kon de factuur niet opnieuw opstellen.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

// --- Offerte -------------------------------------------------------------
// Hybride deliverable: AI-tekst (door de gebruiker aangeleverd vanuit de
// sales-proposal-generatie) + door de mens ingevulde prijzen → branded PDF.
// Deterministische render, geen LLM-aanroep, geen DB-rij — een offerte is
// vrijblijvend en niet-bindend, de gedownloade PDF is het document zelf.

const MAX_OFFERTE_LINES = 25;
const MAX_OFFERTE_PROSE = 50_000;
const OFFERTE_RECURRENCES: OfferteRecurrence[] = ["eenmalig", "maandelijks"];

/** nl-BE datum N dagen vooruit, geanker op Europe/Brussels (geldig-tot). */
function offerteValidUntilLabel(days: number): string {
  return brusselsDateLabel(new Date(Date.now() + days * 86_400_000));
}

/** Valideer en normaliseer één prijsregel uit de request body. */
function parseOfferteLine(raw: unknown): OfferteLine | string {
  if (typeof raw !== "object" || raw === null) return "Ongeldige prijsregel.";
  const o = raw as {
    label?: unknown;
    amountEur?: unknown;
    recurrence?: unknown;
  };
  const label = typeof o.label === "string" ? o.label.trim() : "";
  if (!label) return "Elke prijsregel heeft een omschrijving nodig.";
  const amountEur = typeof o.amountEur === "number" ? o.amountEur : NaN;
  if (!Number.isFinite(amountEur) || amountEur < 0) {
    return `Ongeldig bedrag voor "${label}".`;
  }
  const recurrence = o.recurrence;
  if (!OFFERTE_RECURRENCES.includes(recurrence as OfferteRecurrence)) {
    return `Ongeldig type (eenmalig/maandelijks) voor "${label}".`;
  }
  return {
    label,
    amountCents: Math.round(amountEur * 100),
    recurrence: recurrence as OfferteRecurrence,
  };
}

router.post("/clients/:id/offerte.pdf", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const [row] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Klant niet gevonden." });
    return;
  }

  const body = (req.body ?? {}) as {
    proseMarkdown?: unknown;
    lines?: unknown;
    validUntilLabel?: unknown;
  };

  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    res
      .status(400)
      .json({ error: "Voeg minstens één prijsregel toe aan de offerte." });
    return;
  }
  if (body.lines.length > MAX_OFFERTE_LINES) {
    res.status(400).json({
      error: `Maximaal ${MAX_OFFERTE_LINES} prijsregels per offerte.`,
    });
    return;
  }
  const lines: OfferteLine[] = [];
  for (const raw of body.lines) {
    const parsed = parseOfferteLine(raw);
    if (typeof parsed === "string") {
      res.status(400).json({ error: parsed });
      return;
    }
    lines.push(parsed);
  }

  const rawProse =
    typeof body.proseMarkdown === "string" ? body.proseMarkdown : "";
  if (rawProse.length > MAX_OFFERTE_PROSE) {
    res.status(400).json({
      error: "De voorsteltekst is te lang.",
    });
    return;
  }
  // Veiligheidsnet: strip interne nota's en [AAN TE VULLEN]-placeholders, ook
  // op geplakte tekst, zodat de klant nooit een ruwe draft ziet.
  const proseMarkdown = toClientFacingReport(rawProse);

  const validUntilLabel =
    typeof body.validUntilLabel === "string" && body.validUntilLabel.trim()
      ? body.validUntilLabel.trim()
      : offerteValidUntilLabel(DEFAULT_PAYMENT_TERM_DAYS);

  // Geen facturatie-preconditie: een prospect heeft vaak nog geen adres/fee.
  const btwMode = asBtwMode(row.btwMode, defaultBtwMode(row.vatNumber));
  const recipient = {
    name: row.billingName?.trim() || row.name,
    addressLines: (row.billingAddress ?? "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean),
    vatNumber: row.vatNumber?.trim() || null,
    country: row.billingCountry?.trim() || null,
  };

  try {
    const pdf = await renderOffertePdf({
      recipient,
      dateLabel: brusselsDateLabel(new Date()),
      validUntilLabel,
      proseMarkdown,
      lines,
      btwNote: btwMode === "verlegd" ? REVERSE_CHARGE_NOTE : null,
    });
    res.status(200);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(pdf.length));
    res.setHeader(
      "Content-Disposition",
      `inline; filename="offerte-${nameSlug(row.name)}.pdf"`,
    );
    res.end(pdf);
  } catch (err) {
    res.status(502).json({
      error: "Kon de offerte niet opstellen.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
