import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Coverage of the poller ORCHESTRATION around the per-conversation flow. Task #84
 * exercised `processThread` (one conversation); this covers the surrounding
 * `pollInbound` machinery that decides WHETHER to look at conversations at all:
 *
 * - the Gmail read-scope probe state machine ("unknown" -> "ok"/"blocked"), so a
 *   mailbox without read scope disables inbound replies (instead of erroring
 *   every tick) yet a later reconnect auto-recovers via a periodic re-probe;
 * - the transient-error path that keeps the state "unknown" and retries; and
 * - the single-flight `polling` guard that drops an overlapping tick.
 *
 * Collaborators are mocked by module path (consistent with
 * email-inbound.processThread.test.ts). The poller and the probe live in the
 * SAME module, so the probe's outcome is driven through the mocked Gmail
 * connector rather than a module mock. Because the scope state machine is
 * module-level, each test re-imports the module after `vi.resetModules()` for a
 * clean "unknown"/0-tick/not-polling starting state.
 */

// The Gmail REST client: every gmailGet builds a `new ReplitConnectors()` and
// calls `.proxy(service, path)`. The probe hits `/messages?maxResults=1`.
const gmailProxy = vi.hoisted(() => vi.fn());
vi.mock("@replit/connectors-sdk", () => ({
  ReplitConnectors: class {
    proxy(service: string, path: string, init?: unknown) {
      return gmailProxy(service, path, init);
    }
  },
}));

// The open-conversation list: the assertion target for "did the poller proceed
// past the scope gate?". Kept empty so no real processThread work runs.
const listOpenThreadsMock = vi.hoisted(() => vi.fn(async () => []));
const claimInboundMock = vi.hoisted(() => vi.fn());
vi.mock("./email-threads-store", () => ({
  listOpenThreads: listOpenThreadsMock,
  claimInbound: claimInboundMock,
}));

// These are only reached once a thread is processed; stubbed so the module loads.
vi.mock("./clients-store", () => ({
  getClientRow: vi.fn(),
  dbClientIdFromPath: vi.fn(),
}));
vi.mock("./email-identity", () => ({ ownerEmail: vi.fn() }));
vi.mock("./generate-engine", () => ({
  resolveGenerationContext: vi.fn(),
  runGeneration: vi.fn(),
}));
vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

type EmailInbound = typeof import("./email-inbound");

/** A fetch-like Response stub (the probe only inspects `ok`/`status`). */
function probeRes(status: number): Response {
  return {
    ok: status === 200,
    status,
    json: async () => ({}),
    text: async () => "",
  } as unknown as Response;
}

/** True when a proxied path is the read-scope probe (vs. any thread fetch). */
function isProbePath(path: unknown): boolean {
  return String(path).includes("maxResults=1");
}

/** Load a fresh module instance so module-level scope state starts clean. */
async function freshModule(): Promise<EmailInbound> {
  vi.resetModules();
  return import("./email-inbound");
}

beforeEach(() => {
  gmailProxy.mockReset();
  listOpenThreadsMock.mockReset();
  listOpenThreadsMock.mockResolvedValue([]);
  claimInboundMock.mockReset();
});

describe("probeGmailReadScope", () => {
  it("returns true on a 200 (read scope granted)", async () => {
    const { probeGmailReadScope } = await freshModule();
    gmailProxy.mockResolvedValue(probeRes(200));
    await expect(probeGmailReadScope()).resolves.toBe(true);
  });

  it("returns false on 401/403 (insufficient scope)", async () => {
    const { probeGmailReadScope } = await freshModule();
    gmailProxy.mockResolvedValue(probeRes(401));
    await expect(probeGmailReadScope()).resolves.toBe(false);
    gmailProxy.mockResolvedValue(probeRes(403));
    await expect(probeGmailReadScope()).resolves.toBe(false);
  });

  it("throws on a transient failure so the caller stays 'unknown'", async () => {
    const { probeGmailReadScope } = await freshModule();
    gmailProxy.mockResolvedValue(probeRes(500));
    await expect(probeGmailReadScope()).rejects.toThrow(/HTTP 500/);
  });
});

