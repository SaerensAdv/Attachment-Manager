import { describe, it, expect, afterEach } from "vitest";
import { publicBaseUrl, saerensLogoUrl, saerensLogoPngBuffer } from "./brand-logo";

const ORIGINAL = {
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
  REPLIT_DEV_DOMAIN: process.env.REPLIT_DEV_DOMAIN,
};

afterEach(() => {
  for (const [k, v] of Object.entries(ORIGINAL)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("publicBaseUrl", () => {
  it("prefers PUBLIC_BASE_URL (deployment override) and trims a trailing slash", () => {
    process.env.PUBLIC_BASE_URL = "https://app.saerens.com/";
    process.env.REPLIT_DEV_DOMAIN = "dev.example.repl.co";
    expect(publicBaseUrl()).toBe("https://app.saerens.com");
  });

  it("falls back to the Replit dev domain as https when no override is set", () => {
    delete process.env.PUBLIC_BASE_URL;
    process.env.REPLIT_DEV_DOMAIN = "dev.example.repl.co";
    expect(publicBaseUrl()).toBe("https://dev.example.repl.co");
  });

  it("returns null when neither is configured (degrade to no logo)", () => {
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.REPLIT_DEV_DOMAIN;
    expect(publicBaseUrl()).toBeNull();
  });
});

describe("saerensLogoUrl", () => {
  it("builds the absolute /api/brand/logo.png URL from the public base", () => {
    process.env.PUBLIC_BASE_URL = "https://app.saerens.com";
    expect(saerensLogoUrl()).toBe("https://app.saerens.com/api/brand/logo.png");
  });

  it("is null when no public base URL is configured", () => {
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.REPLIT_DEV_DOMAIN;
    expect(saerensLogoUrl()).toBeNull();
  });
});

describe("saerensLogoPngBuffer", () => {
  it("decodes to a non-empty PNG (magic bytes)", () => {
    const buf = saerensLogoPngBuffer();
    expect(buf.length).toBeGreaterThan(0);
    // PNG signature: 89 50 4E 47
    expect(buf.subarray(0, 4).toString("hex")).toBe("89504e47");
  });
});
