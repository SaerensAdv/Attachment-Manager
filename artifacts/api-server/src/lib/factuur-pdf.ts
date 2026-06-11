import PDFDocument from "pdfkit";
import { SA_LOGO_WHITE_PNG } from "./report-assets";
import {
  AMBER,
  COVER_SUB,
  FOOTER_GREY,
  HAIR,
  INDIGO,
  INK,
  MARGIN,
  MUTED,
  NEARBLACK,
  PANEL,
  PURPLE,
  WHITE,
  contentWidth,
  drawGlow,
  drawTable,
  eur,
} from "./pdf";
import {
  REVERSE_CHARGE_NOTE,
  SAERENS_SENDER,
  type BtwMode,
  type SaerensSender,
} from "./saerens-billing";

/**
 * Render a branded Saerens factuur (of proforma) PDF. Fully deterministic — a
 * sibling of `snapshot-pdf.ts` that reuses the exact same huisstijl primitives
 * (`./pdf`) and built-in Helvetica (no font embedding). Amounts are passed in
 * centen so 21% btw on an arbitrary fee stays exact.
 *
 * `number === null` renders a PROFORMA (no factuurnummer consumed); a non-null
 * number renders the definitieve factuur.
 */

export interface FactuurRecipient {
  name: string;
  addressLines: string[];
  vatNumber: string | null;
  country: string | null;
}

export interface FactuurPdfData {
  /** Factuurnummer, bv. "2026-001". `null` => proforma. */
  number: string | null;
  issuedDateLabel: string;
  dueDateLabel: string;
  periodLabel: string | null;
  recipient: FactuurRecipient;
  lineLabel: string;
  subtotalCents: number;
  vatRateBp: number;
  vatCents: number;
  totalCents: number;
  btwMode: BtwMode;
  /** Defaults to the configured Saerens identity; override for re-print fidelity. */
  sender?: SaerensSender;
}

const eurc = (cents: number): string => eur(cents / 100, "EUR", 2);

/** Draw a labelled party block (Van / Aan); returns the y after the last line. */
function drawParty(
  doc: PDFKit.PDFDocument,
  opts: {
    title: string;
    name: string;
    lines: string[];
    x: number;
    y: number;
    width: number;
  },
): number {
  const { title, name, lines, x, y, width } = opts;
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(MUTED)
    .text(title.toUpperCase(), x, y, { width, characterSpacing: 1.5 });
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(INK)
    .text(name, x, doc.y + 4, { width });
  doc.font("Helvetica").fontSize(9.5).fillColor(INK);
  for (const ln of lines) {
    if (!ln) continue;
    doc.text(ln, x, doc.y + 1, { width });
  }
  return doc.y;
}

