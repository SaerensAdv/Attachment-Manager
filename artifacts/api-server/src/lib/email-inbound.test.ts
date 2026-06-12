import { describe, it, expect } from "vitest";
import {
  parseEmailAddress,
  replySubject,
  inboundSkipReason,
} from "./email-inbound";

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
