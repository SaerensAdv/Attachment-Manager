import PDFDocument from "pdfkit";
import { SA_LOGO_WHITE_PNG } from "./report-assets";
import type { GoogleAdsMetrics } from "./google-ads";
import {
  AMBER,
  COVER_SUB,
  FOOTER_GREY,
  INDIGO,
  INK,
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
  sectionTitle,
  type KpiCard,
} from "./pdf";

/**
 * Render a single-page "snapshot" of a client's live Google Ads numbers into a
 * branded Saerens Advertising PDF. A lighter sibling of the full monthly report
 * (`report-pdf.ts`): it reuses the exact same drawing primitives (`./pdf`) and
 * huisstijl, but fits the headline KPIs, one campaign chart and a short,
 * deterministic samenvatting onto one page — handy as a quick share-out without
 * running the report team.
 *
 * Everything is positioned so the content can never spill onto a second page.
 */

export interface SnapshotPdfMeta {
  clientName: string;
  /** Generation date, already formatted for display (nl-BE). */
  dateLabel: string;
  /** Live account numbers — drive the KPI cards, chart and samenvatting. */
  metrics: GoogleAdsMetrics;
}

const HEADER_H = 226;

/** Largest title size (≤26pt) that keeps the client name on two lines within the
 * dark header band, so a long name can never overflow into the cards below. */
function fitTitleSize(doc: PDFKit.PDFDocument, name: string, width: number): number {
  doc.font("Helvetica-Bold");
  for (const size of [26, 22, 18, 15]) {
    doc.fontSize(size);
    if (doc.heightOfString(name, { width }) <= size * 2.3) return size;
  }
  return 15;
}

/** A few plain Dutch sentences derived purely from the metrics — no LLM. */
function buildSummary(m: GoogleAdsMetrics): string {
  const cur = m.currency || "EUR";
  const parts: string[] = [];
  const leads = m.totals.conversions;
  parts.push(
    `In de ${m.rangeLabel} realiseerde ${m.accountName} ${int(leads)} ` +
      `${leads === 1 ? "lead" : "leads"} voor ${eur(m.totals.cost, cur, 0)} ` +
      `advertentiekost` +
      (m.totals.cpa !== null
        ? ` (${eur(m.totals.cpa, cur, 2)} per lead).`
        : `.`),
  );
  const top = [...m.campaigns]
    .filter((c) => c.conversions > 0)
    .sort((a, b) => b.conversions - a.conversions)[0];
  if (top) {
    parts.push(
      `De sterkste campagne was "${top.name}" met ` +
        `${dec(top.conversions, top.conversions % 1 === 0 ? 0 : 1)} leads.`,
    );
  }
  if (m.totals.roas !== null) {
    parts.push(`Dat levert een ROAS van ${dec(m.totals.roas)}× op.`);
  }
  return parts.join(" ");
}

export function renderSnapshotPdf(meta: SnapshotPdfMeta): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { ...MARGIN },
      bufferPages: true,
      info: {
        Title: `${meta.clientName} — Google Ads snapshot`,
        Author: "Saerens Advertising",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width;
    const H = doc.page.height;
    const x = MARGIN.left;
    const cw = contentWidth(doc);
    const m = meta.metrics;
    const cur = m.currency || "EUR";

    // --- Dark header band (the cover identity, condensed) ---
    doc.save();
    doc.rect(0, 0, W, HEADER_H).fill(NEARBLACK);
    doc.restore();
    // Keep the soft glows contained inside the band.
    doc.save();
    doc.rect(0, 0, W, HEADER_H).clip();
    drawGlow(doc, W, HEADER_H, W - 24, 24, 300, PURPLE, 0.26);
    drawGlow(doc, W, HEADER_H, 18, HEADER_H - 10, 260, INDIGO, 0.5);
    doc.restore();

    try {
      doc.image(SA_LOGO_WHITE_PNG, x, 40, { width: 38 });
    } catch {
      /* logo is best-effort */
    }
    doc
      .font("Helvetica-Bold")
      .fontSize(10.5)
      .fillColor(WHITE)
      .text("SAERENS ADVERTISING", x + 50, 54, {
        characterSpacing: 2,
        lineBreak: false,
      });

    doc
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .fillColor(AMBER)
      .text("GOOGLE ADS · SNAPSHOT", x, 108, {
        characterSpacing: 3,
        lineBreak: false,
      });
    const titleSize = fitTitleSize(doc, meta.clientName, cw);
    doc
      .font("Helvetica-Bold")
      .fontSize(titleSize)
      .fillColor(WHITE)
      .text(meta.clientName, x, 126, {
        width: cw,
        height: titleSize * 2.4,
        ellipsis: true,
      });
    const uy = doc.y + 8;
    doc.save();
    doc.rect(x, uy, 104, 4).fill(PURPLE);
    doc.restore();
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor(COVER_SUB)
      .text(
        `${m.rangeLabel.charAt(0).toUpperCase()}${m.rangeLabel.slice(1)}  ·  ${meta.dateLabel}`,
        x,
        uy + 16,
        { width: cw, lineBreak: false },
      );

    // --- KPI cards (live numbers) ---
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
    const cardsY = HEADER_H + 26;
    kpiCards(doc, { x, y: cardsY, width: cw, cards });

    // Secondary stat strip.
    const stripY = cardsY + 96 + 16;
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text(
        `Klikken ${int(m.totals.clicks)}   ·   Vertoningen ${int(
          m.totals.impressions,
        )}   ·   Gem. CPC ${eur(m.totals.avgCpc, cur, 2)}   ·   CTR ${dec(
          m.totals.ctr * 100,
        )}%`,
        x,
        stripY,
        { width: cw, lineBreak: false },
      );

    // --- One campaign chart (kept short for the single page) ---
    doc.x = x;
    doc.y = stripY + 30;
    const byCost = [...m.campaigns]
      .filter((c) => c.cost > 0)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 4);
    if (byCost.length > 0) {
      sectionTitle(doc, "Kosten per campagne");
      hbarChart(
        doc,
        byCost.map((c) => ({
          label: c.name,
          value: c.cost,
          display: eur(c.cost, cur, 0),
        })),
      );
    }

    // --- Deterministic samenvatting ---
    doc.x = x;
    doc.moveDown(0.5);
    sectionTitle(doc, "Samenvatting");
    doc
      .font("Helvetica")
      .fontSize(10.5)
      .fillColor(INK)
      .text(buildSummary(m), x, doc.y, { width: cw, lineGap: 3 });

    // --- Footer: account meta + signature accent bar ---
    doc.page.margins.bottom = 0;
    const fy = H - 50;
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(FOOTER_GREY)
      .text(`Vertrouwelijk · Opgesteld ${meta.dateLabel}`, x, fy, {
        lineBreak: false,
      });
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(FOOTER_GREY)
      .text(`Google Ads · ${m.accountName} (${m.customerId})`, x, fy, {
        width: cw,
        align: "right",
        lineBreak: false,
      });

    const bar = doc.linearGradient(0, 0, W, 0);
    bar.stop(0, PURPLE);
    bar.stop(0.62, PURPLE);
    bar.stop(1, AMBER);
    doc.save();
    doc.rect(0, H - 6, W, 6).fill(bar);
    doc.restore();

    doc.end();
  });
}
