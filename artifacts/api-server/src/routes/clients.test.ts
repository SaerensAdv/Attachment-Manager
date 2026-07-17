import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

// Core client route tests keep testing their original SQL/HTTP contract. The
// ClickUp ownership middleware has its own focused tests and is bypassed here so
// it does not consume an extra mocked DB result before the route under test.
vi.mock("./client-master-guard", () => ({
  guardClickUpOwnedClientFields: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const dbResults: unknown[][] = [];
function queueResults(...rows: unknown[][]): void { dbResults.push(...rows); }

vi.mock("@workspace/db", () => {
  const chain: Record<string, unknown> = {};
  for (const method of ["select","from","where","orderBy","insert","values","returning","update","set","delete"]) chain[method] = () => chain;
  chain.then = (resolve: (v: unknown[]) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(dbResults.shift() ?? []).then(resolve, reject);
  return { db: chain, clientsTable: { id: "id", name: "name", updatedAt: "updatedAt" } };
});
const { eqMock, andMock } = vi.hoisted(() => ({ eqMock: vi.fn((...args: unknown[]) => ({ eq: args })), andMock: vi.fn((...args: unknown[]) => ({ and: args })) }));
vi.mock("drizzle-orm", () => ({ eq: eqMock, and: andMock }));
const { gmbMock } = vi.hoisted(() => ({ gmbMock: { fetch: vi.fn() } }));
vi.mock("../lib/business-profile", () => { class BusinessProfileConfigError extends Error { constructor(message:string){super(message);this.name="BusinessProfileConfigError";} } return { BusinessProfileConfigError, fetchBusinessProfileReport: (...args:unknown[])=>gmbMock.fetch(...args) }; });
import { BusinessProfileConfigError } from "../lib/business-profile";
const { deckMock } = vi.hoisted(() => ({ deckMock: { generate: vi.fn() } }));
vi.mock("../lib/deck-generation", () => ({ generateDeckForRow:(...args:unknown[])=>deckMock.generate(...args), buildAuditDataForRow:vi.fn(), buildQbrDataForRow:vi.fn() }));
import { GoogleAdsConfigError } from "../lib/google-ads";
import clientsRouter from "./clients";
function makeApp():Express{const app=express();app.use(express.json());app.use("/api",clientsRouter);return app;}
const CREATED_AT=new Date("2026-01-01T00:00:00.000Z"),UPDATED_AT=new Date("2026-01-02T00:00:00.000Z");
function makeRow(over:Record<string,unknown>={}){return{id:1,name:"Acme NV",createdAt:CREATED_AT,updatedAt:UPDATED_AT,websiteIntakeAt:null,googleAdsLiveAt:null,...over};}
beforeEach(()=>{dbResults.length=0;eqMock.mockClear();andMock.mockClear();gmbMock.fetch.mockReset();deckMock.generate.mockReset();});

describe("PUT /api/clients/:id — optimistic locking",()=>{
 it("updates and returns the row when the version still matches",async()=>{queueResults([makeRow()]);const res=await request(makeApp()).put("/api/clients/1").send({name:"Acme NV",updatedAt:UPDATED_AT.toISOString()});expect(res.status).toBe(200);expect(res.body.id).toBe(1);expect(res.body.updatedAt).toBe(UPDATED_AT.toISOString());expect(res.body.createdAt).toBe(CREATED_AT.toISOString());});
 it("returns 409 with the current row when the version moved on",async()=>{const current=makeRow({name:"Changed Elsewhere"});queueResults([],[current]);const res=await request(makeApp()).put("/api/clients/1").send({name:"My Edit",updatedAt:UPDATED_AT.toISOString()});expect(res.status).toBe(409);expect(res.body.error).toContain("elders aangepast");expect(res.body.current.name).toBe("Changed Elsewhere");});
 it("returns 404 when the row is gone",async()=>{queueResults([],[]);const res=await request(makeApp()).put("/api/clients/1").send({name:"My Edit",updatedAt:UPDATED_AT.toISOString()});expect(res.status).toBe(404);});
 it("rejects an invalid id before touching the database",async()=>{const res=await request(makeApp()).put("/api/clients/abc").send({name:"Acme NV"});expect(res.status).toBe(400);expect(dbResults).toHaveLength(0);});
 it("rejects a missing name before touching the database",async()=>{const res=await request(makeApp()).put("/api/clients/1").send({});expect(res.status).toBe(400);expect(res.body.error).toBe("Naam is verplicht.");});
 it("rejects a malformed Google Ads customer id",async()=>{const res=await request(makeApp()).put("/api/clients/1").send({name:"Acme NV",googleAdsCustomerId:"abc-123"});expect(res.status).toBe(400);expect(res.body.error).toContain("enkel cijfers en streepjes");});
 it("folds the version check into the UPDATE predicate",async()=>{queueResults([makeRow()]);await request(makeApp()).put("/api/clients/1").send({name:"Acme NV",updatedAt:UPDATED_AT.toISOString()});expect(andMock).toHaveBeenCalled();const cols=eqMock.mock.calls.map(c=>c[0]);expect(cols).toContain("id");expect(cols).toContain("updatedAt");});
 it("updates by id alone when no version is supplied",async()=>{queueResults([makeRow()]);await request(makeApp()).put("/api/clients/1").send({name:"Acme NV"});expect(andMock).not.toHaveBeenCalled();});
});
describe("clients CRUD basics",()=>{it("creates",async()=>{queueResults([makeRow({id:7,name:"New Client"})]);const res=await request(makeApp()).post("/api/clients").send({name:"New Client"});expect(res.status).toBe(201);});it("lists",async()=>{queueResults([makeRow(),makeRow({id:2,name:"Beta"})]);const res=await request(makeApp()).get("/api/clients");expect(res.body.clients).toHaveLength(2);});it("404 missing",async()=>{queueResults([]);expect((await request(makeApp()).get("/api/clients/999")).status).toBe(404);});it("deletes",async()=>{queueResults([makeRow()]);expect((await request(makeApp()).delete("/api/clients/1")).status).toBe(204);});it("404 delete missing",async()=>{queueResults([]);expect((await request(makeApp()).delete("/api/clients/999")).status).toBe(404);});});
describe("business profile refresh",()=>{it("invalid id",async()=>{expect((await request(makeApp()).post("/api/clients/abc/business-profile-refresh")).status).toBe(400);});it("missing client",async()=>{queueResults([]);expect((await request(makeApp()).post("/api/clients/1/business-profile-refresh")).status).toBe(404);});it("missing config",async()=>{queueResults([makeRow({businessProfileLocationId:null})]);expect((await request(makeApp()).post("/api/clients/1/business-profile-refresh")).status).toBe(400);});it("config error",async()=>{queueResults([makeRow({businessProfileLocationId:"123"})]);gmbMock.fetch.mockRejectedValueOnce(new BusinessProfileConfigError("Ongeldige locatie."));expect((await request(makeApp()).post("/api/clients/1/business-profile-refresh")).status).toBe(400);});it("upstream error",async()=>{queueResults([makeRow({businessProfileLocationId:"123"})]);gmbMock.fetch.mockRejectedValueOnce(new Error("not allowlisted"));expect((await request(makeApp()).post("/api/clients/1/business-profile-refresh")).status).toBe(502);});it("success",async()=>{const fetchedAt=new Date("2026-06-01T00:00:00Z");queueResults([makeRow({businessProfileLocationId:"123"})],[makeRow({businessProfileLocationId:"123",businessProfileLive:"GMB report text",businessProfileLiveAt:fetchedAt})]);gmbMock.fetch.mockResolvedValueOnce({text:"GMB report text",fetchedAt});expect((await request(makeApp()).post("/api/clients/1/business-profile-refresh")).status).toBe(200);});});
describe("generate deck",()=>{it("invalid id",async()=>{expect((await request(makeApp()).post("/api/clients/abc/generate-deck").send({kind:"audit"})).status).toBe(400);});it("invalid kind",async()=>{expect((await request(makeApp()).post("/api/clients/1/generate-deck").send({kind:"bogus"})).status).toBe(400);});it("missing client",async()=>{queueResults([]);expect((await request(makeApp()).post("/api/clients/1/generate-deck").send({kind:"audit"})).status).toBe(404);});it("config error",async()=>{queueResults([makeRow({googleAdsCustomerId:"123-456-7890"})]);deckMock.generate.mockRejectedValueOnce(new GoogleAdsConfigError("missing"));expect((await request(makeApp()).post("/api/clients/1/generate-deck").send({kind:"audit"})).status).toBe(400);});it("upstream error",async()=>{queueResults([makeRow({googleAdsCustomerId:"123-456-7890"})]);deckMock.generate.mockRejectedValueOnce(new Error("500"));expect((await request(makeApp()).post("/api/clients/1/generate-deck").send({kind:"qbr"})).status).toBe(502);});it("success",async()=>{queueResults([makeRow({googleAdsCustomerId:"123-456-7890"})]);deckMock.generate.mockResolvedValueOnce({kind:"audit",previewPath:"/x"});expect((await request(makeApp()).post("/api/clients/1/generate-deck").send({kind:"audit"})).status).toBe(200);});});
