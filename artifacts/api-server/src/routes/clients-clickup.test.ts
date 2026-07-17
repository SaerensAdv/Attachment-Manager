import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

/**
 * HTTP-contract tests for the ClickUp link-only routes, with the database and
 * the sync engine mocked. The DB mock is the same FIFO queue used by
 * clients.test.ts: each awaited terminal chain resolves to the next queued
 * array, so a test lines up results in the exact order the handler awaits them.
 *
 * These assert the route contract — the 200/502 mapping on GET sync, and the
 * strictly non-destructive behaviour of POST apply: compare-and-fill success,
 * the one-company-one-client guard (both from existing links and within a
 * batch), already-linked skips, and validation that never touches the database.
 */

const dbResults: unknown[][] = [];
function queueResults(...rows: unknown[][]): void {
  dbResults.push(...rows);
}

vi.mock("@workspace/db", () => {
  const chain: Record<string, unknown> = {};
  for (const method of [
    "select",
    "from",
    "where",
    "insert",
    "values",
    "returning",
    "update",
    "set",
    "delete",
  ]) {
    chain[method] = () => chain;
  }
  chain.then = (
    resolve: (v: unknown[]) => unknown,
    reject: (e: unknown) => unknown,
  ) => {
    const next = dbResults.shift();
    // A queued Error simulates a rejected query (e.g. a unique-violation from
    // the partial index) so the handler's catch path can be exercised.
    if (next instanceof Error) return Promise.reject(next).then(resolve, reject);
    return Promise.resolve(next ?? []).then(resolve, reject);
  };
  return {
    db: chain,
    clientsTable: { id: "id", name: "name", clickupCompanyId: "clickupCompanyId" },
  };
});

vi.mock("drizzle-orm", () => ({
  eq: (...args: unknown[]) => ({ eq: args }),
  and: (...args: unknown[]) => ({ and: args }),
  or: (...args: unknown[]) => ({ or: args }),
  isNull: (...args: unknown[]) => ({ isNull: args }),
}));

// The sync engine is stubbed so the GET route's success/error mapping can be
// driven without touching ClickUp or the database.
const { syncMock } = vi.hoisted(() => ({ syncMock: vi.fn() }));
vi.mock("../lib/clickup-sync", () => ({
  syncClickUpCompanies: (...args: unknown[]) => syncMock(...args),
}));

// Imported after the mocks above (vi.mock is hoisted).
import clickupRouter from "./clients-clickup";

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", clickupRouter);
  return app;
}

const SYNC_RESULT = {
  available: true,
  companyCount: 2,
  clientCount: 3,
  links: [
    {
      clientId: 1,
      clientName: "Acme NV",
      companyId: "abc12345",
      companyName: "Acme",
      matchBy: "domein",
      reason: "match",
    },
  ],
  alreadyLinked: [],
  unmatchedClients: [],
  unmatchedCompanies: [],
  warnings: [],
};

beforeEach(() => {
  dbResults.length = 0;
  syncMock.mockReset();
});

describe("GET /api/clients/clickup/sync", () => {
  it("returns the sync result on success", async () => {
    syncMock.mockResolvedValueOnce(SYNC_RESULT);
    const res = await request(makeApp()).get("/api/clients/clickup/sync");

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.links).toHaveLength(1);
    expect(res.body.links[0].companyId).toBe("abc12345");
  });

  it("maps an engine failure to 502", async () => {
    syncMock.mockRejectedValueOnce(new Error("ClickUp down"));
    const res = await request(makeApp()).get("/api/clients/clickup/sync");

    expect(res.status).toBe(502);
    expect(res.body.error).toContain("ClickUp-synchronisatie");
    expect(res.body.detail).toBe("ClickUp down");
  });
});

