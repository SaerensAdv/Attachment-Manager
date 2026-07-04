import { describe, it, expect } from "vitest";
import {
  extractAgentSection,
  extractInternalWorklist,
  splitReportDeliverables,
  stripAgentSection,
  toClientFacingReport,
} from "./generation-text";

const CLIENT_SECTIONS = [
  "## Kerncijfers in één oogopslag",
  "",
  "Organische klikken: 1.240 (+8% t.o.v. vorige maand).",
  "",
  "## Hoogtepunten van de maand",
  "",
  "Meer mensen vonden je via lokale zoekopdrachten.",
  "",
  "## Waar we komende maand op focussen",
  "",
  "Snellere productpagina's zodat bezoekers minder afhaken.",
  "",
  "## Top zoektermen",
  "",
  "- carkit inbouwen (312 klikken)",
].join("\n");

const WORKLIST_SECTION = [
  "## Interne werklijst (niet voor de klant)",
  "",
  "### Technisch",
  "",
  "- Title tag /producten herschrijven (nu 71 tekens, doel <60).",
  "- FAQ-schema toevoegen op de 3 servicepagina's.",
  "",
  "### Core Web Vitals",
  "",
  "- LCP verlagen naar <2,5s (nu 3,8s).",
  "- Menselijke goedkeuring vereist voor 301-redirects.",
].join("\n");

describe("extractInternalWorklist", () => {
  it("captures the internal werklijst section with its nested subheadings", () => {
    const report = `${CLIENT_SECTIONS}\n\n${WORKLIST_SECTION}\n`;
    const worklist = extractInternalWorklist(report);
    expect(worklist).toContain("Interne werklijst (niet voor de klant)");
    expect(worklist).toContain("### Technisch");
    expect(worklist).toContain("### Core Web Vitals");
    expect(worklist).toContain("Title tag /producten herschrijven");
    expect(worklist).toContain("LCP verlagen naar <2,5s");
    // Nested subheadings must stay attached — the section ends only at the next
    // heading of the same or higher level (there is none here).
    expect(worklist).not.toContain("Kerncijfers");
    expect(worklist).not.toContain("carkit inbouwen");
  });

  it("stops the internal section at the next heading of the same or higher level", () => {
    const report = [
      WORKLIST_SECTION,
      "",
      "## Bijlage (voor de klant)",
      "",
      "Deze bijlage hoort NIET in de werklijst.",
    ].join("\n");
    const worklist = extractInternalWorklist(report);
    expect(worklist).toContain("FAQ-schema toevoegen");
    expect(worklist).not.toContain("Deze bijlage hoort NIET in de werklijst");
  });

  it("joins multiple internal sections with a horizontal rule", () => {
    const report = [
      "## Interne nota's (niet voor de klant)",
      "",
      "Eerste interne blok.",
      "",
      "## Zichtbare sectie",
      "",
      "Klantinhoud.",
      "",
      "## Interne werklijst (niet voor de klant)",
      "",
      "Tweede interne blok.",
    ].join("\n");
    const worklist = extractInternalWorklist(report);
    expect(worklist).toContain("Eerste interne blok");
    expect(worklist).toContain("Tweede interne blok");
    expect(worklist).not.toContain("Klantinhoud");
    expect(worklist).toContain("---");
  });

  it("does NOT capture placeholder-only or non-internal sections", () => {
    const report = [
      "## Nog aan te vullen",
      "",
      "[AAN TE VULLEN]",
      "",
      "## Hoogtepunten van de maand",
      "",
      "Echte klantinhoud.",
    ].join("\n");
    expect(extractInternalWorklist(report)).toBe("");
  });

  it("skips an internal section that is empty or a bare placeholder stub", () => {
    const report = [
      "## Interne werklijst (niet voor de klant)",
      "",
      "[AAN TE VULLEN]",
    ].join("\n");
    expect(extractInternalWorklist(report)).toBe("");
  });

  it("returns an empty string when there is no internal section", () => {
    expect(extractInternalWorklist(CLIENT_SECTIONS)).toBe("");
  });
});

