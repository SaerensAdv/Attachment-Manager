import { describe, it, expect } from "vitest";
import type { CorsOptions } from "cors";
import { resolveAllowedOrigins, buildCorsOptions } from "./cors-origins";

/**
 * Unit tests for the config-driven CORS allowlist. The previous `origin: true`
 * reflected ANY origin with credentials (effectively open), so the two
 * behaviours that matter here are: (1) only trusted origins are admitted, and
 * (2) a request with no Origin header (curl / server-to-server partner call) is
 * always allowed.
 */

/** Invoke the cors() origin callback synchronously and return the decision. */
function decide(
  options: CorsOptions,
  origin: string | undefined,
): boolean | Error {
  const fn = options.origin as (
    origin: string | undefined,
    cb: (err: Error | null, allow?: boolean) => void,
  ) => void;
  let result: boolean | Error = false;
  fn(origin, (err, allow) => {
    result = err ?? !!allow;
  });
  return result;
}

describe("resolveAllowedOrigins", () => {
  it("derives origins from REPLIT_DOMAINS and REPLIT_DEV_DOMAIN", () => {
    const origins = resolveAllowedOrigins({
      NODE_ENV: "production",
      REPLIT_DOMAINS: "app.example.repl.co, second.example.repl.co",
      REPLIT_DEV_DOMAIN: "preview.example.repl.dev",
    });
    expect(origins.has("https://app.example.repl.co")).toBe(true);
    expect(origins.has("https://second.example.repl.co")).toBe(true);
    expect(origins.has("https://preview.example.repl.dev")).toBe(true);
  });

  it("includes operator-configured extra origins (trailing slash normalized)", () => {
    const origins = resolveAllowedOrigins({
      NODE_ENV: "production",
      CORS_ALLOWED_ORIGINS: "https://voorbeeld.be/, https://tweede.be",
    });
    expect(origins.has("https://voorbeeld.be")).toBe(true);
    expect(origins.has("https://tweede.be")).toBe(true);
  });

  it("adds localhost only outside production", () => {
    const dev = resolveAllowedOrigins({ NODE_ENV: "development" });
    expect(dev.has("http://localhost:5173")).toBe(true);
    const prod = resolveAllowedOrigins({ NODE_ENV: "production" });
    expect(prod.has("http://localhost:5173")).toBe(false);
  });
});

describe("buildCorsOptions origin callback", () => {
  const env = {
    NODE_ENV: "production",
    REPLIT_DOMAINS: "app.example.repl.co",
  };

  it("keeps credentials on", () => {
    expect(buildCorsOptions(env).credentials).toBe(true);
  });

  it("allows a trusted origin", () => {
    const opts = buildCorsOptions(env);
    expect(decide(opts, "https://app.example.repl.co")).toBe(true);
  });

  it("rejects an untrusted origin (no error, just not allowed)", () => {
    const opts = buildCorsOptions(env);
    expect(decide(opts, "https://evil.example.com")).toBe(false);
  });

  it("always allows a request with no Origin header", () => {
    const opts = buildCorsOptions(env);
    expect(decide(opts, undefined)).toBe(true);
  });
});
