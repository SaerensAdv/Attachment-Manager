import PDFDocument from "pdfkit";
import { createWriteStream, mkdirSync } from "node:fs";
import { resolve } from "node:path";

// --- Saerens brand palette (single source: lib/brand tokens) ---
const INDIGO = "#29274E";
const PURPLE = "#716BEB";
const AMBER = "#F4A425";
const INK = "#1A1A22";
const MUTED = "#6B6B72";
const HAIR = "#E4E2EE";
const PANEL = "#F5F5F8";
const WHITE = "#FFFFFF";
const FOOTER_GREY = "#6E6C82";
const MARGIN = { top: 64, bottom: 76, left: 56, right: 56 };

const eur = (n) =>
  new Intl.NumberFormat("nl-BE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

const contentWidth = (doc) => doc.page.width - MARGIN.left - MARGIN.right;

// --- Ported drawTable primitive (lib/pdf/table.ts) ---
const isNumericCell = (s) => {
  const t = (s ?? "").trim();
  if (!t) return false;
  return /\d/.test(t) && /^[€$+\-]?[\d.,%\s×x/€$()–-]+$/.test(t);
};

function drawTable(doc, rawRows) {
  if (rawRows.length === 0) return;
  const header = rawRows[0];
  const body = rawRows.slice(1);
  const cols = Math.max(header.length, ...body.map((r) => r.length));
  const padX = 7;
  const padY = 5;
  const cw = contentWidth(doc);

  const weights = [];
  for (let c = 0; c < cols; c++) {
    let maxLen = (header[c] ?? "").length;
    for (const r of body) maxLen = Math.max(maxLen, (r[c] ?? "").length);
    weights.push(Math.min(Math.max(maxLen, 5), 36) * (c === 0 ? 1.5 : 1));
  }
  const totalW = weights.reduce((a, b) => a + b, 0);

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

  const measureRow = (cells, bold) => {
    let h = 0;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
    for (let c = 0; c < cols; c++) {
      const hh = doc.heightOfString(cells[c] ?? "", {
        width: widths[c] - padX * 2,
      });
      h = Math.max(h, hh);
    }
    return h + padY * 2;
  };

  const drawRow = (cells, opts) => {
    const rowH = measureRow(cells, opts.bold);
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
    doc
      .moveTo(MARGIN.left, y + rowH)
      .lineTo(MARGIN.left + cw, y + rowH)
      .lineWidth(0.5)
      .strokeColor(HAIR)
      .stroke();
    doc.y = y + rowH;
  };

  drawRow(header, { bold: true, fill: INDIGO, textColor: WHITE });
  body.forEach((r, i) => {
    drawRow(r, {
      bold: false,
      fill: i % 2 === 1 ? PANEL : undefined,
      textColor: INK,
    });
  });
  doc.moveDown(0.6);
}

function drawParty(doc, { title, name, lines, x, y, width }) {
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(MUTED)
    .text(title.toUpperCase(), x, y, { width, characterSpacing: 1.5 });
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(INK)
    .text(name, x, doc.y + 4, { width });
  doc.font("Helvetica").fontSize(9.5).fillColor(INK);
  for (const ln of lines) {
    if (!ln) continue;
    doc.text(ln, x, doc.y + 1, { width });
  }
  return doc.y;
}

// --- Document data ---
const sender = {
  legalName: "Saerens Advertising",
  legalForm: "Eenmanszaak",
  vatNumber: "BE 1019.436.742",
  addressLines: ["Grote Weg 324", "9500 Geraardsbergen", "België"],
  email: "axel@saerensadvertising.com",
};
const recipient = {
  name: "LCS",
  addressLines: ["Kluizestraat 13", "9910 Aalter", "België"],
  vatNumber: "BE 0681.408.766",
};
const issuedDateLabel = "19 juni 2026";

const subtotalCents = 255500 + 805 + 551 + 472; // 257328
const vatCents = Math.round(subtotalCents * 0.21); // 54039
const totalCents = subtotalCents + vatCents; // 311367

const tableRows = [
  ["Omschrijving", "Aantal", "Prijs", "Totaal excl.", "Btw", "Totaal incl."],
  [
    "M2402025090 Gecomprimeerde fles konisch 25L — N2 90% + H2 10% 250bar comp — eenheidsprijs per fles",
    "5",
    eur(511),
    eur(2555),
    "21%",
    eur(3091.55),
  ],
  ["Leeggoed huurfles comp kon", "1", eur(8.05), eur(8.05), "21%", eur(9.74)],
  ["Milieubijdrage", "1", eur(5.51), eur(5.51), "21%", eur(6.67)],
  ["Administratiekost", "1", eur(4.72), eur(4.72), "21%", eur(5.71)],
];

// --- Render ---
const outDir = resolve(process.cwd(), "../../outputs");
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, "proforma-LCS-2026-06-19.pdf");

