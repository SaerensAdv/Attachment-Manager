import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

/**
 * End-to-end tests of the clients route through Express + supertest, with the
 * database mocked. The mock is a FIFO queue: each awaited query (a `select`,
 * `insert(...).returning()`, `update(...).returning()`, `delete(...).returning()`)
 * resolves to the next array we queued. The route code drives the order, so each
 * test queues results in exactly the sequence the handler awaits them.
 *
 * This verifies the HTTP contract — status codes, JSON shape, date serialization
 * and especially the 404-vs-409 disambiguation on the optimistic-locking PUT.
 * The atomic compare-and-set itself lives in the SQL predicate (untestable
 * without a real DB), so we assert the behaviour around it.
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
    "orderBy",
    "insert",
    "values",
    "returning",
    "update",
    "set",
    "delete",
  ]) {
    chain[method] = () => chain;
  }
  // Make the builder awaitable: awaiting any terminal chain dequeues a result.
  chain.then = (resolve: (v: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(dbResults.shift() ?? []).then(resolve, reject);
  return {
    db: chain,
    clientsTable: { id: "id", name: "name", updatedAt: "updatedAt" },
  };
});

// Hoisted spies so tests can assert the SQL predicate shape (e.g. the atomic
// compare-and-set folds the version check into the UPDATE's WHERE).
const { eqMock, andMock } = vi.hoisted(() => ({
  eqMock: vi.fn((...args: unknown[]) => ({ eq: args })),
  andMock: vi.fn((...args: unknown[]) => ({ and: args })),
}));

vi.mock("drizzle-orm", () => ({
  eq: eqMock,
  and: andMock,
}));

// Mock the Business Profile lib so the route tests can drive its config-vs-upstream
// error mapping (400 vs 502) without touching the network. The same mocked
// `BusinessProfileConfigError` class is used by both the throw and the route's
// `instanceof` check, so the 400-config branch is exercised faithfully.
const { gmbMock } = vi.hoisted(() => ({ gmbMock: { fetch: vi.fn() } }));
vi.mock("../lib/business-profile", () => {
  class BusinessProfileConfigError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "BusinessProfileConfigError";
    }
  }
  return {
    BusinessProfileConfigError,
    fetchBusinessProfileReport: (...args: unknown[]) => gmbMock.fetch(...args),
  };
});
import { BusinessProfileConfigError } from "../lib/business-profile";

// Deck generation is stubbed so the route tests drive its config-vs-upstream
// error mapping (400 vs 502) and success shape without cloning decks or hitting
// the Google Ads API. The route's `instanceof GoogleAdsConfigError` check uses
// the REAL class (google-ads loads cleanly in tests), so we reject with it.
const { deckMock } = vi.hoisted(() => ({ deckMock: { generate: vi.fn() } }));
vi.mock("../lib/deck-generation", () => ({
  generateDeckForRow: (...args: unknown[]) => deckMock.generate(...args),
  buildAuditDataForRow: vi.fn(),
  buildQbrDataForRow: vi.fn(),
}));
import { GoogleAdsConfigError } from "../lib/google-ads";

// Imported after the mocks above (vi.mock is hoisted).
import clientsRouter from "./clients";

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", clientsRouter);
  return app;
}

const CREATED_AT = new Date("2026-01-01T00:00:00.000Z");
const UPDATED_AT = new Date("2026-01-02T00:00:00.000Z");

function makeRow(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Acme NV",
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    websiteIntakeAt: null,
    googleAdsLiveAt: null,
    ...over,
  };
}

beforeEach(() => {
  dbResults.length = 0;
  eqMock.mockClear();
  andMock.mockClear();
  gmbMock.fetch.mockReset();
  deckMock.generate.mockReset();
});

describe("PUT /api/clients/:id — optimistic locking", () => {
  it("updates and returns the row when the version still matches", async () => {
    queueResults([makeRow()]); // update(...).returning() → one row changed
    const res = await request(makeApp())
      .put("/api/clients/1")
      .send({ name: "Acme NV", updatedAt: UPDATED_AT.toISOString() });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.updatedAt).toBe(UPDATED_AT.toISOString());
    expect(res.body.createdAt).toBe(CREATED_AT.toISOString());
  });

  it("returns 409 with the current row when the version moved on", async () => {
    const current = makeRow({ name: "Changed Elsewhere" });
    queueResults([], [current]); // update → no row, then follow-up select → exists
    const res = await request(makeApp())
      .put("/api/clients/1")
      .send({ name: "My Edit", updatedAt: UPDATED_AT.toISOString() });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("elders aangepast");
    expect(res.body.current.name).toBe("Changed Elsewhere");
  });

  it("returns 404 when the row is gone", async () => {
    queueResults([], []); // update → no row, follow-up select → also gone
    const res = await request(makeApp())
      .put("/api/clients/1")
      .send({ name: "My Edit", updatedAt: UPDATED_AT.toISOString() });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Klant niet gevonden.");
  });

  it("rejects an invalid id before touching the database", async () => {
    const res = await request(makeApp())
      .put("/api/clients/abc")
      .send({ name: "Acme NV" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Ongeldige id.");
    expect(dbResults).toHaveLength(0); // nothing was dequeued
  });

  it("rejects a missing name before touching the database", async () => {
    const res = await request(makeApp()).put("/api/clients/1").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Naam is verplicht.");
  });

  it("rejects a malformed Google Ads customer id", async () => {
    const res = await request(makeApp())
      .put("/api/clients/1")
      .send({ name: "Acme NV", googleAdsCustomerId: "abc-123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("enkel cijfers en streepjes");
  });

  it("folds the version check into the UPDATE predicate (atomic compare-and-set)", async () => {
    queueResults([makeRow()]);
    await request(makeApp())
      .put("/api/clients/1")
      .send({ name: "Acme NV", updatedAt: UPDATED_AT.toISOString() });

    // The version guard must be part of the WHERE clause, not a read-then-write:
    // and(eq(id), eq(updatedAt)).
    expect(andMock).toHaveBeenCalled();
    const eqColumns = eqMock.mock.calls.map((c) => c[0]);
    expect(eqColumns).toContain("id");
    expect(eqColumns).toContain("updatedAt");
  });

  it("updates by id alone when no version is supplied (no compare-and-set)", async () => {
    queueResults([makeRow()]);
    await request(makeApp()).put("/api/clients/1").send({ name: "Acme NV" });

    expect(andMock).not.toHaveBeenCalled();
    const eqColumns = eqMock.mock.calls.map((c) => c[0]);
    expect(eqColumns).toContain("id");
    expect(eqColumns).not.toContain("updatedAt");
  });
});

describe("clients CRUD basics", () => {
  it("creates a client and returns 201", async () => {
    queueResults([makeRow({ id: 7, name: "New Client" })]);
    const res = await request(makeApp())
      .post("/api/clients")
      .send({ name: "New Client" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(7);
    expect(res.body.name).toBe("New Client");
  });

  it("lists clients", async () => {
    queueResults([makeRow(), makeRow({ id: 2, name: "Beta" })]);
    const res = await request(makeApp()).get("/api/clients");

    expect(res.status).toBe(200);
    expect(res.body.clients).toHaveLength(2);
    expect(res.body.clients[1].name).toBe("Beta");
  });

  it("returns 404 for a missing client", async () => {
    queueResults([]);
    const res = await request(makeApp()).get("/api/clients/999");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Klant niet gevonden.");
  });

  it("deletes a client and returns 204", async () => {
    queueResults([makeRow()]);
    const res = await request(makeApp()).delete("/api/clients/1");

    expect(res.status).toBe(204);
  });

  it("returns 404 when deleting a missing client", async () => {
    queueResults([]);
    const res = await request(makeApp()).delete("/api/clients/999");

    expect(res.status).toBe(404);
  });
});

describe("POST /api/clients/:id/business-profile-refresh — status mapping", () => {
  it("rejects an invalid id before touching the database", async () => {
    const res = await request(makeApp()).post(
      "/api/clients/abc/business-profile-refresh",
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Ongeldige id.");
    expect(dbResults).toHaveLength(0);
  });

  it("returns 404 when the client does not exist", async () => {
    queueResults([]); // select → no row
    const res = await request(makeApp()).post(
      "/api/clients/1/business-profile-refresh",
    );
    expect(res.status).toBe(404);
    expect(gmbMock.fetch).not.toHaveBeenCalled();
  });

  it("returns 400 when the client has no location id (no upstream call)", async () => {
    queueResults([makeRow({ businessProfileLocationId: null })]);
    const res = await request(makeApp()).post(
      "/api/clients/1/business-profile-refresh",
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Business Profile-locatie");
    expect(gmbMock.fetch).not.toHaveBeenCalled();
  });

  it("maps a config error from the lib to 400", async () => {
    queueResults([makeRow({ businessProfileLocationId: "123" })]);
    gmbMock.fetch.mockRejectedValueOnce(
      new BusinessProfileConfigError("Ongeldige locatie."),
    );
    const res = await request(makeApp()).post(
      "/api/clients/1/business-profile-refresh",
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Ongeldige locatie.");
  });

  it("maps an upstream/API error to 502", async () => {
    queueResults([makeRow({ businessProfileLocationId: "123" })]);
    gmbMock.fetch.mockRejectedValueOnce(new Error("not allowlisted"));
    const res = await request(makeApp()).post(
      "/api/clients/1/business-profile-refresh",
    );
    expect(res.status).toBe(502);
    expect(res.body.error).toContain("Business Profile");
    expect(res.body.detail).toBe("not allowlisted");
  });

  it("stores the live report and returns the updated client on success", async () => {
    const fetchedAt = new Date("2026-06-01T00:00:00.000Z");
    queueResults(
      [makeRow({ businessProfileLocationId: "123" })], // select
      [
        makeRow({
          businessProfileLocationId: "123",
          businessProfileLive: "GMB report text",
          businessProfileLiveAt: fetchedAt,
        }),
      ], // update(...).returning()
    );
    gmbMock.fetch.mockResolvedValueOnce({
      text: "GMB report text",
      fetchedAt,
    });
    const res = await request(makeApp()).post(
      "/api/clients/1/business-profile-refresh",
    );
    expect(res.status).toBe(200);
    expect(res.body.businessProfileLive).toBe("GMB report text");
    expect(res.body.businessProfileLiveAt).toBe(fetchedAt.toISOString());
  });
});

describe("POST /api/clients/:id/generate-deck", () => {
  it("rejects an invalid id before touching the database", async () => {
    const res = await request(makeApp())
      .post("/api/clients/abc/generate-deck")
      .send({ kind: "audit" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Ongeldige id.");
    expect(dbResults).toHaveLength(0);
    expect(deckMock.generate).not.toHaveBeenCalled();
  });

  it("rejects an invalid deck kind before touching the database", async () => {
    const res = await request(makeApp())
      .post("/api/clients/1/generate-deck")
      .send({ kind: "bogus" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("geldig deck-type");
    expect(dbResults).toHaveLength(0);
    expect(deckMock.generate).not.toHaveBeenCalled();
  });

  it("returns 404 when the client does not exist", async () => {
    queueResults([]); // select → no row
    const res = await request(makeApp())
      .post("/api/clients/1/generate-deck")
      .send({ kind: "audit" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Klant niet gevonden.");
    expect(deckMock.generate).not.toHaveBeenCalled();
  });

  it("maps a Google Ads config error from the lib to 400", async () => {
    queueResults([makeRow({ googleAdsCustomerId: "123-456-7890" })]);
    deckMock.generate.mockRejectedValueOnce(
      new GoogleAdsConfigError("Geen Google Ads-customer-ID ingesteld."),
    );
    const res = await request(makeApp())
      .post("/api/clients/1/generate-deck")
      .send({ kind: "audit" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Geen Google Ads-customer-ID ingesteld.");
  });

  it("maps an upstream/generation error to 502", async () => {
    queueResults([makeRow({ googleAdsCustomerId: "123-456-7890" })]);
    deckMock.generate.mockRejectedValueOnce(new Error("searchStream 500"));
    const res = await request(makeApp())
      .post("/api/clients/1/generate-deck")
      .send({ kind: "qbr" });
    expect(res.status).toBe(502);
    expect(res.body.error).toContain("QBR-deck");
    expect(res.body.detail).toBe("searchStream 500");
  });

  it("returns the generation result on success", async () => {
    queueResults([makeRow({ googleAdsCustomerId: "123-456-7890" })]);
    deckMock.generate.mockResolvedValueOnce({
      kind: "audit",
      slug: "audit-car-audio-limburg-demo",
      previewPath: "/audit-car-audio-limburg-demo/",
      client: "Acme NV",
      period: "1 januari – 12 juni",
    });
    const res = await request(makeApp())
      .post("/api/clients/1/generate-deck")
      .send({ kind: "audit" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.kind).toBe("audit");
    expect(res.body.previewPath).toBe("/audit-car-audio-limburg-demo/");
    expect(deckMock.generate).toHaveBeenCalledWith({
      kind: "audit",
      row: expect.objectContaining({ id: 1 }),
    });
  });
});