describe("pollInbound — scope state machine", () => {
  it("a 401 probe sets state 'blocked' and skips listing open threads", async () => {
    const { pollInbound } = await freshModule();
    gmailProxy.mockImplementation((_s: string, path: string) =>
      Promise.resolve(probeRes(isProbePath(path) ? 401 : 404)),
    );

    await pollInbound();

    // The probe ran exactly once and the gate slammed shut: no thread listing.
    expect(gmailProxy.mock.calls.filter((c) => isProbePath(c[1]))).toHaveLength(1);
    expect(listOpenThreadsMock).not.toHaveBeenCalled();
  });

  it("does not re-probe while blocked until REPROBE_AFTER_TICKS, then recovers", async () => {
    const { pollInbound, REPROBE_AFTER_TICKS } = await freshModule();
    let probeStatus = 401; // start insufficient, flip to OK before the re-probe.
    gmailProxy.mockImplementation((_s: string, path: string) =>
      Promise.resolve(probeRes(isProbePath(path) ? probeStatus : 404)),
    );

    // Tick 1: probe -> blocked.
    await pollInbound();
    expect(gmailProxy.mock.calls.filter((c) => isProbePath(c[1]))).toHaveLength(1);

    // The next (REPROBE_AFTER_TICKS - 1) ticks just count down — no new probe.
    for (let i = 0; i < REPROBE_AFTER_TICKS - 1; i++) await pollInbound();
    expect(gmailProxy.mock.calls.filter((c) => isProbePath(c[1]))).toHaveLength(1);
    expect(listOpenThreadsMock).not.toHaveBeenCalled();

    // The REPROBE_AFTER_TICKS-th blocked tick re-probes; now scope is granted so
    // the poller recovers and proceeds to iterate open threads.
    probeStatus = 200;
    await pollInbound();
    expect(gmailProxy.mock.calls.filter((c) => isProbePath(c[1]))).toHaveLength(2);
    expect(listOpenThreadsMock).toHaveBeenCalledTimes(1);
  });

  it("a transient probe error stays 'unknown' and retries the next tick", async () => {
    const { pollInbound } = await freshModule();
    let probeStatus = 500; // transient: probe throws, state stays unknown.
    gmailProxy.mockImplementation((_s: string, path: string) =>
      Promise.resolve(probeRes(isProbePath(path) ? probeStatus : 404)),
    );

    // Tick 1: probe throws -> caught -> stays unknown, no thread listing.
    await pollInbound();
    expect(gmailProxy.mock.calls.filter((c) => isProbePath(c[1]))).toHaveLength(1);
    expect(listOpenThreadsMock).not.toHaveBeenCalled();

    // Tick 2: still 'unknown', so it probes AGAIN (no 30-tick wait); now OK.
    probeStatus = 200;
    await pollInbound();
    expect(gmailProxy.mock.calls.filter((c) => isProbePath(c[1]))).toHaveLength(2);
    expect(listOpenThreadsMock).toHaveBeenCalledTimes(1);
  });

  it("a 200 probe proceeds to iterate open threads", async () => {
    const { pollInbound } = await freshModule();
    gmailProxy.mockImplementation((_s: string, path: string) =>
      Promise.resolve(probeRes(isProbePath(path) ? 200 : 404)),
    );

    await pollInbound();

    expect(listOpenThreadsMock).toHaveBeenCalledTimes(1);

    // Once "ok", a second tick skips the probe entirely (cached scope state).
    await pollInbound();
    expect(gmailProxy.mock.calls.filter((c) => isProbePath(c[1]))).toHaveLength(1);
    expect(listOpenThreadsMock).toHaveBeenCalledTimes(2);
  });
});

describe("pollInbound — single-flight guard", () => {
  it("a second concurrent call returns immediately without re-entering", async () => {
    const { pollInbound } = await freshModule();

    // Hold the probe in-flight so the first tick is still inside the critical
    // section when the second call arrives.
    let releaseProbe: (r: Response) => void = () => {};
    gmailProxy.mockImplementation((_s: string, path: string) => {
      if (isProbePath(path)) {
        return new Promise<Response>((resolve) => {
          releaseProbe = resolve;
        });
      }
      return Promise.resolve(probeRes(404));
    });

    const first = pollInbound(); // enters, sets polling=true, awaits the probe.
    const second = pollInbound(); // sees polling=true and bails out at once.
    await second;

    // The guard short-circuited: only the first tick ever issued the probe.
    expect(gmailProxy.mock.calls.filter((c) => isProbePath(c[1]))).toHaveLength(1);
    expect(listOpenThreadsMock).not.toHaveBeenCalled();

    // Let the first tick finish so the guard is released cleanly.
    releaseProbe(probeRes(200));
    await first;
    expect(listOpenThreadsMock).toHaveBeenCalledTimes(1);
  });
});
