import { describe, expect, it } from "vitest";
import { getCompatibleDocFile, resolveCompatibleSourcePath } from "./source-docs";

describe("source document compatibility", () => {
  it("keeps the old canary path readable after the physical rename", () => {
    expect(resolveCompatibleSourcePath("knowledge/portrait-art-direction.md")).toBe("knowledge/portrait-direction.md");
    const oldLink = getCompatibleDocFile("knowledge/portrait-art-direction.md");
    const canonical = getCompatibleDocFile("knowledge/portrait-direction.md");
    expect(oldLink?.content).toBe(canonical?.content);
    expect(oldLink?.title).toBe("Portretrichting — Team");
  });
});
