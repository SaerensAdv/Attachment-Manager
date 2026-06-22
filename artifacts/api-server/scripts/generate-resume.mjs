// One-off branded resume generator for Axel Saerens.
// Self-contained ESM (no tsx). Run: cd artifacts/api-server && node scripts/generate-resume.mjs
// Outputs PDF + DOCX + JSON to <repo>/outputs. Saerens house style (full brand).
import { jsPDF } from "jspdf";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  BorderStyle,
  TabStopType,
  AlignmentType,
} from "docx";
import fs from "fs";
import path from "path";

// --- Brand tokens (from lib/brand/src/tokens.ts) ---
const INDIGO = "#29274E";
const PURPLE = "#716BEB";
const AMBER = "#F4A425";
const INK = "#1A1A22";
const MUTED = "#6B6B72";
const HAIR = "#E4E2EE";

// --- Page geometry (US Letter, per resume-maker skill) ---
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const TARGET_Y = PAGE_H - MARGIN;

const BASE_SPACING = {
  nameFontSize: 23,
  headlineFontSize: 11,
  bodyFontSize: 10.5,
  smallFontSize: 9,
  sectionFontSize: 10.5,
  lineHeight: 13.5,
  sectionGap: 11,
  roleGap: 8,
  bulletGap: 3.5,
};

// --- Content ---
function getResumeData() {
  return {
    name: "Axel Saerens",
    headline: "Account Strategist · Google Ads & Conversion-Tracking Specialist",
    contact: {
      location: "Belgium · open to relocating to Dublin",
      email: "ax.saerens@gmail.com",
      website: "saerensadvertising.com",
    },
    summary:
      "Account Strategist who already sold and managed the Belgian and Dutch SMB market at Google Customer Solutions — hitting quota every quarter and earning a Sales Captain promotion — before building a Google Ads agency from zero. Combines deep platform and conversion-tracking expertise with consultative selling to grow advertiser revenue and own a portfolio end to end.",
    roles: [
      {
        title: "Founder & Google Ads Consultant",
        company: "Saerens Advertising · Belgium",
        dates: "Sep 2024 – Present",
        bullets: [
          "Acquired, onboarded and managed 10+ SMB clients across Belgium and the Netherlands — entirely through inbound and referral, with zero acquisition spend.",
          "Ran 5+ Google Ads and 3+ Meta Ads accounts simultaneously across e-commerce, home services, automotive, B2B distribution, real estate and SaaS.",
          "Cut one client's monthly ad spend by €14k while holding conversion value flat, through account restructuring and a negative-keyword strategy.",
          "Built and managed a 5-account MCC for one client; scaled another from 1 to 5 domains across Belgium and France to expand lead generation.",
          "Won most retainers by first fixing broken tracking / Consent Mode, then upselling into full management; shipped two SaaS products solo (ConsentEase.io, Abonnement.website).",
        ],
      },
      {
        title: "Account Strategist",
        company: "Google Customer Solutions (via Teleperformance) · Lisbon, Portugal",
        dates: "Mar 2023 – Sep 2024",
        bullets: [
          "Front-line seller for the Belgian and Dutch SMB market, running regular phone consultations and sales pitches across a managed portfolio.",
          "Hit quarterly revenue and productivity targets every single quarter.",
          "Promoted to Sales Captain — designed and delivered conversion-tracking training for the entire Dutch market team, lifting market-wide performance.",
        ],
      },
      {
        title: "Technical Support Specialist",
        company: "Google Technical Solutions (via Teleperformance) · Lisbon, Portugal",
        dates: "Aug 2022 – Mar 2023",
        bullets: [
          "Supported advertisers on basic and advanced conversion tracking, dataLayer, and Consent Mode implementation.",
          "Became the team's go-to specialist for Consent Mode and tracking troubleshooting.",
        ],
      },
    ],
    skills: [
      {
        category: "Advertising",
        items: "Google Ads (Search, Shopping, PMax, Display, Demand Gen, YouTube), Meta Ads",
      },
      {
        category: "Tracking & Analytics",
        items: "GTM, GA4, Conversions API, Consent Mode, Looker Studio",
      },
      {
        category: "Technical & Tools",
        items: "Conversion-tracking implementation, Channable feeds, website design & development, AI workflow automation (ClickUp, n8n)",
      },
      {
        category: "Languages",
        items: "Dutch (native), English (fluent)",
      },
    ],
    education: [
      {
        degree: "Secondary Diploma — Accountancy & IT",
        location: "Belgium",
        note: "Self-taught across Google Ads, conversion tracking, full-stack web development and SaaS product building.",
      },
    ],
  };
}

