import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./client-portfolio-migration.ts", import.meta.url), "utf8");

describe("canonical client portfolio migration contract", () => {
  it("pins five Companies and twelve reviewed technical profiles", () => {
    for (const company of ["Icon BV", "LCS BV", "Schoonpannendak BV", "MMA Distributie BV", "Finson BV"]) expect(source).toContain(`name: \"${company}\"`);
    for (const profile of ["Beauty Icon", "Waterlek", "Fuitedetect", "Noodpakket België", "Kit d'Urgence Belgique", "Sanidetect", "Slotenmakerij Louis", "Loodgieterij Louis", "Schoonpannendak", "Schoondak", "Goedkoopdrank", "Elektrische Boilers"]) expect(source).toContain(`\"${profile}\"`);
  });

  it("hides legacy rows instead of deleting their technical data", () => {
    expect(source).toContain("portfolio_visible=false");
    expect(source).not.toMatch(/DELETE FROM clients/i);
  });
});
