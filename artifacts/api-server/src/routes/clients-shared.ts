import { clientsTable, type Client } from "@workspace/db";
import { collectClientUrls } from "../lib/website-intake";
import { clientFieldOwnership } from "../lib/clickup-company-master";

export function asTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
export function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}
export function serialize(client: Client) {
  const date = (value: Date | null) => (value ? value.toISOString() : null);
  return {
    ...client,
    websiteIntakeAt: date(client.websiteIntakeAt), googleAdsLiveAt: date(client.googleAdsLiveAt),
    competitorAdsLiveAt: date(client.competitorAdsLiveAt), searchConsoleLiveAt: date(client.searchConsoleLiveAt),
    bingLiveAt: date(client.bingLiveAt), ga4LiveAt: date(client.ga4LiveAt), placesLiveAt: date(client.placesLiveAt),
    pagespeedLiveAt: date(client.pagespeedLiveAt), businessProfileLiveAt: date(client.businessProfileLiveAt),
    crawlLiveAt: date(client.crawlLiveAt), createdAt: client.createdAt.toISOString(), updatedAt: client.updatedAt.toISOString(),
    sourceOfTruth: (client.clickupCompanyId ?? "").trim() ? "clickup" : "replit-unlinked",
    fieldOwnership: clientFieldOwnership(Boolean((client.clickupCompanyId ?? "").trim())),
  };
}
export function resolvePagespeedUrls(row: Client): string[] {
  const explicit=(row.pagespeedUrls??"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  return explicit.length?explicit:collectClientUrls(row.website,row.landingPages);
}
export { clientsTable };