// --- jsPDF colour helpers ---
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
const setText = (doc, hex) => doc.setTextColor(...hexToRgb(hex));
const setFill = (doc, hex) => doc.setFillColor(...hexToRgb(hex));
const setDraw = (doc, hex) => doc.setDrawColor(...hexToRgb(hex));

// --- PDF rendering ---
function renderPDF(doc, data, sp) {
  let y = MARGIN;

  // Name
  y += sp.nameFontSize * 0.86;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(sp.nameFontSize);
  setText(doc, INDIGO);
  doc.text(data.name, MARGIN, y);

  // Headline
  y += sp.lineHeight + 1;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(sp.headlineFontSize);
  setText(doc, PURPLE);
  doc.text(data.headline, MARGIN, y);

  // Contact line
  y += sp.lineHeight - 1;
  doc.setFontSize(sp.smallFontSize);
  setText(doc, MUTED);
  const contact = [data.contact.location, data.contact.email, data.contact.website]
    .filter(Boolean)
    .join("    |    ");
  doc.text(contact, MARGIN, y);

  // Purple -> amber accent rule
  y += 8;
  const split = MARGIN + CONTENT_W * 0.62;
  doc.setLineWidth(2);
  setDraw(doc, PURPLE);
  doc.line(MARGIN, y, split, y);
  setDraw(doc, AMBER);
  doc.line(split, y, MARGIN + CONTENT_W, y);

  // Summary
  y += sp.lineHeight + 1;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(sp.bodyFontSize);
  setText(doc, INK);
  const summaryLines = doc.splitTextToSize(data.summary, CONTENT_W);
  for (let i = 0; i < summaryLines.length; i++) {
    doc.text(summaryLines[i], MARGIN, y);
    if (i < summaryLines.length - 1) y += sp.lineHeight;
  }

  // Section header helper
  function sectionHeader(title) {
    y += sp.sectionGap + sp.sectionFontSize;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(sp.sectionFontSize);
    setText(doc, INDIGO);
    doc.text(title.toUpperCase(), MARGIN, y);
    y += 4.5;
    doc.setLineWidth(0.6);
    setDraw(doc, HAIR);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  }

  // Bullet helper
  function bullet(text) {
    y += sp.bulletGap + sp.lineHeight;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(sp.bodyFontSize);
    const tx = MARGIN + 12;
    const lines = doc.splitTextToSize(text, CONTENT_W - 12);
    for (let i = 0; i < lines.length; i++) {
      if (i === 0) {
        setFill(doc, PURPLE);
        doc.rect(MARGIN + 1, y - 3.4, 2.8, 2.8, "F");
      }
      setText(doc, INK);
      doc.text(lines[i], tx, y);
      if (i < lines.length - 1) y += sp.lineHeight;
    }
  }

  // Experience
  sectionHeader("Experience");
  data.roles.forEach((role, idx) => {
    y += (idx === 0 ? sp.roleGap : sp.roleGap + 2) + sp.lineHeight;
    // Title (left) + dates (right)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(sp.bodyFontSize + 0.5);
    setText(doc, INK);
    doc.text(role.title, MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(sp.smallFontSize);
    setText(doc, MUTED);
    doc.text(role.dates, MARGIN + CONTENT_W, y, { align: "right" });
    // Company line
    y += sp.lineHeight - 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(sp.smallFontSize);
    setText(doc, PURPLE);
    doc.text(role.company, MARGIN, y);
    // Bullets
    role.bullets.forEach((b) => bullet(b));
  });

  // Skills
  sectionHeader("Skills");
  data.skills.forEach((row) => {
    y += sp.bulletGap + sp.lineHeight;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(sp.bodyFontSize);
    setText(doc, INDIGO);
    const label = row.category + ":  ";
    doc.text(label, MARGIN, y);
    const lw = doc.getTextWidth(label);
    doc.setFont("helvetica", "normal");
    setText(doc, INK);
    const indent = MARGIN + lw;
    const lines = doc.splitTextToSize(row.items, CONTENT_W - lw);
    for (let i = 0; i < lines.length; i++) {
      doc.text(lines[i], indent, y);
      if (i < lines.length - 1) y += sp.lineHeight;
    }
  });

  // Education
  sectionHeader("Education");
  data.education.forEach((ed) => {
    y += sp.roleGap + sp.lineHeight;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(sp.bodyFontSize + 0.5);
    setText(doc, INK);
    doc.text(ed.degree, MARGIN, y);
    if (ed.location) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(sp.smallFontSize);
      setText(doc, MUTED);
      doc.text(ed.location, MARGIN + CONTENT_W, y, { align: "right" });
    }
    if (ed.note) {
      y += sp.lineHeight - 1;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(sp.smallFontSize);
      setText(doc, MUTED);
      const lines = doc.splitTextToSize(ed.note, CONTENT_W);
      for (let i = 0; i < lines.length; i++) {
        doc.text(lines[i], MARGIN, y);
        if (i < lines.length - 1) y += sp.lineHeight;
      }
    }
  });

  return y;
}

