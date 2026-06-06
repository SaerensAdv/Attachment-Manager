import { describe, it, expect } from "vitest";
import { reciprocalRankFusion } from "./retrieval";

describe("reciprocalRankFusion", () => {
  it("returns an empty list when given no lists", () => {
    expect(reciprocalRankFusion([])).toEqual([]);
  });

  it("preserves order for a single ranked list", () => {
    expect(reciprocalRankFusion([["a", "b", "c"]])).toEqual(["a", "b", "c"]);
  });

  it("ignores empty lists without affecting the ranking", () => {
    expect(reciprocalRankFusion([["a", "b"], []])).toEqual(["a", "b"]);
  });

  it("floats an item ranked highly by both rankers above single-list items", () => {
    // "b" is mid in each list but appears in both; "a" and "x" each top only one.
    const lexical = ["a", "b", "c"];
    const semantic = ["x", "b", "y"];
    const fused = reciprocalRankFusion([lexical, semantic]);
    expect(fused[0]).toBe("b");
    expect(fused).toContain("a");
    expect(fused).toContain("x");
  });

  it("deduplicates items appearing in multiple lists", () => {
    const fused = reciprocalRankFusion([["a", "b"], ["b", "a"]]);
    expect([...fused].sort()).toEqual(["a", "b"]);
    expect(fused).toHaveLength(2);
  });

  it("ranks an item that is #1 in both lists at the top", () => {
    const fused = reciprocalRankFusion([
      ["top", "a", "b"],
      ["top", "c", "d"],
    ]);
    expect(fused[0]).toBe("top");
  });

  it("respects a consensus mid-rank item over a list-exclusive top item with a small k", () => {
    // With a small k, rank position matters more; a true #1 that appears in only
    // one list can still beat a consensus item. Verify the math is rank-sensitive.
    const exclusiveTop = reciprocalRankFusion(
      [["solo", "shared", "z"], ["q", "shared", "r"]],
      1,
    );
    // "shared" is rank 2 in both: 1/(1+2) + 1/(1+2) = 0.667.
    // "solo" is rank 1 in one: 1/(1+1) = 0.5. So shared wins.
    expect(exclusiveTop[0]).toBe("shared");
  });
});
