import {
  CARD_DARK,
  CARD_LABEL,
  INDIGO,
  INK,
  MARGIN,
  PURPLE,
  WHITE,
} from "./theme";
import { contentWidth, ensureSpace } from "./core";

/** A soft radial colour wash — fakes the deck's blurred glow blobs in pdfkit. */
export function drawGlow(
  doc: PDFKit.PDFDocument,
  W: number,
  H: number,
  cx: number,
  cy: number,
  r: number,
  color: string,
  opacity: number,
): void {
  const g = doc.radialGradient(cx, cy, 0, cx, cy, r);
  g.stop(0, color, opacity);
  g.stop(1, color, 0);
  doc.save();
  doc.rect(0, 0, W, H).fill(g);
  doc.restore();
}

export interface KpiCard {
  label: string;
  value: string;
  /** Accent colour for the card's top rule. */
  accent: string;
}

/** A row of dark KPI cards (each with a coloured top rule), evenly spread across
 * `width`. Used on the report cover and the one-pager snapshot. */
export function kpiCards(
  doc: PDFKit.PDFDocument,
  opts: { x: number; y: number; width: number; cards: KpiCard[] },
): void {
  const { x, y, width, cards } = opts;
  if (cards.length === 0) return;
  const gap = 14;
  const cw = (width - gap * (cards.length - 1)) / cards.length;
  const ch = 96;
  cards.forEach((card, i) => {
    const cx = x + i * (cw + gap);
    doc.save();
    doc.roundedRect(cx, y, cw, ch, 7).fill(CARD_DARK);
    doc.rect(cx, y, cw, 3).fill(card.accent);
    doc.restore();
    doc
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .fillColor(CARD_LABEL)
      .text(card.label, cx + 13, y + 18, {
        characterSpacing: 1.2,
        width: cw - 26,
        lineBreak: false,
      });
    doc
      .font("Helvetica-Bold")
      .fontSize(19)
      .fillColor(WHITE)
      .text(card.value, cx + 13, y + 42, { width: cw - 26, lineBreak: false });
  });
}

/** Section heading: indigo title with a short purple underline. */
export function sectionTitle(doc: PDFKit.PDFDocument, text: string): void {
  ensureSpace(doc, 40);
  doc.x = MARGIN.left;
  doc.moveDown(0.4);
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(INDIGO)
    .text(text, MARGIN.left, doc.y, { width: contentWidth(doc) });
  const y = doc.y + 3;
  doc
    .moveTo(MARGIN.left, y)
    .lineTo(MARGIN.left + 44, y)
    .lineWidth(2.5)
    .strokeColor(PURPLE)
    .stroke();
  doc.moveDown(0.7);
}

/** A lighter, tick-marked label for sub-blocks (e.g. each chart) — avoids
 * stacking two underlined titles in the same section. */
export function chartLabel(doc: PDFKit.PDFDocument, text: string): void {
  ensureSpace(doc, 28);
  doc.x = MARGIN.left;
  doc.moveDown(0.3);
  const y = doc.y;
  doc.save();
  doc.rect(MARGIN.left, y + 1.5, 3, 11).fill(PURPLE);
  doc.restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(INK)
    .text(text, MARGIN.left + 10, y, {
      width: contentWidth(doc) - 10,
      lineBreak: false,
    });
  doc.x = MARGIN.left;
  doc.y = y + 18;
}
