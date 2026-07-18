import { describe, expect, it } from "vitest";
import { listDocFiles } from "./docs";
import { buildSourceInventory, loadSourceBaseline } from "./source-inventory";

describe("Phase 6 source inventory", () => {
  it("pins the pre-move source counts and computes deterministic content hashes", () => {
    const inventory = buildSourceInventory(listDocFiles(), loadSourceBaseline());
    expect(inventory.drift).toEqual([]);
    expect(inventory.total).toBe(85);
    expect(inventory.files.every((file) => file.contentHash.length === 64)).toBe(true);
    expect(inventory.contentHash).toHaveLength(64);
  });
});