describe("toClientFacingReport client-leak regression", () => {
  it("strips the internal werklijst so no technical detail reaches the client", () => {
    const report = `${CLIENT_SECTIONS}\n\n${WORKLIST_SECTION}\n`;
    const client = toClientFacingReport(report);
    // The four client sections survive.
    expect(client).toContain("Kerncijfers in één oogopslag");
    expect(client).toContain("Top zoektermen");
    // None of the technical/internal detail leaks through.
    expect(client).not.toContain("Interne werklijst");
    expect(client).not.toContain("Title tag");
    expect(client).not.toContain("FAQ-schema");
    expect(client).not.toContain("LCP verlagen");
    expect(client).not.toContain("301-redirects");
  });

  it("client report and internal worklist are complementary and disjoint", () => {
    const report = `${CLIENT_SECTIONS}\n\n${WORKLIST_SECTION}\n`;
    const client = toClientFacingReport(report);
    const worklist = extractInternalWorklist(report);
    expect(client.length).toBeGreaterThan(0);
    expect(worklist.length).toBeGreaterThan(0);
    // The technical action lives ONLY in the worklist.
    expect(worklist).toContain("Title tag /producten herschrijven");
    expect(client).not.toContain("Title tag /producten herschrijven");
  });
});

describe("toClientFacingReport cover/signature/meta de-duplication", () => {
  it("drops a leading heading that restates the cover title but keeps the body", () => {
    const report = [
      "## Maandelijks SEO-rapport — juni 2026",
      "",
      "## Kerncijfers in één oogopslag",
      "",
      "Organische klikken stegen met 25%.",
    ].join("\n");
    const client = toClientFacingReport(report);
    expect(client).not.toContain("Maandelijks SEO-rapport — juni 2026");
    expect(client).toContain("Kerncijfers in één oogopslag");
    expect(client).toContain("Organische klikken stegen met 25%.");
  });

  it("drops the leading 'Rapportage — …' title restatement", () => {
    const report = [
      "## Rapportage — Maandelijks SEO/websiterapport Waterlek (juni 2026)",
      "",
      "Juni was een positieve maand.",
    ].join("\n");
    const client = toClientFacingReport(report);
    expect(client).not.toContain("Rapportage —");
    expect(client).toContain("Juni was een positieve maand.");
  });

  it("keeps a first heading that is NOT a title restatement", () => {
    const report = ["## Kerncijfers in één oogopslag", "", "245 klikken."].join(
      "\n",
    );
    const client = toClientFacingReport(report);
    expect(client).toContain("Kerncijfers in één oogopslag");
  });

  it("strips leading blockquote attribution / period / author meta", () => {
    const report = [
      "> Reporting Specialist — Bram",
      "> Dit is de klantgerichte sectie van het maandrapport. De interne werklijst staat onderaan.",
      "> Rapportperiode: juni 2026 | Vergelijking: mei 2026 | Opgesteld door: Axel Saerens",
      "",
      "## Kerncijfers in één oogopslag",
      "",
      "245 klikken.",
    ].join("\n");
    const client = toClientFacingReport(report);
    expect(client).not.toContain("Reporting Specialist");
    expect(client).not.toContain("klantgerichte sectie");
    expect(client).not.toContain("Opgesteld door");
    expect(client).not.toContain("Rapportperiode");
    expect(client).toContain("Kerncijfers in één oogopslag");
    expect(client).toContain("245 klikken.");
  });

  it("strips the title restatement even when a meta blockquote precedes it", () => {
    const report = [
      "> Reporting Specialist — Bram",
      "> Rapportperiode: juni 2026 | Opgesteld door: Axel Saerens",
      "",
      "# Maandelijks SEO-rapport — juni 2026",
      "",
      "## Kerncijfers in één oogopslag",
      "",
      "245 klikken.",
    ].join("\n");
    const client = toClientFacingReport(report);
    expect(client).not.toContain("Reporting Specialist");
    expect(client).not.toContain("Opgesteld door");
    expect(client).not.toContain("Maandelijks SEO-rapport");
    expect(client).toContain("Kerncijfers in één oogopslag");
    expect(client).toContain("245 klikken.");
  });

  it("does not strip a genuine (non-meta) blockquote in client prose", () => {
    const report = [
      "## Kerncijfers in één oogopslag",
      "",
      "> Belangrijkste inzicht: de branded zoektermen groeien sterk.",
      "",
      "245 klikken.",
    ].join("\n");
    const client = toClientFacingReport(report);
    expect(client).toContain("Belangrijkste inzicht");
  });

  it("truncates a trailing sign-off block (signature lives in the e-mail)", () => {
    const report = [
      "## Kerncijfers in één oogopslag",
      "",
      "245 klikken.",
      "",
      "Met vriendelijke groeten,",
      "",
      "Axel Saerens",
      "Saerens Advertising",
      "axel@saerensadvertising.com | saerensadvertising.com",
    ].join("\n");
    const client = toClientFacingReport(report);
    expect(client).toContain("245 klikken.");
    expect(client).not.toContain("Met vriendelijke groeten");
    expect(client).not.toContain("Axel Saerens");
    expect(client).not.toContain("axel@saerensadvertising.com");
  });

  it("does not truncate prose that merely mentions a greeting mid-sentence", () => {
    const report = [
      "## Kerncijfers in één oogopslag",
      "",
      "We sturen met vriendelijke groeten een overzicht van de resultaten.",
    ].join("\n");
    const client = toClientFacingReport(report);
    expect(client).toContain("overzicht van de resultaten");
  });
});

