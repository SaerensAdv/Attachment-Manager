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

  it("keeps a plain (no inline image) body as multipart/mixed", () => {
    const { mime } = buildMime({
      to: "client@example.com",
      subject: "x",
      html: "<p>hi</p>",
    });
    expect(headerBlock(mime)).toContain("Content-Type: multipart/mixed;");
    expect(mime).not.toContain("multipart/related");
    expect(mime).not.toContain("Content-ID:");
  });

  it("embeds an inline image as a multipart/related with a Content-ID", () => {
    const { mime } = buildMime({
      to: "client@example.com",
      subject: "x",
      html: '<img src="cid:head-portrait">',
      inlineImages: [
        { cid: "head-portrait", mimeType: "image/png", content: Buffer.from("PNG") },
      ],
    });
    // No PDF: the whole message is a single multipart/related (with the RFC 2387
    // type param so Gmail links the cid image to the HTML when re-hosting on send).
    expect(headerBlock(mime)).toContain("Content-Type: multipart/related;");
    expect(headerBlock(mime)).toContain('type="text/html"');
    expect(mime).toContain("Content-ID: <head-portrait>");
    // A named inline part survives Gmail's send-time re-hosting (bare cid parts
    // render in the draft but break after send).
    expect(mime).toContain('Content-Disposition: inline; filename="head-portrait.png"');
    expect(mime).toContain('Content-Type: image/png; name="head-portrait.png"');
    // The image bytes ride along base64-encoded.
    expect(mime).toContain(Buffer.from("PNG").toString("base64"));
  });

  it("strips angle brackets/quotes from a supplied Content-ID", () => {
    const { mime } = buildMime({
      to: "client@example.com",
      subject: "x",
      html: "y",
      inlineImages: [
        { cid: '<ev"il>', mimeType: "image/png", content: Buffer.from("z") },
      ],
    });
    expect(mime).toContain("Content-ID: <evil>");
  });

  it("nests inline image + PDF as mixed{ related{ html, img }, pdf }", () => {
    const { mime } = buildMime({
      to: "client@example.com",
      subject: "x",
      html: '<img src="cid:head-portrait">',
      inlineImages: [
        { cid: "head-portrait", mimeType: "image/png", content: Buffer.from("IMG") },
      ],
      attachments: [
        { filename: "rapport.pdf", mimeType: "application/pdf", content: Buffer.from("PDF") },
      ],
    });
    // Outer container is mixed; an inner related part carries the html + image.
    expect(headerBlock(mime)).toContain("Content-Type: multipart/mixed;");
    expect(mime).toContain("Content-Type: multipart/related;");
    expect(mime).toContain("Content-ID: <head-portrait>");
    // The PDF stays a normal attachment alongside the related block.
    expect(mime).toContain('Content-Disposition: attachment; filename="rapport.pdf"');

    // The outer boundary must NOT be a prefix of the inner one, or a lenient
    // parser matching delimiters with startsWith would truncate at the first
    // inner delimiter.
    const outer = headerBlock(mime).match(/boundary="([^"]+)"/)?.[1];
    const inner = mime.match(/multipart\/related;[^\r\n]*boundary="([^"]+)"/)?.[1];
    expect(outer).toBeTruthy();
    expect(inner).toBeTruthy();
    expect(inner).not.toBe(outer);
    expect(inner!.startsWith(outer!)).toBe(false);
  });
});
