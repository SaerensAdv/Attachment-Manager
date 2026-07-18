import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { cp, copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(artifactDir, "../..");
const runtimeFolders = ["agents", "clients", "workflows", "templates", "knowledge"];

async function markdownFiles(root, folder) {
  const dir = path.join(root, folder);
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => `${folder}/${entry.name}`).sort();
}

async function packageRuntimeDocs(distDir) {
  await Promise.all([
    copyFile(path.join(workspaceDir, "AGENTS.md"), path.join(distDir, "AGENTS.md")),
    copyFile(path.join(workspaceDir, "ARCHITECTURE.md"), path.join(distDir, "ARCHITECTURE.md")),
  ]);
  for (const folder of runtimeFolders) await cp(path.join(workspaceDir, folder), path.join(distDir, folder), { recursive: true, force: true });

  const files = ["AGENTS.md", "ARCHITECTURE.md"];
  const counts = {};
  for (const folder of runtimeFolders) {
    const found = await markdownFiles(workspaceDir, folder);
    counts[folder] = found.length;
    files.push(...found);
  }
  const hash = createHash("sha256");
  for (const file of files.sort()) hash.update(file).update("\0").update(await readFile(path.join(workspaceDir, file))).update("\0");
  let gitSha = process.env.GITHUB_SHA || process.env.REPLIT_GIT_COMMIT || null;
  if (!gitSha) {
    try { gitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspaceDir, encoding: "utf8" }).trim(); }
    catch { gitSha = null; }
  }
  await writeFile(path.join(distDir, "runtime-manifest.json"), JSON.stringify({ version: 1, gitSha, builtAt: new Date().toISOString(), docsHash: hash.digest("hex"), counts }, null, 2));
}

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")], platform: "node", bundle: true, format: "esm", outdir: distDir,
    outExtension: { ".js": ".mjs" }, logLevel: "info",
    external: ["*.node", "pdfkit", "fontkit", "sharp", "better-sqlite3", "sqlite3", "canvas", "bcrypt", "argon2", "fsevents", "re2", "farmhash", "xxhash-addon", "bufferutil", "utf-8-validate", "ssh2", "cpu-features", "dtrace-provider", "isolated-vm", "lightningcss", "pg-native", "oracledb", "mongodb-client-encryption", "nodemailer", "handlebars", "knex", "typeorm", "protobufjs", "onnxruntime-node", "@huggingface/transformers", "@tensorflow/*", "@prisma/client", "@mikro-orm/*", "@grpc/*", "@swc/*", "@aws-sdk/*", "@azure/*", "@opentelemetry/*", "@google-cloud/*", "@google/*", "googleapis", "firebase-admin", "@parcel/watcher", "@sentry/profiling-node", "aws-sdk", "classic-level", "dd-trace", "ffi-napi", "grpc", "hiredis", "kerberos", "leveldown", "miniflare", "mysql2", "newrelic", "odbc", "piscina", "realm", "ref-napi", "rocksdb", "sass-embedded", "sequelize", "serialport", "snappy", "tinypool", "usb", "workerd", "wrangler", "zeromq", "zeromq-prebuilt", "playwright", "puppeteer", "puppeteer-core", "electron"],
    sourcemap: "linked", plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
    banner: { js: `import { createRequire as __bannerCrReq } from 'node:module';\nimport __bannerPath from 'node:path';\nimport __bannerUrl from 'node:url';\nglobalThis.require = __bannerCrReq(import.meta.url);\nglobalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);\nglobalThis.__dirname = __bannerPath.dirname(globalThis.__filename);` },
  });
  await packageRuntimeDocs(distDir);
}

buildAll().catch((err) => { console.error(err); process.exit(1); });
