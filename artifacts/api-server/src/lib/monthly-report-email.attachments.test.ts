import { describe, it, expect } from "vitest";
import {
  attachmentIntro,
  headerLogo,
  buildBrandedEmail,
} from "./monthly-report-email";

describe("attachmentIntro (nl-BE pluralisation)", () => {
  it("uses the singular for one (or an unknown) attachment", () => {
    expect(attachmentIntro(1)).toBe(
      "Het volledige rapport vind je in de bijgevoegde PDF.",
    );
    expect(attachmentIntro(undefined)).toBe(
      "Het volledige rapport vind je in de bijgevoegde PDF.",
    );
    expect(attachmentIntro(0)).toBe(
      "Het volledige rapport vind je in de bijgevoegde PDF.",
    );
  });

  it("uses the plural for more than one attachment (monthly + quarterly)", () => {
    expect(attachmentIntro(2)).toBe(
      "De volledige rapporten vind je in de bijgevoegde PDF's.",
    );
  });
});

describe("headerLogo", () => {
  it("renders nothing without a URL", () => {
    expect(headerLogo(undefined)).toBe("");
  });

  it("references the logo by absolute URL (no cid:)", () => {
    const html = headerLogo("https://app.saerens.com/api/brand/logo.png");
    expect(html).toContain(
      'src="https://app.saerens.com/api/brand/logo.png"',
    );
    expect(html).not.toContain("cid:");
  });
});

describe("buildBrandedEmail footer wording", () => {
  const base = {
    clientName: "Acme",
    eyebrow: "Maandrapport Google Ads",
    periodLabel: "juni 2026",
    dateLabel: "1 juli 2026",
    bodyText: "Hallo",
  };

  it("uses the plural sentence when more than one PDF is attached", () => {
    const html = buildBrandedEmail({ ...base, attachmentCount: 2 });
    expect(html).toContain("de bijgevoegde PDF's.");
    expect(html).not.toContain("in de bijgevoegde PDF.<br>");
  });

  it("uses the singular sentence for a single attachment", () => {
    const html = buildBrandedEmail({ ...base, attachmentCount: 1 });
    expect(html).toContain("Het volledige rapport vind je in de bijgevoegde PDF.");
  });

  it("embeds the logo by absolute URL when given, and omits it otherwise", () => {
    const withLogo = buildBrandedEmail({
      ...base,
      logoUrl: "https://app.saerens.com/api/brand/logo.png",
    });
    expect(withLogo).toContain(
      'src="https://app.saerens.com/api/brand/logo.png"',
    );
    expect(withLogo).not.toContain("cid:sa-logo");

    const withoutLogo = buildBrandedEmail(base);
    expect(withoutLogo).not.toContain("logo.png");
  });
});
