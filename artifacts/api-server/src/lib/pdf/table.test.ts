import { describe, expect, it } from "vitest";
import { splitRow } from "./table";

describe("splitRow", () => {
  it("splits a pipe row into trimmed cells", () => {
    expect(splitRow("| Klikken | 245 | +12% |")).toEqual(["Klikken", "245", "+12%"]);
  });

  it("strips emphasis markers so cells never leak asterisks", () => {
    expect(splitRow("| Klikken | 245 | **+12%** |")).toEqual([
      "Klikken",
      "245",
      "+12%",
    ]);
    expect(splitRow("| *Positie* | 8,2 | 6,1 |")).toEqual(["Positie", "8,2", "6,1"]);
  });
});
