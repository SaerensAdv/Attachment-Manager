import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const routesDir = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(routesDir, "docs.ts"), "utf8");
const knowledgeSource = readFileSync(join(routesDir, "../../../system-map/src/pages/Knowledge.tsx"), "utf8");

describe("native knowledge projection", () => {
  it("disables direct Atlas knowledge writes", () => {
    expect(routeSource).toContain('code: "ATLAS_KNOWLEDGE_WRITE_DISABLED"');
    expect(routeSource).not.toContain("writeDocFile(");
  });

  it("keeps ClickUp knowledge visible without copying content", () => {
    expect(knowledgeSource).toContain('node.source === "clickup"');
    expect(knowledgeSource).toContain("Content stays in ClickUp");
    expect(knowledgeSource).toContain("Open in ClickUp");
  });

  it("uses local filtering rather than presenting Atlas as a second search engine", () => {
    expect(knowledgeSource).toContain("Filter projected knowledge");
    expect(knowledgeSource).toContain("ClickUp owns content and search");
  });
});
