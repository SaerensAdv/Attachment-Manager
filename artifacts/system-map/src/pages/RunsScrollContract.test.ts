import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./RunsHub.css", import.meta.url), "utf8");

describe("history run list scroll contract", () => {
  it("bounds the index and gives the run list the remaining height", () => {
    expect(css).toContain(".runs-index{min-height:0;overflow:hidden}");
    expect(css).toContain(".runs-list{flex:1 1 0;min-height:0;overflow-y:auto");
  });

  it("keeps filters and pagination outside the scrolling region", () => {
    expect(css).toContain(".runs-index-filters{flex:0 0 auto");
    expect(css).toContain(".runs-pagination{flex:0 0 auto");
  });
});
