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
  PURPLE,
  WHITE,
  contentWidth,
  drawGlow,
  drawTable,
  eur,
  renderMarkdown,
} from "./pdf";
import { SAERENS_SENDER, type SaerensSender } from "./saerens-billing";

/**
 * Render a branded Saerens *offerte* (sales proposal) PDF. A hybrid deliverable:
 * the prose body is AI-drafted (passed in already client-facing — internal notes
 * and [AAN TE VULLEN] placeholders stripped by the caller) and the pricing is
 * human-supplied. Fully deterministic rendering — a sibling of `factuur-pdf.ts`
 * that reuses the exact same huisstijl primitives (`./pdf`) and built-in
 * Helvetica (no font embedding). Amounts are passed in centen for exactness.
 *
 * An offerte is non-binding: no factuurnummer, no DB row, no VAT math — only a
 * clear "excl. btw" note plus an optional reverse-charge mention.
 */

export type OfferteRecurrence = "eenmalig" | "maandelijks";

export interface OfferteLine {
  label: string;
  amountCents: number;
  recurrence: OfferteRecurrence;
}

export interface OfferteRecipient {
  name: string;
  addressLines: string[];
  vatNumber: string | null;
  country: string | null;
}

export interface OffertePdfData {
  recipient: OfferteRecipient;
  dateLabel: string;
  validUntilLabel: string;
  /** Client-facing prose (already stripped of internal notes/placeholders). */
  proseMarkdown: string;
  lines: OfferteLine[];
  /** Optional reverse-charge / btw mention, printed under the pricing. */
  btwNote?: string | null;
  /** Defaults to the configured Saerens identity. */
  sender?: SaerensSender;
}

const RECURRENCE_LABEL: Record<OfferteRecurrence, string> = {
  eenmalig: "Eenmalig",
  maandelijks: "Per maand",
};

const NO_GUARANTEE_NOTE =
  "Saerens werkt transparant en realistisch: we beloven geen gegarandeerde resultaten. Deze offerte is vrijblijvend en vormt geen factuur.";

const eurc = (cents: number): string => eur(cents / 100, "EUR", 2);

/** Draw a labelled party block (Van / Voor); returns the y after the last line. */
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

export function renderOffertePdf(data: OffertePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const sender = data.sender ?? SAERENS_SENDER;
    const doc = new PDFDocument({
      size: "A4",
      margins: { ...MARGIN },
      bufferPages: true,
      info: {
        Title: `Offerte — ${data.recipient.name}`.trim(),
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
      .text("OFFERTE", x, 92, { lineBreak: false });

    // Vrijblijvend label + dates, right-aligned inside the band.
    const rightW = 240;
    const rx = W - MARGIN.right - rightW;
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(COVER_SUB)
      .text("VRIJBLIJVEND VOORSTEL", rx, 96, {
        width: rightW,
        align: "right",
        lineBreak: false,
        characterSpacing: 0.5,
      });
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(COVER_SUB)
      .text(
        `Datum ${data.dateLabel}   ·   Geldig tot ${data.validUntilLabel}`,
        rx,
        118,
        { width: rightW, align: "right", lineBreak: false },
      );

    // --- Parties: Van (Saerens) left, Voor (klant) right ---
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
      title: "Voor",
      name: data.recipient.name,
      lines: recipientLines,
      x: x + colW + gap,
      y: partiesY,
      width: colW,
    });

    // --- Prose body (AI-drafted, already client-facing) ---
    let y = Math.max(yLeft, yRight) + 26;
    const prose = data.proseMarkdown.trim();
    if (prose) {
      doc.x = x;
      doc.y = y;
      renderMarkdown(doc, prose);
      doc.moveDown(0.5);
      y = doc.y;
    }

    // --- Pricing table ---
    doc.x = x;
    doc.y = y + 4;
    doc
      .font("Helvetica-Bold")
      .fontSize(13.5)
      .fillColor(INDIGO)
      .text("Investering", x, doc.y, { width: cw });
    {
      const ly = doc.y + 2;
      doc
        .moveTo(x, ly)
        .lineTo(x + 44, ly)
        .lineWidth(2.5)
        .strokeColor(PURPLE)
        .stroke();
    }
    doc.moveDown(0.5);
    doc.x = x;

    const tableRows: string[][] = [["Omschrijving", "Type", "Bedrag"]];
    for (const ln of data.lines) {
      tableRows.push([
        ln.label,
        RECURRENCE_LABEL[ln.recurrence],
        eurc(ln.amountCents),
      ]);
    }
    drawTable(doc, tableRows);

    // --- Totals block (right-aligned): one-off and recurring kept separate ---
    const oneOff = data.lines
      .filter((l) => l.recurrence === "eenmalig")
      .reduce((a, l) => a + l.amountCents, 0);
    const monthly = data.lines
      .filter((l) => l.recurrence === "maandelijks")
      .reduce((a, l) => a + l.amountCents, 0);

    const tw = 280;
    const tx = W - MARGIN.right - tw;
    const labelW = tw * 0.58;
    const valX = tx + labelW;
    const valW = tw - labelW;
    // Hou de totalen + notities bijeen: forceer een nieuwe pagina als er te
    // weinig ruimte rest onder de prijstabel, anders lopen ze in de footer.
    if (doc.y > H - MARGIN.bottom - 90) doc.addPage();
    let ty = doc.y + 8;
    const totalRow = (label: string, value: string): void => {
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(INK)
        .text(label, tx, ty, { width: labelW, lineBreak: false });
      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor(INDIGO)
        .text(value, valX, ty - 1, {
          width: valW,
          align: "right",
          lineBreak: false,
        });
      ty += 22;
    };
    if (oneOff > 0) totalRow("Eenmalig (excl. btw)", eurc(oneOff));
    if (monthly > 0) totalRow("Per maand (excl. btw)", `${eurc(monthly)}`);

    // --- Notes: btw + no-guarantee/validity ---
    let belowY = ty + 8;
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text("Alle bedragen zijn exclusief btw.", x, belowY, { width: cw });
    belowY = doc.y + 2;
    if (data.btwNote) {
      doc
        .font("Helvetica-Oblique")
        .fontSize(9)
        .fillColor(MUTED)
        .text(data.btwNote, x, belowY, { width: cw * 0.7 });
      belowY = doc.y + 2;
    }
    doc
      .font("Helvetica-Oblique")
      .fontSize(9)
      .fillColor(MUTED)
      .text(
        `${NO_GUARANTEE_NOTE} Geldig tot ${data.validUntilLabel}.`,
        x,
        belowY + 4,
        { width: cw },
      );

    // --- Footer on every page: legal line + accent bar ---
    doc.page.margins.bottom = 0;
    const range = doc.bufferedPageRange();
    for (let p = range.start; p < range.start + range.count; p++) {
      doc.switchToPage(p);
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
    }

    doc.end();
  });
}
