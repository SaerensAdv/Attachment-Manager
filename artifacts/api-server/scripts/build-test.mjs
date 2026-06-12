import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";

globalThis.require = createRequire(import.meta.url);
const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await esbuild({
  entryPoints: [path.resolve(artifactDir, "scripts/test-head-aliases.ts")],
  platform: "node",
  bundle: true,
  format: "esm",
  outdir: path.resolve(artifactDir, "dist"),
  outExtension: { ".js": ".mjs" },
  logLevel: "info",
  external: [
    "*.node",
    "pdfkit",
    "fontkit",
    "sharp",
    "better-sqlite3",
    "@huggingface/transformers",
    "onnxruntime-node",
    "@swc/*",
    "@google-cloud/*",
    "@google/*",
    "googleapis",
  ],
  plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
  banner: {
    js: `import { createRequire as __cr } from 'node:module';
import __p from 'node:path';
import __u from 'node:url';
globalThis.require = __cr(import.meta.url);
globalThis.__filename = __u.fileURLToPath(import.meta.url);
globalThis.__dirname = __p.dirname(globalThis.__filename);`,
  },
});
