import { HAIR, INDIGO, INK, MARGIN, PANEL, WHITE } from "./theme";
import { cleanInline, contentWidth, ensureSpace, stripEmphasis } from "./core";

/** Split a GitHub-style pipe table row into trimmed, inline-cleaned cells.
 * Emphasis markers are stripped too: cells are drawn as single runs (the header
 * is already bold, body cells plain), so an LLM-authored `**+12%**` delta would
 * otherwise render its asterisks verbatim inside the table. */
export function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => stripEmphasis(cleanInline(c.trim())));
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c.trim()));
}

function isNumericCell(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  return /\d/.test(t) && /^[€$+\-]?[\d.,%\s×x/€$()–-]+$/.test(t);
}

/** Render a parsed pipe table with a dark header, zebra rows and numeric-aware
 * column alignment. Repeats the header when a long table spills to a new page. */
export function drawTable(doc: PDFKit.PDFDocument, rawRows: string[][]): void {
  if (rawRows.length === 0) return;
  const rows = rawRows;
  const header = rows[0];
  let body = rows.slice(1);
  if (body.length > 0 && isSeparatorRow(body[0])) body = body.slice(1);
  const cols = Math.max(header.length, ...body.map((r) => r.length));

  const padX = 7;
  const padY = 5;
  const cw = contentWidth(doc);

  // Column widths weighted by content length (first column gets more room).
  const weights: number[] = [];
  for (let c = 0; c < cols; c++) {
    let maxLen = (header[c] ?? "").length;
    for (const r of body) maxLen = Math.max(maxLen, (r[c] ?? "").length);
    weights.push(Math.min(Math.max(maxLen, 5), 36) * (c === 0 ? 1.5 : 1));
  }
  const totalW = weights.reduce((a, b) => a + b, 0);

  // Every column must be at least wide enough to show its header on one line —
  // otherwise short headers like "Leads" wrap to "Lead\ns". Reserve the header
  // widths first, then distribute the remaining space by the content weights.
  doc.font("Helvetica-Bold").fontSize(9);
  const minWidths = Array.from({ length: cols }, (_, c) =>
    Math.min(doc.widthOfString(header[c] ?? "") + padX * 2 + 2, cw * 0.5),
  );
  const minSum = minWidths.reduce((a, b) => a + b, 0);
  const widths =
    minSum < cw
      ? weights.map((w, c) => minWidths[c] + (w / totalW) * (cw - minSum))
      : weights.map((w) => (w / totalW) * cw);

  const numeric = Array.from({ length: cols }, (_, c) =>
    body.length > 0 ? body.every((r) => !r[c] || isNumericCell(r[c])) : false,
  );

  const measureRow = (cells: string[], bold: boolean): number => {
    let h = 0;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
    for (let c = 0; c < cols; c++) {
      const hh = doc.heightOfString(cells[c] ?? "", { width: widths[c] - padX * 2 });
      h = Math.max(h, hh);
    }
    return h + padY * 2;
  };

  const drawRow = (
    cells: string[],
    opts: { bold: boolean; fill?: string; textColor: string; header?: boolean },
  ): void => {
    const rowH = measureRow(cells, opts.bold);
    if (!opts.header && doc.y + rowH > doc.page.height - MARGIN.bottom) {
      doc.addPage();
      drawRow(header, {
        bold: true,
        fill: INDIGO,
        textColor: WHITE,
        header: true,
      });
    }
    const y = doc.y;
    let x = MARGIN.left;
    if (opts.fill) {
      doc.save();
      doc.rect(MARGIN.left, y, cw, rowH).fill(opts.fill);
      doc.restore();
    }
    for (let c = 0; c < cols; c++) {
      doc
        .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(9)
        .fillColor(opts.textColor)
        .text(cells[c] ?? "", x + padX, y + padY, {
          width: widths[c] - padX * 2,
          align: numeric[c] ? "right" : "left",
        });
      x += widths[c];
    }
    // bottom hairline
    doc
      .moveTo(MARGIN.left, y + rowH)
      .lineTo(MARGIN.left + cw, y + rowH)
      .lineWidth(0.5)
      .strokeColor(HAIR)
      .stroke();
    doc.y = y + rowH;
  };

  ensureSpace(doc, 60);
  drawRow(header, { bold: true, fill: INDIGO, textColor: WHITE, header: true });
  body.forEach((r, i) => {
    drawRow(r, {
      bold: false,
      fill: i % 2 === 1 ? PANEL : undefined,
      textColor: INK,
    });
  });
  doc.moveDown(0.6);
}