// --- DOCX rendering ---
const ptToHalfPt = (pt) => Math.round(pt * 2);
const ptToTwip = (pt) => Math.round(pt * 20);

function buildDocx(data) {
  const children = [];

  // Name
  children.push(
    new Paragraph({
      spacing: { after: ptToTwip(2) },
      children: [
        new TextRun({ text: data.name, bold: true, size: ptToHalfPt(22), color: "29274E" }),
      ],
    }),
  );
  // Headline
  children.push(
    new Paragraph({
      spacing: { after: ptToTwip(2) },
      children: [new TextRun({ text: data.headline, size: ptToHalfPt(11), color: "716BEB" })],
    }),
  );
  // Contact + accent border
  children.push(
    new Paragraph({
      spacing: { after: ptToTwip(8) },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: "716BEB", space: 4 } },
      children: [
        new TextRun({
          text: [data.contact.location, data.contact.email, data.contact.website]
            .filter(Boolean)
            .join("    |    "),
          size: ptToHalfPt(9),
          color: "6B6B72",
        }),
      ],
    }),
  );
  // Summary
  children.push(
    new Paragraph({
      spacing: { after: ptToTwip(4) },
      children: [new TextRun({ text: data.summary, size: ptToHalfPt(10.5), color: "1A1A22" })],
    }),
  );

  const sectionHeader = (title) =>
    new Paragraph({
      spacing: { before: ptToTwip(10), after: ptToTwip(5) },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "E4E2EE", space: 3 } },
      children: [
        new TextRun({
          text: title.toUpperCase(),
          bold: true,
          size: ptToHalfPt(10.5),
          color: "29274E",
          characterSpacing: 12,
        }),
      ],
    });

  const tabRight = ptToTwip(CONTENT_W);

  // Experience
  children.push(sectionHeader("Experience"));
  data.roles.forEach((role) => {
    children.push(
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: tabRight }],
        spacing: { before: ptToTwip(6), after: ptToTwip(0) },
        children: [
          new TextRun({ text: role.title, bold: true, size: ptToHalfPt(11), color: "1A1A22" }),
          new TextRun({ text: "\t" + role.dates, size: ptToHalfPt(9), color: "6B6B72" }),
        ],
      }),
    );
    children.push(
      new Paragraph({
        spacing: { after: ptToTwip(2) },
        children: [new TextRun({ text: role.company, size: ptToHalfPt(9), color: "716BEB" })],
      }),
    );
    role.bullets.forEach((b) => {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: ptToTwip(2) },
          children: [new TextRun({ text: b, size: ptToHalfPt(10.5), color: "1A1A22" })],
        }),
      );
    });
  });

  // Skills
  children.push(sectionHeader("Skills"));
  data.skills.forEach((row) => {
    children.push(
      new Paragraph({
        spacing: { after: ptToTwip(2) },
        children: [
          new TextRun({ text: row.category + ":  ", bold: true, size: ptToHalfPt(10.5), color: "29274E" }),
          new TextRun({ text: row.items, size: ptToHalfPt(10.5), color: "1A1A22" }),
        ],
      }),
    );
  });

  // Education
  children.push(sectionHeader("Education"));
  data.education.forEach((ed) => {
    children.push(
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: tabRight }],
        spacing: { before: ptToTwip(4), after: ptToTwip(0) },
        children: [
          new TextRun({ text: ed.degree, bold: true, size: ptToHalfPt(11), color: "1A1A22" }),
          ...(ed.location
            ? [new TextRun({ text: "\t" + ed.location, size: ptToHalfPt(9), color: "6B6B72" })]
            : []),
        ],
      }),
    );
    if (ed.note) {
      children.push(
        new Paragraph({
          spacing: { after: ptToTwip(2) },
          children: [new TextRun({ text: ed.note, size: ptToHalfPt(9), color: "6B6B72" })],
        }),
      );
    }
  });

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: ptToTwip(PAGE_W), height: ptToTwip(PAGE_H) },
            margin: {
              top: ptToTwip(MARGIN),
              bottom: ptToTwip(MARGIN),
              left: ptToTwip(MARGIN),
              right: ptToTwip(MARGIN),
            },
          },
        },
        children,
      },
    ],
  });
}

