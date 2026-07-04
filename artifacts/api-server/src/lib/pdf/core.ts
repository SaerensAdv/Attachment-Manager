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

export interface RichSpan {
  text: string;
  bold: boolean;
  italic: boolean;
}

/**
 * Split a line into styled spans for inline `**bold**`, `*italic*` and
 * `***bold italic***`. Bold is matched before italic so `**x**` never leaks a
 * stray `*`. Unpaired markers are left literal, so ordinary prose with a lone
 * asterisk (or math like `2 * 3`) is never mangled.
 */
export function richSpans(text: string): RichSpan[] {
  const spans: RichSpan[] = [];
  const re = /\*\*\*([^*\n]+)\*\*\*|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      spans.push({ text: text.slice(last, m.index), bold: false, italic: false });
    }
    if (m[1] !== undefined) spans.push({ text: m[1], bold: true, italic: true });
    else if (m[2] !== undefined) spans.push({ text: m[2], bold: true, italic: false });
    else spans.push({ text: m[3], bold: false, italic: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    spans.push({ text: text.slice(last), bold: false, italic: false });
  }
  return spans.length > 0 ? spans : [{ text, bold: false, italic: false }];
}

/** The Helvetica variant for a span's bold/italic combination. */
function spanFont(bold: boolean, italic: boolean): string {
  if (bold && italic) return "Helvetica-BoldOblique";
  if (bold) return "Helvetica-Bold";
  if (italic) return "Helvetica-Oblique";
  return "Helvetica";
}

/**
 * Strip inline emphasis markers without styling — for contexts rendered as a
 * single run (e.g. headings), where a leaked `*`/`**` would look broken.
 */
export function stripEmphasis(text: string): string {
  return text
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1");
}

/** Write a paragraph line with inline `**bold**` / `*italic*` spans, left-aligned. */
export function writeRichLine(
  doc: PDFKit.PDFDocument,
  text: string,
  opts: { size: number; indent?: number; color?: string } = { size: 10.5 },
): void {
  const spans = richSpans(cleanInline(text));
  const indent = opts.indent ?? 0;
  const x = MARGIN.left + indent;
  const width = contentWidth(doc) - indent;
  const startY = doc.y;
  spans.forEach((span, i) => {
    doc
      .font(spanFont(span.bold, span.italic))
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
