import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Coverage of the poller ORCHESTRATION around the per-conversation flow:
 *
 * - the Gmail read-scope probe state machine ("unknown" -> "ok"/"blocked"), so a
 *   mailbox without read scope disables inbound replies (instead of erroring
 *   every tick) yet a later token refresh auto-recovers via a periodic re-probe;
 * - the transient-error path that keeps the state "unknown" and retries; and
 *   the single-flight `polling` guard that drops an overlapping tick.
 *
 * Collaborators are mocked by module path. The poller and the probe live in the
 * SAME module, so the probe's outcome is driven through a stubbed global `fetch`
 * (gmailGet now reads the agency mailbox with the dedicated `gmail.modify` token
 * via REST, not the Replit connector). Because the scope state machine is
 * module-level, each test re-imports the module after `vi.resetModules()` for a
 * clean "unknown"/0-tick/not-polling starting state.
 */

// The Gmail REST client: every gmailGet resolves an access token then issues a
// `fetch(https://gmail.googleapis.com<path>)`. The probe hits `/messages?maxResults=1`.
const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

vi.mock("./gmail-oauth", () => ({
  getGmailAccessToken: vi.fn(async () => "test-access-token"),
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

/** True when a fetched URL is the read-scope probe (vs. any thread fetch). */
function isProbePath(url: unknown): boolean {
  return String(url).includes("maxResults=1");
}

/** Load a fresh module instance so module-level scope state starts clean. */
async function freshModule(): Promise<EmailInbound> {
  vi.resetModules();
  return import("./email-inbound");
}

beforeEach(() => {
  fetchMock.mockReset();
  listOpenThreadsMock.mockReset();
  listOpenThreadsMock.mockResolvedValue([]);
  claimInboundMock.mockReset();
});

describe("probeGmailReadScope", () => {
  it("returns true on a 200 (read scope granted)", async () => {
    const { probeGmailReadScope } = await freshModule();
    fetchMock.mockResolvedValue(probeRes(200));
    await expect(probeGmailReadScope()).resolves.toBe(true);
  });

  it("returns false on 401/403 (insufficient scope)", async () => {
    const { probeGmailReadScope } = await freshModule();
    fetchMock.mockResolvedValue(probeRes(401));
    await expect(probeGmailReadScope()).resolves.toBe(false);
    fetchMock.mockResolvedValue(probeRes(403));
    await expect(probeGmailReadScope()).resolves.toBe(false);
  });

  it("throws on a transient failure so the caller stays 'unknown'", async () => {
    const { probeGmailReadScope } = await freshModule();
    fetchMock.mockResolvedValue(probeRes(500));
    await expect(probeGmailReadScope()).rejects.toThrow(/HTTP 500/);
  });
});

describe("pollInbound — scope state machine", () => {
  it("a 401 probe sets state 'blocked' and skips listing open threads", async () => {
    const { pollInbound } = await freshModule();
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(probeRes(isProbePath(url) ? 401 : 404)),
    );

    await pollInbound();

    // The probe ran exactly once and the gate slammed shut: no thread listing.
    expect(fetchMock.mock.calls.filter((c) => isProbePath(c[0]))).toHaveLength(1);
    expect(listOpenThreadsMock).not.toHaveBeenCalled();
  });

  it("does not re-probe while blocked until REPROBE_AFTER_TICKS, then recovers", async () => {
    const { pollInbound, REPROBE_AFTER_TICKS } = await freshModule();
    let probeStatus = 401; // start insufficient, flip to OK before the re-probe.
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(probeRes(isProbePath(url) ? probeStatus : 404)),
    );

    // Tick 1: probe -> blocked.
    await pollInbound();
    expect(fetchMock.mock.calls.filter((c) => isProbePath(c[0]))).toHaveLength(1);

    // The next (REPROBE_AFTER_TICKS - 1) ticks just count down — no new probe.
    for (let i = 0; i < REPROBE_AFTER_TICKS - 1; i++) await pollInbound();
    expect(fetchMock.mock.calls.filter((c) => isProbePath(c[0]))).toHaveLength(1);
    expect(listOpenThreadsMock).not.toHaveBeenCalled();

    // The REPROBE_AFTER_TICKS-th blocked tick re-probes; now scope is granted so
    // the poller recovers and proceeds to iterate open threads.
    probeStatus = 200;
    await pollInbound();
    expect(fetchMock.mock.calls.filter((c) => isProbePath(c[0]))).toHaveLength(2);
    expect(listOpenThreadsMock).toHaveBeenCalledTimes(1);
  });

  it("a transient probe error stays 'unknown' and retries the next tick", async () => {
    const { pollInbound } = await freshModule();
    let probeStatus = 500; // transient: probe throws, state stays unknown.
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(probeRes(isProbePath(url) ? probeStatus : 404)),
    );

    // Tick 1: probe throws -> caught -> stays unknown, no thread listing.
    await pollInbound();
    expect(fetchMock.mock.calls.filter((c) => isProbePath(c[0]))).toHaveLength(1);
    expect(listOpenThreadsMock).not.toHaveBeenCalled();

    // Tick 2: still 'unknown', so it probes AGAIN (no 30-tick wait); now OK.
    probeStatus = 200;
    await pollInbound();
    expect(fetchMock.mock.calls.filter((c) => isProbePath(c[0]))).toHaveLength(2);
    expect(listOpenThreadsMock).toHaveBeenCalledTimes(1);
  });

  it("a 200 probe proceeds to iterate open threads", async () => {
    const { pollInbound } = await freshModule();
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(probeRes(isProbePath(url) ? 200 : 404)),
    );

    await pollInbound();

    expect(listOpenThreadsMock).toHaveBeenCalledTimes(1);

    // Once "ok", a second tick skips the probe entirely (cached scope state).
    await pollInbound();
    expect(fetchMock.mock.calls.filter((c) => isProbePath(c[0]))).toHaveLength(1);
    expect(listOpenThreadsMock).toHaveBeenCalledTimes(2);
  });
});

describe("pollInbound — single-flight guard", () => {
  it("a second concurrent call returns immediately without re-entering", async () => {
    const { pollInbound } = await freshModule();

    // Hold the probe in-flight so the first tick is still inside the critical
    // section when the second call arrives.
    let releaseProbe: (r: Response) => void = () => {};
    fetchMock.mockImplementation((url: string) => {
      if (isProbePath(url)) {
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
    expect(fetchMock.mock.calls.filter((c) => isProbePath(c[0]))).toHaveLength(1);
    expect(listOpenThreadsMock).not.toHaveBeenCalled();

    // Let the first tick finish so the guard is released cleanly.
    releaseProbe(probeRes(200));
    await first;
    expect(listOpenThreadsMock).toHaveBeenCalledTimes(1);
  });
});
