import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Coverage of the alerts store — the durable record of silent background
 * failures. The store is best-effort by contract: recording runs inside a
 * failure handler, so the key guarantees are (1) it NEVER throws, (2) repeats of
 * an open alert coalesce instead of flooding, and (3) reads/writes degrade to an
 * empty/no-op result when the table can't be reached.
 *
 * The pg pool is mocked so we can assert the exact SQL intent (dedup ON CONFLICT,
 * the atomic resolve predicate) without a live database.
 */

const queryMock = vi.hoisted(() => vi.fn());
vi.mock("@workspace/db", () => ({
  pool: { query: queryMock },
}));

type Store = typeof import("./alerts-store");

async function freshStore(): Promise<Store> {
  vi.resetModules();
  return import("./alerts-store");
}

/** Default: every DDL/DML call resolves empty. Tests override per-call as needed. */
beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("recordAlert", () => {
  it("inserts with a dedup ON CONFLICT that bumps occurrences", async () => {
    const { recordAlert } = await freshStore();
    await recordAlert({
      source: "scheduler",
      severity: "error",
      message: "Geplande run mislukte (planning #3).",
      context: { key: "schedule:3", scheduleId: 3 },
    });

    // Find the INSERT call (the ensureTable DDL calls run first).
    const insert = queryMock.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO system_alerts"),
    );
    expect(insert).toBeTruthy();
    const sql = String(insert![0]);
    expect(sql).toContain("ON CONFLICT (fingerprint)");
    expect(sql).toContain("occurrences = system_alerts.occurrences + 1");
    // Params: source, severity, message, context json, fingerprint.
    const params = insert![1] as unknown[];
    expect(params[0]).toBe("scheduler");
    expect(params[1]).toBe("error");
    expect(params[4]).toBe("scheduler:Geplande run mislukte (planning #3).:schedule:3");
  });

  it("folds context.key into the fingerprint so distinct subjects stay separate", async () => {
    const { recordAlert } = await freshStore();
    await recordAlert({
      source: "email-inbound",
      severity: "error",
      message: "Verwerken van een inkomende e-mail mislukte.",
      context: { key: "thread:42" },
    });
    await recordAlert({
      source: "email-inbound",
      severity: "error",
      message: "Verwerken van een inkomende e-mail mislukte.",
      context: { key: "thread:99" },
    });

    const inserts = queryMock.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO system_alerts"),
    );
    const fps = inserts.map((c) => (c[1] as unknown[])[4]);
    expect(fps[0]).not.toBe(fps[1]);
  });

  it("NEVER throws when the DB write fails (best-effort)", async () => {
    const { recordAlert } = await freshStore();
    queryMock.mockImplementation((sql: string) => {
      if (String(sql).includes("INSERT INTO")) {
        return Promise.reject(new Error("insert blew up"));
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    await expect(
      recordAlert({ source: "x", severity: "warn", message: "m" }),
    ).resolves.toBeUndefined();
  });

  it("degrades to a no-op (no INSERT) when the table can't be created", async () => {
    const { recordAlert } = await freshStore();
    queryMock.mockRejectedValue(new Error("CREATE TABLE denied"));
    await recordAlert({ source: "x", severity: "warn", message: "m" });
    const insert = queryMock.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO system_alerts"),
    );
    expect(insert).toBeUndefined();
  });
});

describe("listAlerts", () => {
  it("filters to open alerts when unresolvedOnly is set", async () => {
    const { listAlerts } = await freshStore();
    queryMock.mockImplementation((sql: string) => {
      if (String(sql).includes("SELECT id, source")) {
        return Promise.resolve({
          rows: [
            {
              id: 1,
              source: "scheduler",
              severity: "error",
              message: "m",
              context: { a: 1 },
              fingerprint: "fp",
              occurrences: 2,
              first_seen_at: new Date("2026-06-01T00:00:00Z"),
              last_seen_at: new Date("2026-06-02T00:00:00Z"),
              resolved_at: null,
            },
          ],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const alerts = await listAlerts({ unresolvedOnly: true });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      id: 1,
      source: "scheduler",
      severity: "error",
      occurrences: 2,
      resolvedAt: null,
    });
    const select = queryMock.mock.calls.find((c) =>
      String(c[0]).includes("SELECT id, source"),
    );
    expect(String(select![0])).toContain("WHERE resolved_at IS NULL");
  });

  it("returns [] on a read failure", async () => {
    const { listAlerts } = await freshStore();
    queryMock.mockImplementation((sql: string) => {
      if (String(sql).includes("SELECT id, source")) {
        return Promise.reject(new Error("read failed"));
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    await expect(listAlerts()).resolves.toEqual([]);
  });
});

describe("resolveAlert", () => {
  it("uses an atomic open-only predicate and returns the updated row", async () => {
    const { resolveAlert } = await freshStore();
    queryMock.mockImplementation((sql: string) => {
      if (String(sql).includes("UPDATE system_alerts SET resolved_at")) {
        return Promise.resolve({
          rows: [
            {
              id: 7,
              source: "generation",
              severity: "error",
              message: "Automatische run mislukte.",
              context: null,
              fingerprint: "fp",
              occurrences: 1,
              first_seen_at: new Date("2026-06-01T00:00:00Z"),
              last_seen_at: new Date("2026-06-01T00:00:00Z"),
              resolved_at: new Date("2026-06-03T00:00:00Z"),
            },
          ],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const row = await resolveAlert(7);
    expect(row?.id).toBe(7);
    expect(row?.resolvedAt).toBeInstanceOf(Date);
    const update = queryMock.mock.calls.find((c) =>
      String(c[0]).includes("UPDATE system_alerts SET resolved_at"),
    );
    expect(String(update![0])).toContain("resolved_at IS NULL");
  });

  it("returns null when nothing was open to resolve (maps to 404)", async () => {
    const { resolveAlert } = await freshStore();
    // Default mock returns rows: [] for the UPDATE ... RETURNING.
    await expect(resolveAlert(123)).resolves.toBeNull();
  });
});

describe("countUnresolvedAlerts", () => {
  it("returns the open count and 0 on failure", async () => {
    const store = await freshStore();
    queryMock.mockImplementation((sql: string) => {
      if (String(sql).includes("count(*)")) {
        return Promise.resolve({ rows: [{ n: 4 }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    await expect(store.countUnresolvedAlerts()).resolves.toBe(4);

    const store2 = await freshStore();
    queryMock.mockImplementation((sql: string) => {
      if (String(sql).includes("count(*)")) {
        return Promise.reject(new Error("count failed"));
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    await expect(store2.countUnresolvedAlerts()).resolves.toBe(0);
  });
});
