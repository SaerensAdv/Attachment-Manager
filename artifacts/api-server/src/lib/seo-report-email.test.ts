import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SendEmailInput } from "./email";

// Mock the heavy delivery deps so the test is hermetic: no pdfkit/sharp/Gmail.
const renderPdfMock = vi.hoisted(() => vi.fn());
vi.mock("./report-pdf", () => ({ renderReportPdf: renderPdfMock }));

const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock("./email", () => ({
  sendEmail: sendEmailMock,
  createGmailDraft: vi.fn(),
}));

vi.mock("./monthly-report-email", () => ({
  escapeHtml: (s: string) => s,
  buildBrandedEmail: () => "<html></html>",
}));

const ownerEmailMock = vi.hoisted(() => vi.fn());
vi.mock("./email-identity", () => ({ ownerEmail: ownerEmailMock }));

// Imported after the mocks above (vi.mock is hoisted).
import {
  sendSeoWorklistToOwner,
  type SeoReportDeliveryPayload,
} from "./seo-report-email";

function payload(
  over: Partial<SeoReportDeliveryPayload> = {},
): SeoReportDeliveryPayload {
  return {
    kind: "seo-report",
    recipient: "client@acme.com",
    subject: "SEO-maandrapport — Beauty Icon",
    clientName: "Beauty Icon",
    cadence: "monthly",
    periodLabel: "juni 2026",
    dateLabel: "1 juli 2026",
    emailBody: "",
    clientReport: "# Klantrapport",
    internalWorklist: "# Interne werklijst\n- meta titles herschrijven",
    metrics: null,
    ...over,
  };
}

beforeEach(() => {
  renderPdfMock.mockReset();
  renderPdfMock.mockResolvedValue(Buffer.from("PDFDATA"));
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ id: "1", threadId: "t", messageId: "m" });
  ownerEmailMock.mockReset();
  ownerEmailMock.mockReturnValue(null);
});

describe("sendSeoWorklistToOwner", () => {
  it("skips (and never renders/sends) when there is no worklist", async () => {
    ownerEmailMock.mockReturnValue("owner@saerens.com");
    const r = await sendSeoWorklistToOwner(payload({ internalWorklist: null }));
    expect(r).toEqual({ status: "skipped", reason: "no-worklist" });
    expect(renderPdfMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("skips (never sends) when no owner address is configured", async () => {
    ownerEmailMock.mockReturnValue(null);
    const r = await sendSeoWorklistToOwner(payload());
    expect(r).toEqual({ status: "skipped", reason: "no-owner-email" });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("sends the werklist to the owner only — never to the client", async () => {
    ownerEmailMock.mockReturnValue("owner@saerens.com");
    const r = await sendSeoWorklistToOwner(payload());
    expect(r).toEqual({ status: "sent" });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const input = sendEmailMock.mock.calls[0][0] as SendEmailInput;
    expect(input.to).toBe("owner@saerens.com");
    // The client recipient must never appear anywhere on the internal mail.
    expect(input.to).not.toBe("client@acme.com");
    expect(input.cc).toBeUndefined();
    expect(input.attachments).toHaveLength(1);
    expect(input.attachments?.[0]?.mimeType).toBe("application/pdf");

    // Rendered with the internal cover style, from the worklist markdown.
    expect(renderPdfMock).toHaveBeenCalledTimes(1);
    const [md, opts] = renderPdfMock.mock.calls[0] as [
      string,
      { reportType?: string },
    ];
    expect(md).toContain("Interne werklijst");
    expect(opts.reportType).toBe("internal");
  });

  it("propagates a Gmail send failure so the caller can alert on it", async () => {
    ownerEmailMock.mockReturnValue("owner@saerens.com");
    sendEmailMock.mockRejectedValue(new Error("Gmail 500"));
    await expect(sendSeoWorklistToOwner(payload())).rejects.toThrow("Gmail 500");
  });
});
