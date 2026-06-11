import PDFDocument from "pdfkit";
import { SA_LOGO_WHITE_PNG } from "./report-assets";
import type { GoogleAdsMetrics } from "./google-ads";

/**
 * Render a client report into a branded Saerens Advertising PDF.
 *
 * Two-part layout:
 *  - a full-bleed dark cover page (the saerensadvertising.com identity: near-black
 *    bg, white "SA" mark, purple #716BEB + amber #F4A425 accents) with the
 *    headline KPI cards pulled from the live Google Ads numbers; and
 *  - clean light analysis pages that render the team's markdown properly —
 *    including real tables and bar charts — instead of dumping it as plain text.
 *
 * pdfkit draws everything directly, so there is no Chromium/headless dependency.
 * The markdown subset handled: H1–H6, bullets, numbered lists, **bold**, blank
 * lines, horizontal rules, and GitHub-style pipe tables. Anything unrecognised
 * is printed as a paragraph, so the report is never lost.
 */

// --- Saerens brand palette ---
const NEARBLACK = "#0A0A0B";
const INDIGO = "#29274E";
const PURPLE = "#716BEB";
const AMBER = "#F4A425";
const INK = "#1A1A22";
const MUTED = "#6B6B72";
const HAIR = "#E4E2EE";
const PANEL = "#F5F5F8";
const CARD_DARK = "#17161F";
const CARD_LABEL = "#9A98AB";
const WHITE = "#FFFFFF";

const MARGIN = { top: 64, bottom: 76, left: 56, right: 56 };

export interface ReportPdfMeta {
  clientName: string;
  /** e.g. "Maandrapport — vorige maand" */
  subtitle: string;
  /** Generation date, already formatted for display. */
  dateLabel: string;
  /** Live account numbers — drive the cover KPI cards and the charts. */
  metrics?: GoogleAdsMetrics | null;
}

// --- number formatting (nl-BE) ---
function eur(n: number, currency: string, dec = 0): string {
  try {
    return new Intl.NumberFormat("nl-BE", {
      style: "currency",
      currency: currency || "EUR",
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    }).format(n);
  } catch {
    return `${n.toFixed(dec)} ${currency}`.trim();
  }
}
function int(n: number): string {
  return new Intl.NumberFormat("nl-BE").format(Math.round(n));
}
function dec(n: number, d = 2): string {
  return new Intl.NumberFormat("nl-BE", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n);
}

/** Strip inline markdown we don't render as rich text. */
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
    if (m.index > last) spans.push({ text: text.slice(last, m.index), bold: false });
    spans.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) spans.push({ text: text.slice(last), bold: false });
  return spans.length > 0 ? spans : [{ text, bold: false }];
}

function writeRichLine(
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

function contentWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - MARGIN.left - MARGIN.right;
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > doc.page.height - MARGIN.bottom) doc.addPage();
}

// --- Cover page -------------------------------------------------------------

