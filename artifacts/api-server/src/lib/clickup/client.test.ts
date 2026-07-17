import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Unit tests for the ClickUp PUSH request core. These pin the behaviours the
 * whole push layer relies on: bounded retries on the RIGHT statuses only,
 * header-driven 429 backoff (not an arbitrary sleep), timeout/network
 * classification, a typed config error when the token is missing, correct
 * multipart wiring for attachments, and — critically — that the token never
 * leaks into a log line.
 *
 * `../logger` is mocked so we can assert on what is (and isn't) logged.
 */

const { logWarn, logError, logInfo } = vi.hoisted(() => ({
  logWarn: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
}));
vi.mock("../logger", () => ({
  logger: { warn: logWarn, error: logError, info: logInfo, debug: vi.fn() },
}));

import {
  clickUpRequest,
  clickUpUploadAttachment,
  readPushToken,
} from "./client";

const TOKEN = "pk_supersecret_test_123";

function jsonRes(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("clickUp push client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.CLICKUP_API_TOKEN = TOKEN;
    fetchMock = vi.fn(async () => jsonRes({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    logWarn.mockClear();
    logError.mockClear();
    logInfo.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.CLICKUP_API_TOKEN;
  });

  it("returns a config error (no fetch) when the token is missing", async () => {
    delete process.env.CLICKUP_API_TOKEN;
    const res = await clickUpRequest("/list/1/task", { correlationId: "c" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.kind).toBe("config");
      expect(res.error.code).toBe("MISSING_TOKEN");
      expect(res.error.retryable).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("readPushToken surfaces the config error shape", () => {
    delete process.env.CLICKUP_API_TOKEN;
    const r = readPushToken();
    expect("error" in r && r.error.kind).toBe("config");
  });

  it("sends the raw token (not Bearer) and parses a 2xx body", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ id: "abc", url: "u" }, 200));
    const res = await clickUpRequest<{ id: string }>("/task/abc", {
      correlationId: "c",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.id).toBe("abc");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(TOKEN);
    expect(headers.Authorization.startsWith("Bearer")).toBe(false);
  });

  it("POSTs a JSON body when one is given", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ id: "t1" }, 200));
    await clickUpRequest("/list/1/task", {
      correlationId: "c",
      body: { name: "Report" },
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ name: "Report" }));
  });

  it.each([400, 401, 403, 404])(
    "does NOT retry a %s (permanent) error",
    async (status) => {
      fetchMock.mockResolvedValue(jsonRes({ err: "nope", ECODE: "X_1" }, status));
      const res = await clickUpRequest("/task/x", { correlationId: "c" });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.kind).toBe("http");
        expect(res.error.status).toBe(status);
        expect(res.error.retryable).toBe(false);
        expect(res.error.code).toBe("X_1");
      }
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("waits the Retry-After header on a 429 then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({ err: "rate" }, 429, { "retry-after": "2" }))
      .mockResolvedValueOnce(jsonRes({ id: "ok" }, 200));
    const p = clickUpRequest("/task/x", { correlationId: "c" });

    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1); // still waiting out Retry-After

    await vi.advanceTimersByTimeAsync(2);
    const res = await p;
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a 500 with backoff then gives up after maxRetries", async () => {
    fetchMock.mockResolvedValue(jsonRes({ err: "boom" }, 500));
    const p = clickUpRequest("/task/x", { correlationId: "c", maxRetries: 3 });
    await vi.runAllTimersAsync();
    const res = await p;
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.status).toBe(500);
      expect(res.error.retryable).toBe(true);
    }
    expect(fetchMock).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it("retries a network error then succeeds", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(jsonRes({ id: "ok" }, 200));
    const p = clickUpRequest("/task/x", { correlationId: "c" });
    await vi.runAllTimersAsync();
    const res = await p;
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("classifies an aborted request as a timeout", async () => {
    const abort = new Error("aborted");
    abort.name = "TimeoutError";
    fetchMock.mockRejectedValue(abort);
    const p = clickUpRequest("/task/x", { correlationId: "c", maxRetries: 1 });
    await vi.runAllTimersAsync();
    const res = await p;
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.kind).toBe("timeout");
      expect(res.error.code).toBe("TIMEOUT");
    }
  });

  it("never logs the token, on retry or on failure", async () => {
    fetchMock.mockResolvedValue(jsonRes({ err: "boom" }, 500));
    const p = clickUpRequest("/task/x", { correlationId: "c", maxRetries: 2 });
    await vi.runAllTimersAsync();
    await p;
    const logged = [...logWarn.mock.calls, ...logError.mock.calls, ...logInfo.mock.calls]
      .map((args) => JSON.stringify(args))
      .join("\n");
    expect(logged.length).toBeGreaterThan(0); // it DID log something
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain("Authorization");
  });

  it("uploads an attachment as multipart with an auth header and no manual content-type", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ id: "att1" }, 200));
    const res = await clickUpUploadAttachment(
      "task1",
      {
        filename: "rapport.pdf",
        content: new Uint8Array([1, 2, 3]),
        contentType: "application/pdf",
      },
      { correlationId: "c" },
    );
    expect(res.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/task/task1/attachment");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(TOKEN);
    expect(headers["Content-Type"]).toBeUndefined();
  });
});