describe("extractInternalWorklist QC-meta narrowing", () => {
  it("does NOT capture the reviewer's approval/QC section as werklijst", () => {
    const report = [
      "## QA & Compliance — interne controle",
      "",
      "Het rapport is inhoudelijk akkoord.",
      "",
      "## Menselijke goedkeuring vereist",
      "",
      "- Goedkeuring nodig voor 301-redirects.",
    ].join("\n");
    // The broad strip still keeps QC meta out of the client report...
    const client = toClientFacingReport(report);
    expect(client).not.toContain("Menselijke goedkeuring vereist");
    // ...but the werklijst capture must NOT pull QC/approval commentary in.
    expect(extractInternalWorklist(report)).toBe("");
  });
});

describe("extractAgentSection", () => {
  const TEAM = [
    "## Reporting Specialist",
    "",
    "## Kerncijfers in één oogopslag",
    "",
    "Organische klikken: 1.240.",
    "",
    "## Interne werklijst (niet voor de klant)",
    "",
    "- Lead werklijst-item.",
    "",
    "## SEO Specialist",
    "",
    "## SEO-analyse en aanbevelingen",
    "",
    "Mijn bijdrage is technisch.",
  ].join("\n");

  it("returns the LEAD's bounded section, not the trailing member sections", () => {
    const lead = extractAgentSection(TEAM, "Reporting Specialist", [
      "Reporting Specialist",
      "SEO Specialist",
    ]);
    expect(lead).toContain("Kerncijfers in één oogopslag");
    expect(lead).toContain("Lead werklijst-item");
    // Stops at the next member heading.
    expect(lead).not.toContain("SEO-analyse en aanbevelingen");
    expect(lead).not.toContain("Mijn bijdrage is technisch");
  });

  it("returns '' when the requested agent heading is absent", () => {
    expect(extractAgentSection(TEAM, "Copywriter", ["SEO Specialist"])).toBe("");
  });
});