/** A soft radial colour wash — fakes the deck's blurred glow blobs in pdfkit. */
function drawGlow(
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

/** Turn "Maandrapport — vorige maand" into a clean, non-duplicated subline. */
function periodFromSubtitle(subtitle: string): string {
  const m = /^maandrapport\s*[—–-]\s*(.*)$/i.exec(subtitle.trim());
  let p = (m ? m[1] : subtitle).trim();
  if (p.length === 0) p = "Maandrapport";
  return p.charAt(0).toUpperCase() + p.slice(1);
}

/** Largest title size (≤34pt) that keeps the client name within two lines, so a
 * long name can never overflow into the fixed-position KPI cards below. */
function fitTitleSize(doc: PDFKit.PDFDocument, name: string, width: number): number {
  doc.font("Helvetica-Bold");
  for (const size of [34, 29, 24, 20]) {
    doc.fontSize(size);
    if (doc.heightOfString(name, { width }) <= size * 2.3) return size;
  }
  return 20;
}

function drawCover(doc: PDFKit.PDFDocument, meta: ReportPdfMeta): void {
  const W = doc.page.width;
  const H = doc.page.height;
  const x = MARGIN.left;

  doc.save();
  doc.rect(0, 0, W, H).fill(NEARBLACK);
  doc.restore();

  // Soft brand glows (mirrors the deck cover's blurred indigo/purple blobs).
  drawGlow(doc, W, H, W - 24, 36, 380, PURPLE, 0.26);
  drawGlow(doc, W, H, 18, H - 28, 340, INDIGO, 0.55);

  // Logo + wordmark
  try {
    doc.image(SA_LOGO_WHITE_PNG, x, 58, { width: 42 });
  } catch {
    /* logo is best-effort */
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(WHITE)
    .text("SAERENS ADVERTISING", x + 54, 76, {
      characterSpacing: 2,
      lineBreak: false,
    });

  // Hero title block — sits in the lower-centre for an editorial, deck-like balance.
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(AMBER)
    .text("MAANDRAPPORT GOOGLE ADS", x, 308, {
      characterSpacing: 3,
      lineBreak: false,
    });
  const titleSize = fitTitleSize(doc, meta.clientName, contentWidth(doc));
  doc
    .font("Helvetica-Bold")
    .fontSize(titleSize)
    .fillColor(WHITE)
    .text(meta.clientName, x, 330, {
      width: contentWidth(doc),
      height: titleSize * 2.4,
      ellipsis: true,
    });
  // Signature purple underline (the deck's hero accent).
  const uy = doc.y + 10;
  doc.save();
  doc.rect(x, uy, 120, 4).fill(PURPLE);
  doc.restore();
  doc
    .font("Helvetica")
    .fontSize(13)
    .fillColor("#C9C7D6")
    .text(`${periodFromSubtitle(meta.subtitle)}  ·  ${meta.dateLabel}`, x, uy + 18, {
      width: contentWidth(doc),
      lineBreak: false,
    });

  // KPI cards from live metrics
  const m = meta.metrics;
  if (m) {
    const cur = m.currency || "EUR";
    const cards: { label: string; value: string; accent: string }[] = [
      { label: "KOSTEN", value: eur(m.totals.cost, cur, 0), accent: PURPLE },
      { label: "LEADS", value: int(m.totals.conversions), accent: PURPLE },
      {
        label: "KOST PER LEAD",
        value: m.totals.cpa !== null ? eur(m.totals.cpa, cur, 2) : "n.v.t.",
        accent: AMBER,
      },
      {
        label: "ROAS",
        value: m.totals.roas !== null ? `${dec(m.totals.roas)}×` : "n.v.t.",
        accent: AMBER,
      },
    ];
    const gap = 14;
    const cw = (contentWidth(doc) - gap * 3) / 4;
    const ch = 96;
    const cy = 486;
    cards.forEach((card, i) => {
      const cx = x + i * (cw + gap);
      doc.save();
      doc.roundedRect(cx, cy, cw, ch, 7).fill(CARD_DARK);
      doc.rect(cx, cy, cw, 3).fill(card.accent);
      doc.restore();
      doc
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .fillColor(CARD_LABEL)
        .text(card.label, cx + 13, cy + 18, {
          characterSpacing: 1.2,
          width: cw - 26,
          lineBreak: false,
        });
      doc
        .font("Helvetica-Bold")
        .fontSize(19)
        .fillColor(WHITE)
        .text(card.value, cx + 13, cy + 42, { width: cw - 26, lineBreak: false });
    });

    // Secondary stat strip, set off by a faint divider.
    const sy = cy + ch + 30;
    doc.save();
    doc.rect(x, sy - 14, contentWidth(doc), 1).fill("#262532");
    doc.restore();
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(CARD_LABEL)
      .text(
        `Klikken ${int(m.totals.clicks)}   ·   Vertoningen ${int(
          m.totals.impressions,
        )}   ·   Gem. CPC ${eur(m.totals.avgCpc, cur, 2)}   ·   CTR ${dec(
          m.totals.ctr * 100,
        )}%`,
        x,
        sy,
        { width: contentWidth(doc), lineBreak: false },
      );
  }

  // Footer meta — left/right like the deck cover.
  const savedBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  const fy = H - 52;
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor("#6E6C82")
    .text(`Vertrouwelijk · Opgesteld ${meta.dateLabel}`, x, fy, {
      lineBreak: false,
    });
  if (m) {
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor("#6E6C82")
      .text(`Google Ads · ${m.accountName} (${m.customerId})`, x, fy, {
        width: contentWidth(doc),
        align: "right",
        lineBreak: false,
      });
  }
  doc.page.margins.bottom = savedBottom;

  // Bottom accent bar (purple → amber), the deck's signature footer rule.
  const bar = doc.linearGradient(0, 0, W, 0);
  bar.stop(0, PURPLE);
  bar.stop(0.62, PURPLE);
  bar.stop(1, AMBER);
  doc.save();
  doc.rect(0, H - 6, W, 6).fill(bar);
  doc.restore();
}

// --- Charts -----------------------------------------------------------------

function sectionTitle(doc: PDFKit.PDFDocument, text: string): void {
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
function chartLabel(doc: PDFKit.PDFDocument, text: string): void {
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

function hbarChart(
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

function drawCharts(doc: PDFKit.PDFDocument, m: GoogleAdsMetrics): void {
  const cur = m.currency || "EUR";
  const byCost = [...m.campaigns]
    .filter((c) => c.cost > 0)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 6);
  const byConv = [...m.campaigns]
    .filter((c) => c.conversions > 0)
    .sort((a, b) => b.conversions - a.conversions)
    .slice(0, 6);

  if (byCost.length > 0) {
    chartLabel(doc, "Kosten per campagne");
    hbarChart(
      doc,
      byCost.map((c) => ({
        label: c.name,
        value: c.cost,
        display: eur(c.cost, cur, 0),
      })),
    );
  }
  if (byConv.length > 0) {
    chartLabel(doc, "Leads per campagne");
    hbarChart(
      doc,
      byConv.map((c) => ({
        label: c.name,
        value: c.conversions,
        display: dec(c.conversions, c.conversions % 1 === 0 ? 0 : 1),
      })),
    );
  }
}

// --- Markdown tables --------------------------------------------------------

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => cleanInline(c.trim()));
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c.trim()));
}

