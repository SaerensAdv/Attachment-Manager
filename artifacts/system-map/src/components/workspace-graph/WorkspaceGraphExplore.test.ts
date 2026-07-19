import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const canvas = readFileSync(path.resolve(process.cwd(), "src/components/workspace-graph/WorkspaceGraphCanvas.tsx"), "utf8");
const motion = readFileSync(path.resolve(process.cwd(), "src/components/workspace-graph/WorkspaceGraphMotion.css"), "utf8");

describe("Workspace Explore contract", () => {
  it("caps graph repaints at 45 FPS", () => {
    expect(canvas).toMatch(/GRAPH_FRAME_MS\s*=\s*1000\s*\/\s*45/);
    expect(canvas).not.toMatch(/GRAPH_FRAME_MS\s*=\s*1000\s*\/\s*60/);
  });

  it("keeps Explore below desktop lens filters and visibly active", () => {
    expect(motion).toMatch(/\.atlas-explore-toggle\{[^}]*top:72px/);
    expect(motion).toMatch(/\.atlas-explore-toggle\[aria-pressed="true"\]/);
    expect(motion).toContain('content:"45 FPS"');
    expect(canvas).toContain('Explore active');
  });

  it("uses meaningful perspective and parallax but respects reduced motion", () => {
    expect(motion).toContain("perspective(1200px)");
    expect(canvas).toContain("--atlas-parallax-x");
    expect(canvas).toContain("--atlas-tilt-x");
    expect(motion).toMatch(/prefers-reduced-motion:reduce/);
    expect(motion).toContain(".atlas-explore .atlas-graph-world{transform:none}");
  });

  it("keeps viewport movement non-persistent", () => {
    expect(canvas).not.toMatch(/fetch\(|mutate\(|axios|localStorage/);
  });
});