export function renderFactuurPdf(data: FactuurPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const sender = data.sender ?? SAERENS_SENDER;
    const isProforma = !data.number;
    const doc = new PDFDocument({
      size: "A4",
      margins: { ...MARGIN },
      bufferPages: true,
      info: {
        Title: `${isProforma ? "Proforma" : "Factuur"} ${
          data.number ?? ""
        } — ${data.recipient.name}`.trim(),
        Author: sender.legalName,
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width;
    const H = doc.page.height;
    const x = MARGIN.left;
    const cw = contentWidth(doc);
    const HEADER_H = 150;

    // --- Dark header band ---
    doc.save();
    doc.rect(0, 0, W, HEADER_H).fill(NEARBLACK);
    doc.restore();
    doc.save();
    doc.rect(0, 0, W, HEADER_H).clip();
    drawGlow(doc, W, HEADER_H, W - 24, 18, 260, PURPLE, 0.26);
    drawGlow(doc, W, HEADER_H, 18, HEADER_H - 6, 220, INDIGO, 0.5);
    doc.restore();

    try {
      doc.image(SA_LOGO_WHITE_PNG, x, 38, { width: 34 });
    } catch {
      /* logo is best-effort */
    }
    doc
      .font("Helvetica-Bold")
      .fontSize(10.5)
      .fillColor(WHITE)
      .text("SAERENS ADVERTISING", x + 46, 50, {
        characterSpacing: 2,
        lineBreak: false,
      });

    doc
      .font("Helvetica-Bold")
      .fontSize(26)
      .fillColor(WHITE)
      .text(isProforma ? "PROFORMA" : "FACTUUR", x, 92, { lineBreak: false });

    // Number + dates, right-aligned inside the band.
    const rightW = 230;
    const rx = W - MARGIN.right - rightW;
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(COVER_SUB)
      .text(isProforma ? "PROFORMA — geen factuurnummer" : "Factuurnummer", rx, 90, {
        width: rightW,
        align: "right",
        lineBreak: false,
        characterSpacing: 0.5,
      });
    doc
      .font("Helvetica-Bold")
      .fontSize(15)
      .fillColor(AMBER)
      .text(data.number ?? "—", rx, 102, {
        width: rightW,
        align: "right",
        lineBreak: false,
      });
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(COVER_SUB)
      .text(
        `Factuurdatum ${data.issuedDateLabel}   ·   Vervaldatum ${data.dueDateLabel}`,
        rx,
        124,
        { width: rightW, align: "right", lineBreak: false },
      );

    // --- Parties: Van (Saerens) left, Aan (klant) right ---
    const gap = 28;
    const colW = (cw - gap) / 2;
    const partiesY = HEADER_H + 30;
    const senderLines = [
      sender.legalForm,
      ...sender.addressLines,
      `BTW ${sender.vatNumber}`,
      sender.email,
    ];
    const recipientLines = [
      ...data.recipient.addressLines,
      data.recipient.country ?? "",
      data.recipient.vatNumber ? `BTW ${data.recipient.vatNumber}` : "",
    ];
    const yLeft = drawParty(doc, {
      title: "Van",
      name: sender.legalName,
      lines: senderLines,
      x,
      y: partiesY,
      width: colW,
    });
    const yRight = drawParty(doc, {
      title: "Factuur aan",
      name: data.recipient.name,
      lines: recipientLines,
      x: x + colW + gap,
      y: partiesY,
      width: colW,
    });

    // --- Optional period line ---
    let y = Math.max(yLeft, yRight) + 22;
    if (data.periodLabel) {
      doc
        .font("Helvetica")
        .fontSize(9.5)
        .fillColor(MUTED)
        .text(`Periode: ${data.periodLabel}`, x, y, { width: cw });
      y = doc.y + 8;
    }

    // --- Line items table ---
    doc.x = x;
    doc.y = y;
    drawTable(doc, [
      ["Omschrijving", "Bedrag"],
      [data.lineLabel, eurc(data.subtotalCents)],
    ]);

    // --- Totals block (right-aligned) ---
    const tw = 260;
    const tx = W - MARGIN.right - tw;
    const labelW = tw * 0.56;
    const valX = tx + labelW;
    const valW = tw - labelW;
    let ty = doc.y + 8;
    const totalRow = (
      label: string,
      value: string,
      o?: { big?: boolean },
    ): void => {
      doc
        .font(o?.big ? "Helvetica-Bold" : "Helvetica")
        .fontSize(o?.big ? 11.5 : 10)
        .fillColor(o?.big ? INK : MUTED)
        .text(label, tx, ty, { width: labelW, lineBreak: false });
      doc
        .font("Helvetica-Bold")
        .fontSize(o?.big ? 13 : 10.5)
        .fillColor(o?.big ? INDIGO : INK)
        .text(value, valX, ty - (o?.big ? 1 : 0), {
          width: valW,
          align: "right",
          lineBreak: false,
        });
      ty += o?.big ? 24 : 17;
    };
    totalRow("Subtotaal (excl. btw)", eurc(data.subtotalCents));
    if (data.btwMode === "verlegd") {
      totalRow("Btw (verlegd)", eurc(0));
    } else {
      totalRow(
        `Btw (${(data.vatRateBp / 100).toLocaleString("nl-BE")}%)`,
        eurc(data.vatCents),
      );
    }
    // Divider above the grand total.
    doc
      .moveTo(tx, ty)
      .lineTo(tx + tw, ty)
      .lineWidth(0.75)
      .strokeColor(HAIR)
      .stroke();
    ty += 6;
    totalRow("Totaal te betalen", eurc(data.totalCents), { big: true });

    // --- Reverse-charge mention (verlegd) ---
    let belowY = ty + 6;
    if (data.btwMode === "verlegd") {
      doc
        .font("Helvetica-Oblique")
        .fontSize(9)
        .fillColor(MUTED)
        .text(REVERSE_CHARGE_NOTE, x, belowY, { width: cw * 0.62 });
      belowY = Math.max(belowY, doc.y);
    }

    // --- Payment panel ---
    const panelY = belowY + 18;
    const panelH = 92;
    doc.save();
    doc.roundedRect(x, panelY, cw, panelH, 7).fill(PANEL);
    doc.rect(x, panelY, 4, panelH).fill(PURPLE);
    doc.restore();
    const pPadX = 18;
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(MUTED)
      .text("BETAALGEGEVENS", x + pPadX, panelY + 14, {
        characterSpacing: 1.5,
        lineBreak: false,
      });
    const pCol2 = x + cw / 2;
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(INK)
      .text(`IBAN  ${sender.iban}`, x + pPadX, panelY + 32, {
        width: cw / 2 - pPadX,
      });
    doc.text(
      `Mededeling  ${isProforma ? "(proforma)" : data.number}`,
      x + pPadX,
      panelY + 50,
      { width: cw / 2 - pPadX },
    );
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(INK)
      .text(`Vervaldatum  ${data.dueDateLabel}`, pCol2, panelY + 32, {
        width: cw / 2 - pPadX,
      });
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(INDIGO)
      .text(`Te betalen  ${eurc(data.totalCents)}`, pCol2, panelY + 50, {
        width: cw / 2 - pPadX,
      });
    if (isProforma) {
      doc
        .font("Helvetica-Oblique")
        .fontSize(8.5)
        .fillColor(AMBER)
        .text(
          "Dit is een proforma en is geen geldige factuur.",
          x + pPadX,
          panelY + panelH - 18,
          { width: cw - pPadX * 2, lineBreak: false },
        );
    }

    // --- Footer: legal line + accent bar ---
    doc.page.margins.bottom = 0;
    const fy = H - 50;
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(FOOTER_GREY)
      .text(
        `${sender.legalName} · ${sender.legalForm} · BTW ${sender.vatNumber} · IBAN ${sender.iban}`,
        x,
        fy,
        { width: cw, align: "center", lineBreak: false },
      );

    const bar = doc.linearGradient(0, 0, W, 0);
    bar.stop(0, PURPLE);
    bar.stop(0.62, PURPLE);
    bar.stop(1, AMBER);
    doc.save();
    doc.rect(0, H - 6, W, 6).fill(bar);
    doc.restore();

    doc.end();
  });
}
