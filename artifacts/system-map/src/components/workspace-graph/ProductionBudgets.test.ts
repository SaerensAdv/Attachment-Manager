import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const canvasPath = path.resolve(root, "src/components/workspace-graph/WorkspaceGraphCanvas.tsx");
const motionPath = path.resolve(root, "src/components/workspace-graph/WorkspaceGraphMotion.css");
const appPath = path.resolve(root, "src/App.tsx");
const canvas = readFileSync(canvasPath, "utf8");
const motion = readFileSync(motionPath, "utf8");
const app = readFileSync(appPath, "utf8");

describe("production budgets", () => {
  it("keeps the visual digital twin on the 45 FPS contract", () => {
    expect(canvas).toMatch(/GRAPH_FRAME_MS\s*=\s*1000\s*\/\s*45/);
    expect(canvas).toContain("document.visibilityState");
    expect(motion).toContain("prefers-reduced-motion:reduce");
  });

  it("keeps critical graph source files bounded", () => {
    expect(statSync(canvasPath).size).toBeLessThan(30_000);
    expect(statSync(motionPath).size).toBeLessThan(12_000);
    expect(statSync(appPath).size).toBeLessThan(8_000);
  });

  it("preserves current Atlas routes and excludes deleted products", () => {
    expect(app).toContain('from "@/pages/WorkspaceGraph"');
    expect(app).toContain('from "@/pages/SystemHealth"');
    expect(app).not.toContain('from "@/pages/Home"');
    expect(app).not.toContain('from "@/pages/VisualStudio"');
  });
});
