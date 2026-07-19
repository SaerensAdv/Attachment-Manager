import { describe, expect, it } from "vitest";
import { allowsList, readGraphCollectionPolicy } from "./collection-policy";

describe("client delivery collection policy", () => {
  it("allows every list only inside an explicitly full Space", () => {
    const policy = readGraphCollectionPolicy({ GRAPH_ALLOWED_LIST_IDS: "hq-list", GRAPH_FULL_SPACE_IDS: "client-space" });
    expect(allowsList("delivery-list", policy, "client-space")).toBe(true);
    expect(allowsList("delivery-list", policy, "hq-space")).toBe(false);
    expect(allowsList("hq-list", policy, "hq-space")).toBe(true);
  });

  it("parses reviewed Folder-to-Company ids and rejects malformed entries", () => {
    const policy = readGraphCollectionPolicy({ GRAPH_CLIENT_FOLDER_COMPANY_MAP: "folder-1:company-1,bad,folder-2:company-2:extra,folder-1:company-new" });
    expect(policy.clientFolderCompanyLinks).toEqual([{ folderId: "folder-1", companyTaskId: "company-new" }]);
  });
});