// --- Auto-fit + generate ---
async function main() {
  const data = getResumeData();
  const outDir = path.resolve(import.meta.dirname, "..", "..", "..", "outputs");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // Measure, then adjust spacing to comfortably fill (or compress to fit) one page.
  let spacing = { ...BASE_SPACING };
  let finalY = renderPDF(new jsPDF({ unit: "pt", format: "letter" }), data, spacing);

  // Compress if overflow.
  let guard = 0;
  while (finalY > TARGET_Y && guard < 40) {
    spacing.lineHeight = Math.max(11.5, spacing.lineHeight - 0.3);
    spacing.sectionGap = Math.max(6, spacing.sectionGap - 0.6);
    spacing.roleGap = Math.max(4, spacing.roleGap - 0.4);
    spacing.bulletGap = Math.max(2, spacing.bulletGap - 0.2);
    finalY = renderPDF(new jsPDF({ unit: "pt", format: "letter" }), data, spacing);
    guard++;
  }
  // Expand to fill if there is meaningful slack.
  guard = 0;
  while (TARGET_Y - finalY > 14 && guard < 60) {
    spacing.sectionGap += 0.8;
    spacing.roleGap += 0.6;
    spacing.bulletGap += 0.25;
    spacing.lineHeight += 0.12;
    finalY = renderPDF(new jsPDF({ unit: "pt", format: "letter" }), data, spacing);
    guard++;
  }

  // Final PDF
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  finalY = renderPDF(doc, data, spacing);
  const pdfPath = path.join(outDir, "Axel-Saerens-resume.pdf");
  fs.writeFileSync(pdfPath, Buffer.from(doc.output("arraybuffer")));

  // DOCX
  const docxBuffer = await Packer.toBuffer(buildDocx(data));
  const docxPath = path.join(outDir, "Axel-Saerens-resume.docx");
  fs.writeFileSync(docxPath, docxBuffer);

  // JSON
  const jsonPath = path.join(outDir, "resume-data.json");
  fs.writeFileSync(jsonPath, JSON.stringify({ ...data, spacing }, null, 2));

  console.log("WROTE", pdfPath, "(finalY", Math.round(finalY), "/", TARGET_Y, ")");
  console.log("WROTE", docxPath);
  console.log("WROTE", jsonPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