const doc = new PDFDocument({
  size: "A4",
  margins: { ...MARGIN },
  bufferPages: true,
  info: {
    Title: `Proforma — ${recipient.name}`,
    Author: sender.legalName,
  },
});
doc.pipe(createWriteStream(outPath));

const W = doc.page.width;
const H = doc.page.height;
const x = MARGIN.left;
const cw = contentWidth(doc);

// --- Light title block (no dark header band) ---
doc
  .font("Helvetica-Bold")
  .fontSize(22)
  .fillColor(INDIGO)
  .text("PROFORMA", x, MARGIN.top, { lineBreak: false });

const rightW = 260;
const rx = W - MARGIN.right - rightW;
doc
  .font("Helvetica")
  .fontSize(8.5)
  .fillColor(MUTED)
  .text("PROFORMA — GEEN FACTUURNUMMER", rx, MARGIN.top + 1, {
    width: rightW,
    align: "right",
    lineBreak: false,
    characterSpacing: 0.5,
  });
doc
  .font("Helvetica")
  .fontSize(9.5)
  .fillColor(INK)
  .text(`Factuurdatum ${issuedDateLabel}`, rx, MARGIN.top + 16, {
    width: rightW,
    align: "right",
    lineBreak: false,
  });

// hairline under the title
const ruleY = MARGIN.top + 40;
doc
  .moveTo(x, ruleY)
  .lineTo(x + cw, ruleY)
  .lineWidth(0.75)
  .strokeColor(HAIR)
  .stroke();

// --- Parties: Van (Saerens) left, Factuur aan (LCS) right ---
const gap = 28;
const colW = (cw - gap) / 2;
const partiesY = ruleY + 22;
const senderLines = [
  sender.legalForm,
  ...sender.addressLines,
  `BTW ${sender.vatNumber}`,
  sender.email,
];
const recipientLines = [
  ...recipient.addressLines,
  `BTW ${recipient.vatNumber}`,
];
const yLeft = drawParty(doc, {
  title: "Van",
  name: sender.legalName,
  lines: senderLines,
  x,
  y: partiesY,
  width: colW,
});
const yRight = drawParty(doc, {
  title: "Factuur aan",
  name: recipient.name,
  lines: recipientLines,
  x: x + colW + gap,
  y: partiesY,
  width: colW,
});

// --- Line items table ---
doc.x = x;
doc.y = Math.max(yLeft, yRight) + 26;
drawTable(doc, tableRows);

// --- Totals block (right-aligned) ---
const eurc = (c) => eur(c / 100);
const tw = 260;
const tx = W - MARGIN.right - tw;
const labelW = tw * 0.56;
const valX = tx + labelW;
const valW = tw - labelW;
let ty = doc.y + 8;
const totalRow = (label, value, big) => {
  doc
    .font(big ? "Helvetica-Bold" : "Helvetica")
    .fontSize(big ? 11.5 : 10)
    .fillColor(big ? INK : MUTED)
    .text(label, tx, ty, { width: labelW, lineBreak: false });
  doc
    .font("Helvetica-Bold")
    .fontSize(big ? 13 : 10.5)
    .fillColor(big ? INDIGO : INK)
    .text(value, valX, ty - (big ? 1 : 0), {
      width: valW,
      align: "right",
      lineBreak: false,
    });
  ty += big ? 24 : 17;
};
totalRow("Subtotaal (excl. btw)", eurc(subtotalCents));
totalRow("Btw (21%)", eurc(vatCents));
doc
  .moveTo(tx, ty)
  .lineTo(tx + tw, ty)
  .lineWidth(0.75)
  .strokeColor(HAIR)
  .stroke();
ty += 6;
totalRow("Totaal te betalen", eurc(totalCents), true);

// --- Proforma disclaimer ---
doc
  .font("Helvetica-Oblique")
  .fontSize(9)
  .fillColor(AMBER)
  .text("Dit is een proforma en is geen geldige factuur.", x, ty + 10, {
    width: cw,
  });

// --- Footer: legal line + accent bar (no IBAN — betaalgegevens weggelaten) ---
doc.page.margins.bottom = 0;
const fy = H - 50;
doc
  .font("Helvetica")
  .fontSize(8)
  .fillColor(FOOTER_GREY)
  .text(
    `${sender.legalName} · ${sender.legalForm} · BTW ${sender.vatNumber}`,
    x,
    fy,
    { width: cw, align: "center", lineBreak: false },
  );
const bar = doc.linearGradient(0, 0, W, 0);
bar.stop(0, PURPLE);
bar.stop(0.62, PURPLE);
bar.stop(1, AMBER);
doc.save();
doc.rect(0, H - 6, W, 6).fill(bar);
doc.restore();

doc.end();
doc.on("end", () => console.log("WROTE", outPath));
