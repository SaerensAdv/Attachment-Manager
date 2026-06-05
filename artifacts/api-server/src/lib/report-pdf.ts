import PDFDocument from "pdfkit";

/**
 * Render a client report (markdown) into a branded PDF buffer.
 *
 * This is deliberately a small, dependency-light markdown renderer — pdfkit
 * draws the text directly, so there is no Chromium/headless-browser dependency.
 * It handles the subset of markdown the agent team actually produces: H1–H3
 * headings, bullet lists, paragraphs, bold (`**`) inline spans, horizontal
 * rules, and blank-line spacing. Anything it doesn't recognise is printed as a
 * plain paragraph, so the report is never lost.
 */

const INK = "#1a1a1a";
const MUTED = "#6b6b6b";
const ACCENT = "#3b3a8c"; // indigo, matching the app's Newsroom theme
const RULE = "#d8d4c8";

export interface ReportPdfMeta {
  clientName: string;
  /** e.g. "Maandrapport — vorige maand" */
  subtitle: string;
  /** Generation date, already formatted for display. */
  dateLabel: string;
}

/** Strip inline markdown that we don't render as rich text. */
function cleanInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
}

/** Split a line into bold / non-bold spans for `**bold**` rendering. */
function boldSpans(text: string): { text: string; bold: boolean }[] {
  const spans: { text: string; bold: boolean }[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      spans.push({ text: text.slice(last, m.index), bold: false });
    }
    spans.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) spans.push({ text: text.slice(last), bold: false });
  return spans.length > 0 ? spans : [{ text, bold: false }];
}

function writeRichLine(
  doc: PDFKit.PDFDocument,
  text: string,
  opts: { size: number; indent?: number } = { size: 10.5 },
): void {
  const spans = boldSpans(cleanInline(text));
  const indent = opts.indent ?? 0;
  if (indent) doc.text("", doc.page.margins.left + indent, doc.y, { continued: false });
  spans.forEach((span, i) => {
    doc
      .font(span.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(opts.size)
      .fillColor(INK)
      .text(span.text, {
        continued: i < spans.length - 1,
        indent,
      });
  });
}

export function renderReportPdf(
  markdown: string,
  meta: ReportPdfMeta,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 64, bottom: 64, left: 64, right: 64 },
      info: {
        Title: `${meta.clientName} — ${meta.subtitle}`,
        Author: "Saerens Advertising",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // --- Header band ---
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(ACCENT)
      .text("SAERENS ADVERTISING", { characterSpacing: 2 });
    doc.moveDown(0.4);
    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .fillColor(INK)
      .text(meta.clientName);
    doc
      .font("Helvetica")
      .fontSize(12)
      .fillColor(MUTED)
      .text(meta.subtitle);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text(meta.dateLabel);
    doc.moveDown(0.6);
    const ruleY = doc.y;
    doc
      .moveTo(doc.page.margins.left, ruleY)
      .lineTo(doc.page.width - doc.page.margins.right, ruleY)
      .strokeColor(RULE)
      .lineWidth(1)
      .stroke();
    doc.moveDown(0.8);

    // --- Body ---
    const lines = markdown.replace(/\r\n/g, "\n").split("\n");
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, "");
      if (line.trim() === "") {
        doc.moveDown(0.5);
        continue;
      }

      // Horizontal rule
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
        const y = doc.y + 2;
        doc
          .moveTo(doc.page.margins.left, y)
          .lineTo(doc.page.width - doc.page.margins.right, y)
          .strokeColor(RULE)
          .lineWidth(0.75)
          .stroke();
        doc.moveDown(0.6);
        continue;
      }

      const h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) {
        const level = h[1].length;
        const size = level === 1 ? 16 : level === 2 ? 13 : 11.5;
        doc.moveDown(level <= 2 ? 0.4 : 0.2);
        doc
          .font("Helvetica-Bold")
          .fontSize(size)
          .fillColor(level === 1 ? ACCENT : INK)
          .text(cleanInline(h[2]));
        doc.moveDown(0.2);
        continue;
      }

      const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
      if (bullet) {
        const x = doc.page.margins.left;
        const y = doc.y;
        doc.font("Helvetica").fontSize(10.5).fillColor(ACCENT).text("•", x, y, {
          continued: false,
          width: 12,
        });
        doc.y = y;
        writeRichLine(doc, bullet[1], { size: 10.5, indent: 12 });
        continue;
      }

      const numbered = /^\s*(\d+)\.\s+(.*)$/.exec(line);
      if (numbered) {
        const x = doc.page.margins.left;
        const y = doc.y;
        doc
          .font("Helvetica-Bold")
          .fontSize(10.5)
          .fillColor(ACCENT)
          .text(`${numbered[1]}.`, x, y, { continued: false, width: 18 });
        doc.y = y;
        writeRichLine(doc, numbered[2], { size: 10.5, indent: 18 });
        continue;
      }

      writeRichLine(doc, line, { size: 10.5 });
    }

    doc.end();
  });
}