describe("POST /api/clients/clickup/apply — non-destructive linking", () => {
  it("accepts an empty batch without touching the database", async () => {
    const res = await request(makeApp())
      .post("/api/clients/clickup/apply")
      .send({ links: [] });

    expect(res.status).toBe(200);
    expect(res.body.linked).toEqual([]);
    expect(res.body.errors).toEqual([]);
    expect(dbResults).toHaveLength(0); // nothing was dequeued
  });

  it("compare-and-fills a fresh link and returns it", async () => {
    queueResults(
      [{ id: 1, companyId: null }], // initial select → no companies taken
      [{ id: 1, name: "Acme NV" }], // update(...).returning() → one row filled
    );
    const res = await request(makeApp())
      .post("/api/clients/clickup/apply")
      .send({ links: [{ clientId: 1, companyId: "abc12345" }] });

    expect(res.status).toBe(200);
    expect(res.body.linked).toEqual([{ clientId: 1, companyId: "abc12345" }]);
    expect(res.body.errors).toEqual([]);
  });

  it("skips a company already linked to another client (existing link)", async () => {
    queueResults([{ id: 2, companyId: "abc12345" }]); // company already taken
    const res = await request(makeApp())
      .post("/api/clients/clickup/apply")
      .send({ links: [{ clientId: 1, companyId: "abc12345" }] });

    expect(res.status).toBe(200);
    expect(res.body.linked).toEqual([]);
    expect(res.body.errors[0]).toContain("al aan een klant gekoppeld");
    expect(dbResults).toHaveLength(0); // no update was attempted
  });

  it("links a company at most once within a single batch", async () => {
    queueResults(
      [{ id: 1, companyId: null }, { id: 2, companyId: null }], // none taken
      [{ id: 1, name: "Acme NV" }], // first update fills
    );
    const res = await request(makeApp())
      .post("/api/clients/clickup/apply")
      .send({
        links: [
          { clientId: 1, companyId: "abc12345" },
          { clientId: 2, companyId: "abc12345" },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.linked).toHaveLength(1);
    expect(res.body.errors[0]).toContain("al aan een klant gekoppeld");
  });

  it("skips a company claimed concurrently (unique-violation on update)", async () => {
    const dup = Object.assign(new Error("duplicate key"), { code: "23505" });
    queueResults([{ id: 1, companyId: null }]); // initial select → none taken
    dbResults.push(dup as unknown as unknown[]); // update rejects with 23505
    const res = await request(makeApp())
      .post("/api/clients/clickup/apply")
      .send({ links: [{ clientId: 1, companyId: "abc12345" }] });

    expect(res.status).toBe(200);
    expect(res.body.linked).toEqual([]);
    expect(res.body.errors[0]).toContain("al aan een klant gekoppeld");
  });

  it("skips a client that is already linked (compare-and-fill no-op)", async () => {
    queueResults(
      [{ id: 1, companyId: "xyz98765" }], // client 1 already has another company
      [], // update(...).returning() → nothing changed
      [{ id: 1, name: "Acme NV" }], // follow-up select → client exists
    );
    const res = await request(makeApp())
      .post("/api/clients/clickup/apply")
      .send({ links: [{ clientId: 1, companyId: "abc12345" }] });

    expect(res.status).toBe(200);
    expect(res.body.linked).toEqual([]);
    expect(res.body.errors[0]).toContain("al aan een ClickUp-bedrijf gekoppeld");
  });

  it("reports a client that no longer exists", async () => {
    queueResults(
      [], // initial select → no clients
      [], // update(...).returning() → nothing
      [], // follow-up select → gone
    );
    const res = await request(makeApp())
      .post("/api/clients/clickup/apply")
      .send({ links: [{ clientId: 99, companyId: "abc12345" }] });

    expect(res.status).toBe(200);
    expect(res.body.errors[0]).toContain("Klant 99 niet gevonden");
  });

  it("rejects a malformed company id without an update", async () => {
    queueResults([]); // initial select → no companies taken; no update follows
    const res = await request(makeApp())
      .post("/api/clients/clickup/apply")
      .send({ links: [{ clientId: 1, companyId: "!!" }] });

    expect(res.status).toBe(200);
    expect(res.body.linked).toEqual([]);
    expect(res.body.errors[0]).toContain("Ongeldig ClickUp bedrijf-id");
  });

  it("rejects an invalid client id in the batch", async () => {
    queueResults([]); // initial select
    const res = await request(makeApp())
      .post("/api/clients/clickup/apply")
      .send({ links: [{ clientId: 0, companyId: "abc12345" }] });

    expect(res.status).toBe(200);
    expect(res.body.linked).toEqual([]);
    expect(res.body.errors[0]).toContain("Ongeldige koppeling");
  });
});
