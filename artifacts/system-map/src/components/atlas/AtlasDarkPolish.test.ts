import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.resolve(process.cwd(), "src/components/atlas/AtlasDarkPolish.css"), "utf8");

describe("dark mode micro polish", () => {
  it("lifts only the dark canvas surface", () => {
    expect(css).toContain('html[data-theme="dark"] .wg-canvas');
    expect(css).toContain("--atlas-surface-0:oklch(18% .026 278)");
    expect(css).not.toContain('html[data-theme="light"]');
  });

  it("strengthens default dark edges without touching labels or chrome", () => {
    expect(css).toContain("--wg-edge:218 30% 66%");
    expect(css).toContain(".atlas-edge{stroke-width:1.38px}");
    expect(css).not.toContain("atlas-node-copy");
    expect(css).not.toContain("atlas-header");
  });
});
