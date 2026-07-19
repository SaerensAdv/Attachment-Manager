import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const libDir = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(libDir, "../../../system-map/src/App.tsx"), "utf8");
const dock = readFileSync(join(libDir, "../../../system-map/src/components/atlas/AtlasCommandDock.tsx"), "utf8");
const routes = readFileSync(join(libDir, "../routes/index.ts"), "utf8");
const workspace = readFileSync(join(libDir, "../../../system-map/src/pages/WorkspaceGraph.tsx"), "utf8");

 describe("true legacy cleanup", () => {
  it("redirects old bookmarks without mounting legacy products", () => {
    expect(app).toContain('<Route path="/legacy"><Redirect to="/" /></Route>');
    expect(app).toContain('<Route path="/visuals"><Redirect to="/history" /></Route>');
    expect(app).not.toContain('from "@/pages/Home"');
    expect(app).not.toContain('from "@/pages/VisualStudio"');
    expect(app).not.toContain("AppChrome");
  });

  it("keeps the current Atlas graph and command dock", () => {
    expect(app).toContain('from "@/pages/WorkspaceGraph"');
    expect(app).toContain('from "@/components/atlas/AtlasCommandDock"');
    expect(workspace).toContain("WorkspaceGraphCanvas");
    expect(workspace).toContain("GraphLegend");
    expect(dock).toContain("CommandBar");
    expect(dock).toContain("GenerationPanel");
  });

  it("does not mount the Visual Studio backend", () => {
    expect(routes).not.toContain('from "./visuals"');
    expect(routes).not.toContain("visualsRouter");
  });
});
