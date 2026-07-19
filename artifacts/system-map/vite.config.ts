import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);
const basePath = process.env.BASE_PATH;
if (!basePath) throw new Error("BASE_PATH environment variable is required but was not provided.");
const workspaceDir = path.resolve(import.meta.dirname, "../..");
function buildSha() { const fromEnv = process.env.GITHUB_SHA || process.env.REPLIT_GIT_COMMIT; if (fromEnv) return fromEnv; try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspaceDir, encoding: "utf8" }).trim(); } catch { return process.env.NODE_ENV === "development" ? "development" : "unknown"; } }

export default defineConfig({
  base: basePath,
  define: { __ATLAS_BUILD_SHA__: JSON.stringify(buildSha()) },
  plugins: [react(), tailwindcss(), runtimeErrorOverlay(), ...(process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined ? [await import("@replit/vite-plugin-cartographer").then((m) => m.cartographer({ root: path.resolve(import.meta.dirname, "..") })), await import("@replit/vite-plugin-dev-banner").then((m) => m.devBanner())] : [])],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src"), "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets") }, dedupe: ["react", "react-dom"] },
  root: path.resolve(import.meta.dirname),
  build: { outDir: path.resolve(import.meta.dirname, "dist/public"), emptyOutDir: true },
  server: { port, strictPort: true, host: "0.0.0.0", allowedHosts: true, fs: { strict: true } },
  preview: { port, host: "0.0.0.0", allowedHosts: true },
});
