import PDFDocument from "pdfkit";
import { SA_LOGO_WHITE_PNG } from "./report-assets";
import type { GoogleAdsMetrics } from "./google-ads";
import {
  AMBER,
  CARD_LABEL,
  COVER_DIVIDER,
  COVER_SUB,
  FOOTER_GREY,
  HAIR,
  INDIGO,
  MARGIN,
  MUTED,
  NEARBLACK,
  PURPLE,
  WHITE,
  contentWidth,
  dec,
  drawGlow,
  eur,
  hbarChart,
  int,
  kpiCards,
  renderMarkdown,
  sectionTitle,
  chartLabel,
  type KpiCard,
} from "./pdf";

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
 * The drawing primitives live in ./pdf (shared with the one-pager, factuur and
 * offerte deliverables). pdfkit draws everything directly, so there is no
 * Chromium/headless dependency.
 */

export interface ReportPdfMeta {
  clientName: string;
  /** e.g. "Maandrapport — vorige maand" */
  subtitle: string;
  /** Generation date, already formatted for display. */
  dateLabel: string;
  /** Live account numbers — drive the cover KPI cards and the charts. */
  metrics?: GoogleAdsMetrics | null;
}

// --- Cover page -------------------------------------------------------------

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
    .fillColor(COVER_SUB)
    .text(`${periodFromSubtitle(meta.subtitle)}  ·  ${meta.dateLabel}`, x, uy + 18, {
      width: contentWidth(doc),
      lineBreak: false,
    });

  // KPI cards from live metrics
  const m = meta.metrics;
  if (m) {
    const cur = m.currency || "EUR";
    const cards: KpiCard[] = [
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
    const cy = 486;
    const ch = 96;
    kpiCards(doc, { x, y: cy, width: contentWidth(doc), cards });

    // Secondary stat strip, set off by a faint divider.
    const sy = cy + ch + 30;
    doc.save();
    doc.rect(x, sy - 14, contentWidth(doc), 1).fill(COVER_DIVIDER);
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
    .fillColor(FOOTER_GREY)
    .text(`Vertrouwelijk · Opgesteld ${meta.dateLabel}`, x, fy, {
      lineBreak: false,
    });
  if (m) {
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(FOOTER_GREY)
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
