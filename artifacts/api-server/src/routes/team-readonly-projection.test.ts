import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const routeSource = readFileSync(join(root, "artifacts/api-server/src/routes/team.ts"), "utf8");
const atlasSource = readFileSync(join(root, "artifacts/system-map/src/pages/AtlasAgents.tsx"), "utf8");

describe("ClickUp-native agent projection", () => {
  it("keeps the API projection explicitly read-only", () => {
    expect(routeSource).toContain('projectionMode: "read-only"');
    expect(routeSource).toContain('code: "ATLAS_AGENT_WRITE_DISABLED"');
    expect(routeSource).not.toContain("updateAgentPersona(");
    expect(routeSource).not.toContain("savePortrait(");
  });

  it("does not expose agent mutation hooks in Atlas", () => {
    expect(atlasSource).not.toContain("useUpdateAgentPersona");
    expect(atlasSource).not.toContain("useUploadAgentPortrait");
    expect(atlasSource).toContain("Read-only projection");
    expect(atlasSource).toContain("ClickUp canonical");
    expect(atlasSource).toContain("GitHub canonical");
  });

  it("reports ClickUp and software source failures independently", () => {
    expect(atlasSource).toContain("Software-agent source degraded");
    expect(atlasSource).toContain("ClickUp-agent source degraded");
  });
});
