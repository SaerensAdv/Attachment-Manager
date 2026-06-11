import { AMBER, INK, MARGIN, PANEL, PURPLE } from "./theme";
import { contentWidth, ensureSpace } from "./core";

/** A horizontal bar chart. The first (largest) row is amber, the rest purple. */
export function hbarChart(
  doc: PDFKit.PDFDocument,
  items: { label: string; value: number; display: string }[],
): void {
  if (items.length === 0) return;
  const rowH = 26;
  const labelW = 150;
  const valueW = 78;
  const chartX = MARGIN.left;
  const barAreaX = chartX + labelW;
  const barMaxW = contentWidth(doc) - labelW - valueW;
  const max = Math.max(...items.map((it) => it.value), 1);

  ensureSpace(doc, rowH * items.length + 8);

  items.forEach((it, i) => {
    const y = doc.y;
    const barW = Math.max(2, (it.value / max) * barMaxW);
    const color = i === 0 ? AMBER : PURPLE;
    // label
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(INK)
      .text(it.label, chartX, y + 4, {
        width: labelW - 10,
        ellipsis: true,
        lineBreak: false,
      });
    // track + bar
    doc.save();
    doc.roundedRect(barAreaX, y + 2, barMaxW, 14, 3).fill(PANEL);
    doc.roundedRect(barAreaX, y + 2, barW, 14, 3).fill(color);
    doc.restore();
    // value
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(INK)
      .text(it.display, barAreaX + barMaxW + 8, y + 4, {
        width: valueW - 8,
        align: "right",
        lineBreak: false,
      });
    doc.y = y + rowH;
  });
  doc.x = MARGIN.left;
  doc.moveDown(0.4);
}
