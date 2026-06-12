import { describe, it, expect } from "vitest";
import { buildMime } from "./email";

/** Pull the header block (everything before the first blank line) out of a MIME. */
function headerBlock(mime: string): string {
  return mime.split("\r\n\r\n")[0] ?? "";
}

describe("buildMime", () => {
  it("builds From (ASCII name -> quoted-string), To and Cc headers", () => {
    const { mime } = buildMime({
      to: "client@example.com",
      cc: "owner@saerensadvertising.com",
      fromAddress: "paidmedia@saerensadvertising.com",
      fromName: "Sven - Head of Paid Media, Saerens Advertising",
      subject: "Maandrapport",
      html: "<p>hi</p>",
    });
    const head = headerBlock(mime);
    expect(head).toContain(
      'From: "Sven - Head of Paid Media, Saerens Advertising" <paidmedia@saerensadvertising.com>',
    );
    expect(head).toContain("To: client@example.com");
    expect(head).toContain("Cc: owner@saerensadvertising.com");
  });

  it("RFC 2047-encodes a non-ASCII From display name", () => {
    const { mime } = buildMime({
      to: "client@example.com",
      fromAddress: "paidmedia@saerensadvertising.com",
      fromName: "Sven — Head of Paid Media", // em dash is non-ASCII
      subject: "x",
      html: "y",
    });
    expect(headerBlock(mime)).toMatch(
      /From: =\?UTF-8\?B\?.+\?= <paidmedia@saerensadvertising\.com>/,
    );
  });

  it("always stamps a Message-ID, and reuses a supplied one", () => {
    const generated = buildMime({
      to: "client@example.com",
      fromAddress: "paidmedia@saerensadvertising.com",
      subject: "x",
      html: "y",
    });
    expect(generated.messageId).toMatch(/^<.+@saerensadvertising\.com>$/);
    expect(headerBlock(generated.mime)).toContain(
      `Message-ID: ${generated.messageId}`,
    );

    const supplied = buildMime({
      to: "client@example.com",
      subject: "x",
      html: "y",
      messageId: "<fixed-123@saerensadvertising.com>",
    });
    expect(supplied.messageId).toBe("<fixed-123@saerensadvertising.com>");
  });

  it("adds threading headers for a reply", () => {
    const { mime } = buildMime({
      to: "client@example.com",
      subject: "Re: Maandrapport",
      html: "y",
      inReplyTo: "<abc@mail.gmail.com>",
      references: "<first@x.com> <abc@mail.gmail.com>",
    });
    const head = headerBlock(mime);
    expect(head).toContain("In-Reply-To: <abc@mail.gmail.com>");
    expect(head).toContain("References: <first@x.com> <abc@mail.gmail.com>");
  });

  it("rejects a recipient with header-injection characters", () => {
    expect(() =>
      buildMime({
        to: "a@b.com\r\nBcc: evil@x.com",
        subject: "x",
        html: "y",
      }),
    ).toThrow(/Ongeldig e-mailadres/);
  });

  it("neutralises a CRLF-injection attempt inside the display name", () => {
    const { mime } = buildMime({
      to: "client@example.com",
      fromAddress: "paidmedia@saerensadvertising.com",
      fromName: "Evil\r\nBcc: evil@x.com",
      subject: "x",
      html: "y",
    });
    // The newline is stripped, so no smuggled Bcc header can appear on its own line.
    expect(mime).not.toMatch(/\r\nBcc:/i);
  });

  it("RFC 2047-encodes a non-ASCII subject", () => {
    const { mime } = buildMime({
      to: "client@example.com",
      subject: "Resultaten — sterke groei",
      html: "y",
    });
    expect(headerBlock(mime)).toMatch(/Subject: =\?UTF-8\?B\?/);
  });
});