function isNumericCell(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  return /\d/.test(t) && /^[€$+\-]?[\d.,%\s×x/€$()–-]+$/.test(t);
}

function drawTable(doc: PDFKit.PDFDocument, rawRows: string[][]): void {
  if (rawRows.length === 0) return;
  let rows = rawRows;
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

// --- Markdown body ----------------------------------------------------------

function renderMarkdown(doc: PDFKit.PDFDocument, markdown: string): void {
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

// --- Public API -------------------------------------------------------------

export function renderReportPdf(
  markdown: string,
  meta: ReportPdfMeta,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { ...MARGIN },
      bufferPages: true,
      info: {
        Title: `${meta.clientName} — ${meta.subtitle}`,
        Author: "Saerens Advertising",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Content pages get a thin purple top accent; the cover (page 0) does not.
    doc.on("pageAdded", () => {
      doc.save();
      doc.rect(0, 0, doc.page.width, 4).fill(PURPLE);
      doc.restore();
      doc.x = MARGIN.left;
      doc.y = MARGIN.top;
    });

    // Page 1: cover
    drawCover(doc, meta);

    // Page 2+: analysis
    doc.addPage();
    if (meta.metrics && meta.metrics.campaigns.length > 0) {
      sectionTitle(doc, "Campagneprestaties in beeld");
      drawCharts(doc, meta.metrics);
      doc.moveDown(0.5);
    }
    renderMarkdown(doc, markdown);

    // Footer (page numbers) across content pages.
    const range = doc.bufferedPageRange();
    for (let p = 1; p < range.count; p++) {
      doc.switchToPage(p);
      doc.page.margins.bottom = 0;
      const fy = doc.page.height - 52;
      doc
        .moveTo(MARGIN.left, fy)
        .lineTo(doc.page.width - MARGIN.right, fy)
        .lineWidth(0.5)
        .strokeColor(HAIR)
        .stroke();
      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor(MUTED)
        .text("SAERENS ADVERTISING", MARGIN.left, fy + 8, {
          characterSpacing: 1,
          lineBreak: false,
        });
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(MUTED)
        .text(
          `Pagina ${p} / ${range.count - 1}`,
          doc.page.width - MARGIN.right - 100,
          fy + 8,
          { width: 100, align: "right", lineBreak: false },
        );
    }

    doc.end();
  });
}
