import { INK, MARGIN } from "./theme";

/** Usable content width between the page margins. */
export function contentWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - MARGIN.left - MARGIN.right;
}

/** Break to a new page when the next block would overflow the bottom margin. */
export function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > doc.page.height - MARGIN.bottom) doc.addPage();
}

/** Strip inline markdown we don't render as rich text. */
export function cleanInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
}

/** Split a line into bold / non-bold spans for `**bold**` rendering. */
export function boldSpans(text: string): { text: string; bold: boolean }[] {
  const spans: { text: string; bold: boolean }[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) spans.push({ text: text.slice(last, m.index), bold: false });
    spans.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) spans.push({ text: text.slice(last), bold: false });
  return spans.length > 0 ? spans : [{ text, bold: false }];
}

/** Write a paragraph line with inline `**bold**` spans, left-aligned at the margin. */
export function writeRichLine(
  doc: PDFKit.PDFDocument,
  text: string,
  opts: { size: number; indent?: number; color?: string } = { size: 10.5 },
): void {
  const spans = boldSpans(cleanInline(text));
  const indent = opts.indent ?? 0;
  const x = MARGIN.left + indent;
  const width = contentWidth(doc) - indent;
  const startY = doc.y;
  spans.forEach((span, i) => {
    doc
      .font(span.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(opts.size)
      .fillColor(opts.color ?? INK);
    if (i === 0) {
      doc.text(span.text, x, startY, {
        continued: i < spans.length - 1,
        width,
      });
    } else {
      doc.text(span.text, { continued: i < spans.length - 1 });
    }
  });
  doc.x = MARGIN.left;
}
