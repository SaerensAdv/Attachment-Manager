import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Unit tests for the ClickUp link-only matching engine. The database (the app's
 * client table) and the ClickUp provider (the CRM company list) are both mocked,
 * so these assert the pure matching logic in isolation: domain-first then exact
 * normalized-name matching, the 1:1 uniqueness guards (ambiguous names and
 * already-consumed companies never link), the already-linked pass claiming its
 * company first, and the "not set up yet" degradation to available:false.
 */

const dbResults: unknown[][] = [];
function queueClients(rows: unknown[]): void {
  dbResults.push(rows);
}

vi.mock("@workspace/db", () => {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "from", "where"]) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: (v: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(dbResults.shift() ?? []).then(resolve, reject);
  return { db: chain, clientsTable: {} };
});

const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }));
vi.mock("./clickup", () => {
  class ClickUpConfigError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ClickUpConfigError";
    }
  }
  return {
    listClickUpCompanies: (...args: unknown[]) => listMock(...args),
    ClickUpConfigError,
  };
});

// Imported after the mocks above (vi.mock is hoisted).
import { ClickUpConfigError } from "./clickup";
import { syncClickUpCompanies } from "./clickup-sync";

function company(over: Record<string, unknown> = {}) {
  return { id: "c1", name: "Company", website: null, status: null, ...over };
}
function client(over: Record<string, unknown> = {}) {
  return { id: 1, name: "Client", website: null, clickupCompanyId: null, ...over };
}

beforeEach(() => {
  dbResults.length = 0;
  listMock.mockReset();
});

describe("syncClickUpCompanies", () => {
  it("proposes a domain link, a name link, and lists what stays unmatched", async () => {
    listMock.mockResolvedValueOnce([
      company({ id: "cad", name: "Car Audio", website: "http://www.caraudio.be" }),
      company({ id: "cbeta", name: "Beta", website: null }),
      company({ id: "corphan", name: "Lonely BV", website: null, status: "prospect" }),
    ]);
    queueClients([
      client({ id: 1, name: "Something Else", website: "https://caraudio.be" }),
      client({ id: 2, name: "Beta NV", website: null }),
      client({ id: 3, name: "No Match Here", website: null }),
    ]);

    const res = await syncClickUpCompanies();

    expect(res.available).toBe(true);
    expect(res.companyCount).toBe(3);
    expect(res.clientCount).toBe(3);

    // Domain wins for client 1 → "Car Audio".
    const byDomain = res.links.find((l) => l.clientId === 1);
    expect(byDomain?.companyId).toBe("cad");
    expect(byDomain?.matchBy).toBe("domein");

    // Exact normalized name for client 2 ("Beta NV" → "beta") → "Beta".
    const byName = res.links.find((l) => l.clientId === 2);
    expect(byName?.companyId).toBe("cbeta");
    expect(byName?.matchBy).toBe("naam");

    // Client 3 has no signal; company "Lonely BV" has no client.
    expect(res.unmatchedClients.map((c) => c.clientId)).toEqual([3]);
    expect(res.unmatchedCompanies.map((c) => c.id)).toEqual(["corphan"]);
    expect(res.alreadyLinked).toEqual([]);
  });

  it("does not link when a normalized name is ambiguous on the ClickUp side", async () => {
    listMock.mockResolvedValueOnce([
      company({ id: "g1", name: "Gamma" }),
      company({ id: "g2", name: "Gamma BV" }),
    ]);
    queueClients([client({ id: 1, name: "Gamma", website: null })]);

    const res = await syncClickUpCompanies();

    expect(res.links).toEqual([]);
    expect(res.unmatchedClients.map((c) => c.clientId)).toEqual([1]);
    expect(res.unmatchedCompanies.map((c) => c.id).sort()).toEqual(["g1", "g2"]);
  });

  it("lets an existing link claim its company before any new proposal", async () => {
    listMock.mockResolvedValueOnce([
      company({ id: "shared", name: "Shared", website: "https://shared.be" }),
    ]);
    queueClients([
      client({ id: 1, name: "Owner", clickupCompanyId: "shared" }),
      // Would match the same company by domain, but it's already consumed.
      client({ id: 2, name: "Contender", website: "https://shared.be" }),
    ]);

    const res = await syncClickUpCompanies();

    expect(res.alreadyLinked).toEqual([
      { clientId: 1, clientName: "Owner", companyId: "shared", companyName: "Shared" },
    ]);
    expect(res.links).toEqual([]); // company already claimed
    expect(res.unmatchedClients.map((c) => c.clientId)).toEqual([2]);
    expect(res.unmatchedCompanies).toEqual([]); // "shared" is consumed by the link
  });

  it("flags an existing link whose company is gone from the CRM", async () => {
    listMock.mockResolvedValueOnce([]);
    queueClients([client({ id: 1, name: "Orphan", clickupCompanyId: "vanished" })]);

    const res = await syncClickUpCompanies();

    expect(res.alreadyLinked[0]).toEqual({
      clientId: 1,
      clientName: "Orphan",
      companyId: "vanished",
      companyName: null,
    });
  });

  it("degrades to available:false with a warning when the token is missing", async () => {
    listMock.mockRejectedValueOnce(new ClickUpConfigError("token ontbreekt"));
    queueClients([client()]);

    const res = await syncClickUpCompanies();

    expect(res.available).toBe(false);
    expect(res.companyCount).toBe(0);
    expect(res.warnings[0]).toBe("token ontbreekt");
    expect(res.links).toEqual([]);
  });

  it("surfaces a non-config API failure as available:false with a warning", async () => {
    listMock.mockRejectedValueOnce(new Error("HTTP 500"));
    queueClients([client()]);

    const res = await syncClickUpCompanies();

    expect(res.available).toBe(false);
    expect(res.warnings[0]).toContain("HTTP 500");
  });
});
