import PDFDocument from "pdfkit";
import { SA_LOGO_WHITE_PNG } from "./report-assets";
import type { GoogleAdsMetrics } from "./google-ads";
import type { SeoReportMetrics } from "./seo-report-data";
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
  /** e.g. "Maandrapport — vorige maand" or "SEO-maandrapport — mei 2026" */
  subtitle: string;
  /** Generation date, already formatted for display. */
  dateLabel: string;
  /** Which report this is; drives the cover eyebrow, KPI cards and charts.
   * "internal" is the agency's interne werklijst — a plain branded cover with no
   * KPI cards or charts. */
  reportType?: "ads" | "seo" | "internal";
  /** Live Google Ads numbers — drive the Ads cover KPI cards and the charts. */
  metrics?: GoogleAdsMetrics | null;
  /** SEO snapshot — drives the SEO cover KPI cards and the charts. */
  seo?: SeoReportMetrics | null;
  /** Ads report cadence — drives the cover eyebrow ("MAANDRAPPORT" vs
   * "KWARTAALRAPPORT GOOGLE ADS"). Defaults to monthly. Mirrors seo.cadence. */
  adsCadence?: "monthly" | "quarterly";
}

// --- Cover page -------------------------------------------------------------

/** Turn "<X>rapport — vorige maand" into a clean, non-duplicated subline. Strips
 * any leading label up to the first em/en dash (Ads: "Maandrapport — …";
 * SEO: "SEO-maandrapport — …") so only the period part remains. Hyphens inside
 * the label (e.g. "SEO-…") are preserved because only em/en dashes separate. */
function periodFromSubtitle(subtitle: string): string {
  const m = /^.*?[—–]\s*(.*)$/.exec(subtitle.trim());
  let p = (m ? m[1] : subtitle).trim();
  if (p.length === 0) p = subtitle.trim() || "Rapport";
  return p.charAt(0).toUpperCase() + p.slice(1);
}

/**
 * The data-driven parts of the cover: the eyebrow (which report this is), the
 * KPI cards, an optional secondary stat strip and an optional right-aligned
 * footer source line. Built per report type so the drawing code stays shared
 * between the Ads and SEO reports.
 */
interface CoverModel {
  eyebrow: string;
  cards: KpiCard[];
  secondaryLine: string | null;
  footerRight: string | null;
}

function buildAdsCoverModel(m: GoogleAdsMetrics, eyebrow: string): CoverModel {
  const cur = m.currency || "EUR";
  // Lead-gen accounts (form fills / calls) don't track a monetary conversion
  // value, so ROAS is 0. Showing a "0,00×" card would read as broken to the
  // client, so we surface the conversion rate instead. Accounts that do track
  // value (real ROAS > 0) keep the ROAS card unchanged.
  const tracksValue =
    m.totals.roas !== null &&
    m.totals.roas > 0 &&
    (m.totals.conversionsValue ?? 0) > 0;
  const convRate =
    m.totals.clicks > 0 ? (m.totals.conversions / m.totals.clicks) * 100 : null;
  const fourthCard: KpiCard = tracksValue
    ? {
        label: "ROAS",
        value: m.totals.roas !== null ? `${dec(m.totals.roas)}×` : "n.v.t.",
        accent: AMBER,
      }
    : {
        label: "CONVERSIERATIO",
        value: convRate !== null ? `${dec(convRate)}%` : "n.v.t.",
        accent: AMBER,
      };
  return {
    eyebrow,
    cards: [
      { label: "KOSTEN", value: eur(m.totals.cost, cur, 0), accent: PURPLE },
      { label: "LEADS", value: int(m.totals.conversions), accent: PURPLE },
      {
        label: "KOST PER LEAD",
        value: m.totals.cpa !== null ? eur(m.totals.cpa, cur, 2) : "n.v.t.",
        accent: AMBER,
      },
      fourthCard,
    ],
    secondaryLine:
      `Klikken ${int(m.totals.clicks)}   ·   Vertoningen ${int(
        m.totals.impressions,
      )}   ·   Gem. CPC ${eur(m.totals.avgCpc, cur, 2)}   ·   CTR ${dec(
        m.totals.ctr * 100,
      )}%`,
    footerRight: `Google Ads · ${m.accountName} (${m.customerId})`,
  };
}

