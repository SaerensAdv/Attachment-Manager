import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const generated = [
  path.resolve(root, "lib/api-client-react/src/generated"),
  path.resolve(root, "lib/api-zod/src/generated"),
];
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: here, stdio: "inherit", shell: process.platform === "win32" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}
try {
  await run("node", ["./prepare-atlas-openapi.mjs"]);
  await run("pnpm", ["exec", "orval", "--config", "./orval.config.ts"]);
  await run("pnpm", ["-w", "run", "typecheck:libs"]);
} catch (error) {
  console.error("Codegen failed, restoring the last committed generated clients.");
  await run("git", ["restore", "--source=HEAD", "--", ...generated]).catch(() => undefined);
  throw error;
} finally {
  await rm(path.resolve(here, ".atlas-openapi.generated.yaml"), { force: true });
}
