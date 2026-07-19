import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const provider = readFileSync(path.resolve(root, "src/components/atlas/AtlasThemeProvider.tsx"), "utf8");
const shell = readFileSync(path.resolve(root, "src/components/atlas/AtlasShell.tsx"), "utf8");
const auth = readFileSync(path.resolve(root, "src/components/AuthGate.tsx"), "utf8");
const app = readFileSync(path.resolve(root, "src/App.tsx"), "utf8");
const theme = readFileSync(path.resolve(root, "src/components/atlas/AtlasTheme.css"), "utf8");

describe("global Atlas theme contract", () => {
  it("persists one global light or dark theme on the document root", () => {
    expect(provider).toContain('"atlas-theme"');
    expect(provider).toContain("document.documentElement");
    expect(provider).toContain("root.dataset.theme = theme");
    expect(app).toContain("<AtlasThemeProvider>");
  });

  it("exposes the same toggle in the authenticated shell and auth boundary", () => {
    expect(shell).toContain("AtlasThemeToggle");
    expect(auth).toContain("AtlasThemeToggle");
  });

  it("themes every primary app surface through semantic tokens", () => {
    for (const surface of ["operations-stage", "health-stage", "runs-stage", "clients-stage", "agents-stage", "knowledge-stage", "atlas-command-dock", "atlas-auth"]) {
      expect(theme).toContain(surface);
    }
    expect(theme).toContain('html[data-theme="light"]');
    expect(theme).toContain('html[data-theme="dark"]');
  });

  it("keeps zoomed-out graph marks legible without changing graph data", () => {
    expect(theme).toContain("vector-effect:non-scaling-stroke");
    expect(theme).toContain(".atlas-depth-far{opacity:.94}");
    expect(theme).toContain("--atlas-node-fill");
  });
});
