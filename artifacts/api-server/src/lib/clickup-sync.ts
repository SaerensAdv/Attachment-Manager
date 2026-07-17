/**
 * ClickUp link-only sync (READ ONLY) — match existing app clients to the master
 * companies in ClickUp (CRM → Companies) and propose a back-reference link.
 *
 * This module NEVER writes to either side. It builds a review payload the UI
 * renders; the user confirms links via POST /clients/clickup/apply, which only
 * ever fills the `clickupCompanyId` on an app client (compare-and-fill, never
 * overwrite). Nothing is created in the app and nothing is touched in ClickUp.
 *
 * The two populations diverge (the app and the CRM hold different client sets),
 * so most rows land in "unmatched on both sides" — that's expected and exactly
 * why this is link-only rather than a mirror.
 */

import { db, clientsTable, type Client } from "@workspace/db";
import {
  listClickUpCompanies,
  ClickUpConfigError,
  type ClickUpCompany,
} from "./clickup";

/** A confident 1:1 link proposal between an app client and a ClickUp company. */
export interface ClickUpSyncLink {
  clientId: number;
  clientName: string;
  companyId: string;
  companyName: string;
  matchBy: "domein" | "naam";
  reason: string;
}

/** A minimal ClickUp company reference for the review lists. */
export interface ClickUpCompanyRef {
  id: string;
  name: string;
  website: string | null;
  status: string | null;
}

/** An app client that already carries a ClickUp link. */
export interface ClickUpAlreadyLinked {
  clientId: number;
  clientName: string;
  companyId: string;
  /** Company name from the current CRM list, or null if it's no longer there. */
  companyName: string | null;
}

/** An app client with no confident ClickUp match. */
export interface ClickUpUnmatchedClient {
  clientId: number;
  clientName: string;
  website: string | null;
}

export interface ClickUpSyncResult {
  /** False when the ClickUp token is missing or the API could not be reached. */
  available: boolean;
  companyCount: number;
  clientCount: number;
  links: ClickUpSyncLink[];
  alreadyLinked: ClickUpAlreadyLinked[];
  unmatchedClients: ClickUpUnmatchedClient[];
  unmatchedCompanies: ClickUpCompanyRef[];
  warnings: string[];
}

/** Lowercase, strip diacritics + common legal suffixes + all non-alphanumerics. */
function normalizeName(raw: string): string {
  const STOP = new Set(["bv", "bvba", "nv", "vof", "sa", "srl", "comm", "mcc"]);
  return (raw ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP.has(t))
    .join("");
}

/** Strip a leading "www." from a hostname. */
function stripWww(host: string): string {
  return host.replace(/^www\./, "");
}

/** Normalized registrable-ish domain for a website value, or null. */
function domainFromWebsite(website: string | null | undefined): string | null {
  const v = (website ?? "").trim();
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    return stripWww(new URL(withScheme).hostname.toLowerCase()) || null;
  } catch {
    return null;
  }
}

function toRef(c: ClickUpCompany): ClickUpCompanyRef {
  return { id: c.id, name: c.name, website: c.website, status: c.status };
}

/**
 * Run the link-only sync against ClickUp companies and the current client table.
 * Pure read: builds link proposals + unmatched lists, never writes.
 */
export async function syncClickUpCompanies(): Promise<ClickUpSyncResult> {
  const warnings: string[] = [];

  let companies: ClickUpCompany[] = [];
  try {
    companies = await listClickUpCompanies();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // A missing token is an expected "not set up yet" state, not a hard error.
    warnings.push(
      err instanceof ClickUpConfigError
        ? msg
        : `ClickUp-bedrijven konden niet worden opgehaald: ${msg}`,
    );
    return {
      available: false,
      companyCount: 0,
      clientCount: 0,
      links: [],
      alreadyLinked: [],
      unmatchedClients: [],
      unmatchedCompanies: [],
      warnings,
    };
  }

  const clients: Client[] = await db.select().from(clientsTable);

  const companyById = new Map<string, ClickUpCompany>();
  const companyByName = new Map<string, ClickUpCompany[]>();
  const companyByDomain = new Map<string, ClickUpCompany[]>();
  for (const c of companies) {
    companyById.set(c.id, c);
    const nameNorm = normalizeName(c.name);
    if (nameNorm) {
      const arr = companyByName.get(nameNorm) ?? [];
      arr.push(c);
      companyByName.set(nameNorm, arr);
    }
    const domain = domainFromWebsite(c.website);
    if (domain) {
      const arr = companyByDomain.get(domain) ?? [];
      arr.push(c);
      companyByDomain.set(domain, arr);
    }
  }

  const links: ClickUpSyncLink[] = [];
  const alreadyLinked: ClickUpAlreadyLinked[] = [];
  const unmatchedClients: ClickUpUnmatchedClient[] = [];
  // Company ids already spoken for (existing link OR proposed link) so a company
  // is never linked to two clients.
  const consumed = new Set<string>();

  // Pass 1: record existing links first so they claim their company before we
  // propose any new ones.
  for (const client of clients) {
    const linkedId = (client.clickupCompanyId ?? "").trim();
    if (!linkedId) continue;
    consumed.add(linkedId);
    alreadyLinked.push({
      clientId: client.id,
      clientName: client.name,
      companyId: linkedId,
      companyName: companyById.get(linkedId)?.name ?? null,
    });
  }

  // Pass 2: propose confident 1:1 links for still-unlinked clients.
  for (const client of clients) {
    if ((client.clickupCompanyId ?? "").trim()) continue;

    // (a) Domain match wins — most reliable signal.
    const domain = domainFromWebsite(client.website);
    const domainMatches = (domain ? companyByDomain.get(domain) : undefined)?.filter(
      (c) => !consumed.has(c.id),
    );
    if (domain && domainMatches && domainMatches.length === 1) {
      const company = domainMatches[0];
      consumed.add(company.id);
      links.push({
        clientId: client.id,
        clientName: client.name,
        companyId: company.id,
        companyName: company.name,
        matchBy: "domein",
        reason: `Website-domein ${domain} komt overeen met "${company.name}" in ClickUp.`,
      });
      continue;
    }

    // (b) Exact normalized-name match — only when unique on both sides.
    const nameNorm = normalizeName(client.name);
    const nameMatches = (nameNorm ? companyByName.get(nameNorm) : undefined)?.filter(
      (c) => !consumed.has(c.id),
    );
    if (nameNorm && nameMatches && nameMatches.length === 1) {
      const company = nameMatches[0];
      consumed.add(company.id);
      links.push({
        clientId: client.id,
        clientName: client.name,
        companyId: company.id,
        companyName: company.name,
        matchBy: "naam",
        reason: `Naam komt exact overeen met "${company.name}" in ClickUp.`,
      });
      continue;
    }

    unmatchedClients.push({
      clientId: client.id,
      clientName: client.name,
      website: client.website ?? null,
    });
  }

  // Companies nobody links to (existing or proposed) → unmatched on the CRM side.
  const unmatchedCompanies = companies
    .filter((c) => !consumed.has(c.id))
    .map(toRef)
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));

  links.sort((a, b) => a.clientName.localeCompare(b.clientName, "nl"));
  unmatchedClients.sort((a, b) => a.clientName.localeCompare(b.clientName, "nl"));

  return {
    available: true,
    companyCount: companies.length,
    clientCount: clients.length,
    links,
    alreadyLinked,
    unmatchedClients,
    unmatchedCompanies,
    warnings,
  };
}
