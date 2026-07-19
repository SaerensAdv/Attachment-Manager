import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const shell = readFileSync(path.resolve(root, "src/components/atlas/AtlasShell.tsx"), "utf8");
const auth = readFileSync(path.resolve(root, "src/components/AuthGate.tsx"), "utf8");

describe("SA brand logo", () => {
  it("uses the real logo in the Atlas rail", () => {
    expect(shell).toContain('import saLogo from "@/assets/sa-logo.webp"');
    expect(shell).toContain('<img src={saLogo} alt="Saerens Advertising" />');
    expect(shell).not.toContain("<span>SA</span>");
  });

  it("uses the real logo in auth loading and login branding", () => {
    expect(auth).toContain('import saLogo from "@/assets/sa-logo.webp"');
    expect(auth.split("src={saLogo}").length - 1).toBe(2);
  });
});