function buildSeoCoverModel(seo: SeoReportMetrics, eyebrow: string): CoverModel {
  const s = seo.search.current;
  const sec: string[] = [];
  if (seo.crawl) {
    const c = seo.crawl;
    sec.push(`Technische fouten ${int(c.clientErrors + c.serverErrors)}`);
    sec.push(`Indexeerbaar ${int(Math.max(0, c.totalUrls - c.nonIndexable))}`);
    sec.push(`Ontbrekende meta ${int(c.missingMetaDescriptions)}`);
  }
  if (seo.pagespeed) {
    sec.push(`PageSpeed ${int(seo.pagespeed.performanceScore)}/100`);
    if (seo.pagespeed.lcpMs > 0) {
      sec.push(`LCP ${(seo.pagespeed.lcpMs / 1000).toFixed(1)}s`);
    }
  }
  return {
    eyebrow,
    cards: [
      { label: "ORG. KLIKKEN", value: int(s.clicks), accent: PURPLE },
      { label: "VERTONINGEN", value: int(s.impressions), accent: PURPLE },
      { label: "CTR", value: `${dec(s.ctr * 100)}%`, accent: AMBER },
      { label: "GEM. POSITIE", value: dec(s.position, 1), accent: AMBER },
    ],
    secondaryLine: sec.length > 0 ? sec.join("   ·   ") : null,
    footerRight: `Search Console · ${seo.siteUrl}`,
  };
}

/**
 * Resolve the cover model for the report type. The eyebrow is always present
 * (it's drawn even when no live snapshot came back); the cards, secondary strip
 * and footer source line appear only when the corresponding data is available.
 */
function coverModel(meta: ReportPdfMeta): CoverModel {
  if (meta.reportType === "internal") {
    return {
      eyebrow: "INTERNE WERKLIJST",
      cards: [],
      secondaryLine: null,
      footerRight: null,
    };
  }
  if (meta.reportType === "seo") {
    const eyebrow =
      meta.seo?.cadence === "quarterly" ? "SEO-KWARTAALRAPPORT" : "SEO-RAPPORT";
    return meta.seo
      ? buildSeoCoverModel(meta.seo, eyebrow)
      : { eyebrow, cards: [], secondaryLine: null, footerRight: null };
  }
  const adsEyebrow =
    meta.adsCadence === "quarterly"
      ? "KWARTAALRAPPORT GOOGLE ADS"
      : "MAANDRAPPORT GOOGLE ADS";
  return meta.metrics
    ? buildAdsCoverModel(meta.metrics, adsEyebrow)
    : {
        eyebrow: adsEyebrow,
        cards: [],
        secondaryLine: null,
        footerRight: null,
      };
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

  const cover = coverModel(meta);

  // Hero title block — sits in the lower-centre for an editorial, deck-like balance.
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(AMBER)
    .text(cover.eyebrow, x, 308, {
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

  // KPI cards from the live snapshot (Ads or SEO); absent when no data came back.
  if (cover.cards.length > 0) {
    const cy = 486;
    const ch = 96;
    kpiCards(doc, { x, y: cy, width: contentWidth(doc), cards: cover.cards });

    // Secondary stat strip, set off by a faint divider.
    if (cover.secondaryLine) {
      const sy = cy + ch + 30;
      doc.save();
      doc.rect(x, sy - 14, contentWidth(doc), 1).fill(COVER_DIVIDER);
      doc.restore();
      doc
        .font("Helvetica")
        .fontSize(9.5)
        .fillColor(CARD_LABEL)
        .text(cover.secondaryLine, x, sy, {
          width: contentWidth(doc),
          lineBreak: false,
        });
    }
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
  if (cover.footerRight) {
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(FOOTER_GREY)
      .text(cover.footerRight, x, fy, {
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

/** SEO analysis charts: the top organic queries by clicks this period. */
function drawSeoCharts(doc: PDFKit.PDFDocument, seo: SeoReportMetrics): void {
  const byClicks = seo.search.topQueries
    .filter((q) => q.clicks > 0)
    .slice(0, 6);
  if (byClicks.length > 0) {
    chartLabel(doc, "Top zoektermen (klikken)");
    hbarChart(
      doc,
      byClicks.map((q) => ({
        label: q.key,
        value: q.clicks,
        display: int(q.clicks),
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
    if (meta.reportType === "seo") {
      if (meta.seo && meta.seo.search.topQueries.length > 0) {
        sectionTitle(doc, "Organische zoekprestaties in beeld");
        drawSeoCharts(doc, meta.seo);
        doc.moveDown(0.5);
      }
    } else if (meta.metrics && meta.metrics.campaigns.length > 0) {
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
