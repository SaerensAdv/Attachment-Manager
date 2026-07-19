import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const theme = readFileSync(path.resolve(process.cwd(), "src/components/atlas/AtlasTheme.css"), "utf8");

describe("light mode contrast polish", () => {
  it("uses a deliberate mid-light canvas instead of near-white washout", () => {
    expect(theme).toContain("--atlas-surface-0:oklch(93% .018 278)");
    expect(theme).toContain("--atlas-canvas-center:oklch(87.5% .045 244)");
    expect(theme).not.toContain("--atlas-canvas-center:oklch(93% .025 245)");
  });

  it("strengthens light graph nodes, labels and edges at overview scale", () => {
    expect(theme).toContain('html[data-theme="light"] .atlas-node-core{stroke-width:2.5px!important}');
    expect(theme).toContain('html[data-theme="light"] .atlas-edge{stroke-width:1.55px}');
    expect(theme).toContain('html[data-theme="light"] .atlas-depth-far{opacity:1}');
    expect(theme).toContain('html[data-theme="light"] .atlas-node-copy text{font-weight:700}');
  });

  it("gives the selected lens a valid high-contrast state", () => {
    expect(theme).toContain('html[data-theme="light"] .atlas-modes button.is-active');
    expect(theme).toContain("background:hsl(var(--primary))!important");
    expect(theme).toContain("color:hsl(var(--primary-foreground))!important");
  });
});
