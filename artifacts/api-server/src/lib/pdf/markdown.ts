import { HAIR, INDIGO, INK, MARGIN, PURPLE } from "./theme";
import { cleanInline, contentWidth, ensureSpace, writeRichLine } from "./core";
import { drawTable, splitRow } from "./table";

/**
 * Render a markdown subset to the document body: H1–H6, bullets, numbered lists,
 * **bold**, blank lines, horizontal rules, and GitHub-style pipe tables.
 * Anything unrecognised is printed as a paragraph, so content is never lost.
 */
export function renderMarkdown(doc: PDFKit.PDFDocument, markdown: string): void {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/\s+$/, "");
    const line = raw;
    doc.x = MARGIN.left;

    // Table block: a run of pipe rows.
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const block: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        block.push(splitRow(lines[i]));
        i++;
      }
      i--;
      drawTable(doc, block);
      continue;
    }

    if (line.trim() === "") {
      doc.moveDown(0.45);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      ensureSpace(doc, 16);
      const y = doc.y + 2;
      doc
        .moveTo(MARGIN.left, y)
        .lineTo(doc.page.width - MARGIN.right, y)
        .lineWidth(0.75)
        .strokeColor(HAIR)
        .stroke();
      doc.moveDown(0.6);
      continue;
    }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const size = level === 1 ? 17 : level === 2 ? 13.5 : 11.5;
      ensureSpace(doc, size + 18);
      doc.x = MARGIN.left;
      doc.moveDown(level <= 2 ? 0.45 : 0.25);
      doc
        .font("Helvetica-Bold")
        .fontSize(size)
        .fillColor(level <= 2 ? INDIGO : INK)
        .text(cleanInline(h[2]), MARGIN.left, doc.y, { width: contentWidth(doc) });
      if (level <= 2) {
        const y = doc.y + 2;
        doc
          .moveTo(MARGIN.left, y)
          .lineTo(MARGIN.left + 44, y)
          .lineWidth(2.5)
          .strokeColor(PURPLE)
          .stroke();
      }
      doc.moveDown(0.35);
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      ensureSpace(doc, 16);
      const x = MARGIN.left;
      const y = doc.y;
      doc.font("Helvetica").fontSize(10.5).fillColor(PURPLE).text("•", x, y, {
        lineBreak: false,
        width: 12,
      });
      doc.y = y;
      writeRichLine(doc, bullet[1], { size: 10.5, indent: 14 });
      continue;
    }

    const numbered = /^\s*(\d+)\.\s+(.*)$/.exec(line);
    if (numbered) {
      ensureSpace(doc, 16);
      const x = MARGIN.left;
      const y = doc.y;
      doc
        .font("Helvetica-Bold")
        .fontSize(10.5)
        .fillColor(PURPLE)
        .text(`${numbered[1]}.`, x, y, { lineBreak: false, width: 18 });
      doc.y = y;
      writeRichLine(doc, numbered[2], { size: 10.5, indent: 20 });
      continue;
    }

    ensureSpace(doc, 16);
    writeRichLine(doc, line, { size: 10.5 });
  }
}
