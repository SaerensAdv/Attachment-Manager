import { describe, it, expect } from "vitest";
import {
  parseEmailAddress,
  replySubject,
  inboundSkipReason,
  decodeBody,
  htmlToText,
  extractText,
} from "./email-inbound";

/** Encode text to the Gmail base64url body shape decodeBody expects. */
const b64url = (s: string) =>
  Buffer.from(s, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_");

describe("parseEmailAddress", () => {
  it("extracts the address from a Name <addr> header", () => {
    expect(parseEmailAddress("Jan Klant <jan@klant.be>")).toBe("jan@klant.be");
  });
  it("accepts a bare address and lowercases it", () => {
    expect(parseEmailAddress("Jan@Klant.BE")).toBe("jan@klant.be");
  });
  it("rejects a malformed value", () => {
    expect(parseEmailAddress("not-an-email")).toBeNull();
    expect(parseEmailAddress(null)).toBeNull();
  });
});

describe("replySubject", () => {
  it("prefixes Re: on a fresh subject", () => {
    expect(replySubject("Maandrapport mei")).toBe("Re: Maandrapport mei");
  });
  it("collapses repeated Re: prefixes", () => {
    expect(replySubject("Re: RE:  re: Vraag")).toBe("Re: Vraag");
  });
  it("handles an empty subject", () => {
    expect(replySubject("")).toBe("Re:");
  });
});

describe("inboundSkipReason", () => {
  const whitelistEmail = "jan@klant.be";
  const ownerAddress = "axel@saerensadvertising.com";

  const msg = (over: {
    id?: string;
    labelIds?: string[];
    from?: string;
    headers?: { name: string; value: string }[];
  }) => ({
    id: over.id ?? "m1",
    labelIds: over.labelIds ?? [],
    payload: {
      headers: over.headers ?? [
        { name: "From", value: over.from ?? "Jan <jan@klant.be>" },
      ],
    },
  });

  const base = {
    whitelistEmail,
    ownerAddress,
    alreadyProcessedId: null as string | null,
  };

  it("accepts a genuine inbound client reply (null reason)", () => {
    expect(inboundSkipReason({ ...base, message: msg({}) })).toBeNull();
  });

  it("skips our own sent/draft messages", () => {
    expect(
      inboundSkipReason({ ...base, message: msg({ labelIds: ["SENT"] }) }),
    ).toBe("own-message");
    expect(
      inboundSkipReason({ ...base, message: msg({ labelIds: ["DRAFT"] }) }),
    ).toBe("own-message");
  });

  it("skips a message already processed", () => {
    expect(
      inboundSkipReason({
        ...base,
        alreadyProcessedId: "m1",
        message: msg({ id: "m1" }),
      }),
    ).toBe("already-processed");
  });

  it("skips the CC'd owner's own messages", () => {
    expect(
      inboundSkipReason({
        ...base,
        message: msg({ from: `Axel <${ownerAddress}>` }),
      }),
    ).toBe("owner-message");
  });

  it("skips system senders (mailer-daemon, no-reply, postmaster)", () => {
    for (const from of [
      "Mail Delivery <mailer-daemon@google.com>",
      "no-reply@klant.be",
      "postmaster@klant.be",
    ]) {
      expect(inboundSkipReason({ ...base, message: msg({ from }) })).toBe(
        "system-sender",
      );
    }
  });

  it("skips auto-submitted and bulk mail", () => {
    expect(
      inboundSkipReason({
        ...base,
        message: msg({
          headers: [
            { name: "From", value: "Jan <jan@klant.be>" },
            { name: "Auto-Submitted", value: "auto-replied" },
          ],
        }),
      }),
    ).toBe("auto-submitted");
    expect(
      inboundSkipReason({
        ...base,
        message: msg({
          headers: [
            { name: "From", value: "Jan <jan@klant.be>" },
            { name: "Precedence", value: "bulk" },
          ],
        }),
      }),
    ).toBe("bulk");
  });

  it("enforces the strict sender whitelist (the loop/spoof guard)", () => {
    expect(
      inboundSkipReason({
        ...base,
        message: msg({ from: "Iemand anders <ander@elders.com>" }),
      }),
    ).toBe("not-whitelisted");
  });

  it("matches the whitelist case-insensitively", () => {
    expect(
      inboundSkipReason({ ...base, message: msg({ from: "JAN@KLANT.BE" }) }),
    ).toBeNull();
  });

  it("skips a message with no parseable From", () => {
    expect(
      inboundSkipReason({
        ...base,
        message: msg({ headers: [{ name: "Subject", value: "x" }] }),
      }),
    ).toBe("no-from");
  });
});

describe("decodeBody", () => {
  it("decodes a Gmail base64url body into UTF-8 text", () => {
    expect(decodeBody(b64url("Hallo, café & co"))).toBe("Hallo, café & co");
  });
  it("returns an empty string for missing data", () => {
    expect(decodeBody(undefined)).toBe("");
    expect(decodeBody("")).toBe("");
  });
});

describe("htmlToText", () => {
  it("strips tags and decodes basic entities into readable text", () => {
    const html =
      "<p>Beste team,</p><div>Kan het budget &amp; de bieding omhoog?</div>";
    expect(htmlToText(html)).toBe("Beste team,\n Kan het budget & de bieding omhoog?");
  });
  it("drops style and script blocks entirely", () => {
    const html =
      "<style>p{color:red}</style><script>alert(1)</script><p>Echte tekst</p>";
    expect(htmlToText(html)).toBe("Echte tekst");
  });
  it("collapses &nbsp; and excess blank lines", () => {
    const html = "<p>Regel een</p>\n\n\n<p>Regel&nbsp;twee</p>";
    expect(htmlToText(html)).toBe("Regel een\n\n Regel twee");
  });
});

describe("extractText", () => {
  /** Build a minimal GmailMessage with the given payload + snippet. */
  const message = (payload: unknown, snippet?: string) =>
    ({ id: "m1", snippet, payload } as Parameters<typeof extractText>[0]);

  it("prefers a text/plain part over the HTML alternative", () => {
    const msg = message({
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: b64url("Platte tekst wint") } },
        {
          mimeType: "text/html",
          body: { data: b64url("<p>HTML moet verliezen</p>") },
        },
      ],
    });
    expect(extractText(msg)).toBe("Platte tekst wint");
  });

  it("strips an HTML-only message to readable text", () => {
    const msg = message({
      mimeType: "text/html",
      body: { data: b64url("<p>Hallo</p><div>Tot snel</div>") },
    });
    expect(extractText(msg)).toBe("Hallo\n Tot snel");
  });

  it("walks a nested multipart payload recursively to find the plain part", () => {
    const msg = message({
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [
            {
              mimeType: "text/plain",
              body: { data: b64url("Diep genest bericht") },
            },
            {
              mimeType: "text/html",
              body: { data: b64url("<p>genegeerd</p>") },
            },
          ],
        },
        { mimeType: "application/pdf", body: { data: b64url("%PDF-bytes") } },
      ],
    });
    expect(extractText(msg)).toBe("Diep genest bericht");
  });

  it("falls back to the Gmail snippet when the body is empty", () => {
    const msg = message(
      { mimeType: "text/plain", body: { data: "" } },
      "Korte samenvatting van Gmail",
    );
    expect(extractText(msg)).toBe("Korte samenvatting van Gmail");
  });

  it("yields an empty string for a fully empty message (so the flow can abort)", () => {
    expect(extractText(message(undefined))).toBe("");
    expect(extractText(message({ mimeType: "text/plain", body: { data: "" } }))).toBe(
      "",
    );
  });
});
