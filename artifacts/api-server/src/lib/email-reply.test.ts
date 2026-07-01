import { describe, it, expect } from "vitest";
import { pendingDeliveryKind, parseEmailReplyPayload } from "./email-reply";

describe("pendingDeliveryKind", () => {
  it("treats an explicit email-reply tag as email-reply", () => {
    expect(pendingDeliveryKind({ kind: "email-reply" })).toBe("email-reply");
  });

  it("treats an explicit seo-report tag as seo-report", () => {
    expect(pendingDeliveryKind({ kind: "seo-report" })).toBe("seo-report");
  });

  it("treats anything else (incl. legacy untagged) as monthly-report", () => {
    expect(pendingDeliveryKind({ recipient: "a@b.com" })).toBe("monthly-report");
    expect(pendingDeliveryKind({ kind: "monthly-report" })).toBe("monthly-report");
    expect(pendingDeliveryKind(null)).toBe("monthly-report");
    expect(pendingDeliveryKind("nonsense")).toBe("monthly-report");
  });
});

describe("parseEmailReplyPayload", () => {
  it("returns null without the email-reply tag", () => {
    expect(
      parseEmailReplyPayload({
        recipient: "a@b.com",
        subject: "Re: x",
        clientName: "Acme",
        replyBody: "hi",
      }),
    ).toBeNull();
  });

  it("returns null when a required field is missing", () => {
    expect(
      parseEmailReplyPayload({
        kind: "email-reply",
        recipient: "a@b.com",
        subject: "Re: x",
        clientName: "Acme",
      }),
    ).toBeNull();
  });

  it("parses a full payload and carries identity + threading through", () => {
    const p = parseEmailReplyPayload({
      kind: "email-reply",
      recipient: "client@acme.com",
      subject: "Re: Maandrapport",
      clientName: "Acme",
      replyBody: "Bedankt voor je vraag...",
      inboundText: "Kan je dit verduidelijken?",
      fromName: "Sven — Paid Media, Saerens Advertising",
      fromAddress: "paidmedia@saerensadvertising.com",
      cc: "owner@saerensadvertising.com",
      signature: "Sven\nPaid Media · Saerens Advertising",
      headAgentPath: "agents/google-ads-strategist.md",
      threadId: "thread-123",
      inReplyTo: "<abc@mail.gmail.com>",
      references: "<first@x.com> <abc@mail.gmail.com>",
      emailThreadId: 7,
    });
    expect(p).not.toBeNull();
    expect(p?.threadId).toBe("thread-123");
    expect(p?.inReplyTo).toBe("<abc@mail.gmail.com>");
    expect(p?.emailThreadId).toBe(7);
    expect(p?.fromAddress).toBe("paidmedia@saerensadvertising.com");
  });
});