describe("stripAgentSection", () => {
  it("removes a named section (heading + body) up to the next agent boundary", () => {
    const doc = [
      "## Reporting Specialist",
      "",
      "Klantinhoud.",
      "",
      "## Redacteur",
      "",
      "Gehumaniseerde versie.",
    ].join("\n");
    const stripped = stripAgentSection(doc, "Redacteur", [
      "Reporting Specialist",
      "Redacteur",
    ]);
    expect(stripped).toContain("Klantinhoud");
    expect(stripped).not.toContain("Redacteur");
    expect(stripped).not.toContain("Gehumaniseerde versie");
  });

  it("removes the whole section to EOF even when its body has its own H2s", () => {
    // The Humanizer's rewrite legitimately contains H2 sections and may even
    // preserve a "## Interne werklijst" verbatim; stripping must not stop at the
    // first arbitrary H2 and leave that body (a duplicate werklijst) behind.
    const doc = [
      "## Reporting Specialist",
      "",
      "Klantinhoud.",
      "",
      "## Interne werklijst (niet voor de klant)",
      "",
      "- Title tag /producten herschrijven.",
      "",
      "## Redacteur",
      "",
      "## Kerncijfers in één oogopslag",
      "",
      "Vlot leesbaar gemaakt.",
      "",
      "## Interne werklijst (niet voor de klant)",
      "",
      "- Title tag /producten herschrijven.",
    ].join("\n");
    const stripped = stripAgentSection(doc, "Redacteur", [
      "Reporting Specialist",
      "Redacteur",
    ]);
    // The lead's single werklijst survives exactly once; the Humanizer's whole
    // section (including its duplicated werklijst) is gone.
    expect(stripped).toContain("Klantinhoud");
    expect(
      stripped.match(/Title tag \/producten herschrijven/g)?.length,
    ).toBe(1);
    expect(stripped).not.toContain("Redacteur");
    expect(stripped).not.toContain("Vlot leesbaar gemaakt");
  });

  it("returns the text unchanged when the heading is absent", () => {
    const doc = "## Reporting Specialist\n\nKlantinhoud.";
    expect(
      stripAgentSection(doc, "Redacteur", ["Reporting Specialist", "Redacteur"]),
    ).toBe(doc.trim());
  });
});

describe("splitReportDeliverables", () => {
  // Mirrors the real multi-contributor structure that caused the split bug:
  // the LEAD (Reporting Specialist) owns the client report + its werklijst; a
  // later member (SEO Specialist) adds a junk preamble + a werklijst addendum;
  // the reviewer appends a QC/approval section that must reach NEITHER PDF.
  const TEAM = [
    "## Reporting Specialist",
    "",
    CLIENT_SECTIONS,
    "",
    "## Interne werklijst (niet voor de klant)",
    "",
    "### Technisch",
    "",
    "- Title tag /producten herschrijven (lead).",
    "",
    "## SEO Specialist",
    "",
    "## SEO-analyse en aanbevelingen",
    "",
    "De klantrapportage is al afgerond; mijn bijdrage is louter technisch.",
    "",
    "## Interne werklijst (niet voor de klant) — aanvulling SEO Specialist",
    "",
    "### Core Web Vitals",
    "",
    "- LCP verlagen naar <2,5s (SEO).",
    "",
    "## QA & Compliance — interne controle",
    "",
    "Rapport is akkoord.",
    "",
    "## Menselijke goedkeuring vereist",
    "",
    "- Goedkeuring nodig voor 301-redirects.",
  ].join("\n");

  it("client report = only the lead's client sections (no preamble, no internal)", () => {
    const { clientReport } = splitReportDeliverables(TEAM, {
      memberTitles: ["Reporting Specialist", "SEO Specialist"],
      humanizerTitle: "",
      humanizerRan: false,
    });
    expect(clientReport).toContain("Kerncijfers in één oogopslag");
    expect(clientReport).toContain("Top zoektermen");
    // The SEO Specialist's stray preamble must not surface to the client.
    expect(clientReport).not.toContain("SEO-analyse en aanbevelingen");
    expect(clientReport).not.toContain("louter technisch");
    // No internal/technical content leaks.
    expect(clientReport).not.toContain("Interne werklijst");
    expect(clientReport).not.toContain("Title tag /producten herschrijven");
    expect(clientReport).not.toContain("LCP verlagen");
  });

  it("internal werklijst = BOTH members' sections, never the QC/approval meta", () => {
    const { internalWorklist } = splitReportDeliverables(TEAM, {
      memberTitles: ["Reporting Specialist", "SEO Specialist"],
      humanizerTitle: "",
      humanizerRan: false,
    });
    expect(internalWorklist).not.toBeNull();
    // Both the lead's AND the later member's werklijst are captured.
    expect(internalWorklist).toContain("Title tag /producten herschrijven (lead)");
    expect(internalWorklist).toContain("LCP verlagen naar <2,5s (SEO)");
    // The reviewer's QC/approval section is NOT part of the werklijst.
    expect(internalWorklist).not.toContain("Menselijke goedkeuring vereist");
    expect(internalWorklist).not.toContain("301-redirects");
    // Client content stays out of the werklijst.
    expect(internalWorklist).not.toContain("Kerncijfers in één oogopslag");
  });

  it("prefers the Humanizer's rewrite for the client report when it ran", () => {
    const withHumanizer = [
      TEAM,
      "",
      "## Redacteur",
      "",
      "## Kerncijfers in één oogopslag",
      "",
      "Deze maand vonden meer mensen je website via Google: 1.240 organische klikken, vlot leesbaar gemaakt voor de klant. Dat is 8% meer dan de maand ervoor en een mooie stap vooruit.",
      "",
      "## Hoogtepunten van de maand",
      "",
      "Vooral je lokale zoekopdrachten deden het goed; bezoekers uit de buurt vonden je makkelijker terug.",
      "",
      "## Top zoektermen",
      "",
      "- carkit inbouwen (312 klikken)",
    ].join("\n");
    const { clientReport, internalWorklist } = splitReportDeliverables(
      withHumanizer,
      {
        memberTitles: ["Reporting Specialist", "SEO Specialist"],
        humanizerTitle: "Redacteur",
        humanizerRan: true,
      },
    );
    expect(clientReport).toContain("vlot leesbaar gemaakt");
    // The werklijst still comes from the members, captured exactly once.
    expect(internalWorklist).toContain("Title tag /producten herschrijven (lead)");
    expect(internalWorklist).toContain("LCP verlagen naar <2,5s (SEO)");
  });

  it("keeps a SHORT humanizer rewrite bounded — no whole-draft spill, no QC leak, no duplicate werklijst", () => {
    // The Humanizer's rewrite is deliberately short (<200 chars) AND preserves a
    // "## Interne werklijst" verbatim; a trailing reviewer block follows in the
    // archived text. The client report must be ONLY the humanizer's client prose
    // (not the whole draft via a length fallback), and the werklijst must come
    // from the members exactly once (never doubled by the preserved copy), with
    // the reviewer's QC/approval meta reaching neither deliverable.
    const withShortHumanizer = [
      TEAM,
      "",
      "## Redacteur",
      "",
      "## Kerncijfers in één oogopslag",
      "",
      "1.240 klikken, vlot leesbaar gemaakt.",
      "",
      "## Interne werklijst (niet voor de klant)",
      "",
      "- Title tag /producten herschrijven (lead)",
      "",
      "## QA & Compliance — interne controle",
      "",
      "## Menselijke goedkeuring vereist",
      "",
      "Rapport is akkoord — reviewer-only tekst.",
    ].join("\n");
    const { clientReport, internalWorklist } = splitReportDeliverables(
      withShortHumanizer,
      {
        memberTitles: ["Reporting Specialist", "SEO Specialist"],
        humanizerTitle: "Redacteur",
        humanizerRan: true,
      },
    );
    // Client gets the humanizer's short prose, not the whole team draft.
    expect(clientReport).toContain("vlot leesbaar gemaakt");
    expect(clientReport).not.toContain("SEO-analyse"); // no SEO preamble spill
    expect(clientReport).not.toContain("reviewer-only tekst"); // no QC spill
    expect(clientReport).not.toContain("Interne werklijst"); // internal stays out
    // Werklijst from the members, captured exactly once (preserved copy dropped).
    expect(internalWorklist).toContain("Title tag /producten herschrijven (lead)");
    expect(
      internalWorklist?.match(/Title tag \/producten herschrijven \(lead\)/g)
        ?.length,
    ).toBe(1);
    // Reviewer QC/approval meta never bleeds into the werklijst either.
    expect(internalWorklist).not.toContain("reviewer-only tekst");
  });
});
