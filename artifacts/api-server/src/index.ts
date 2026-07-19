import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./lib/logger";
import { validateEnv } from "./lib/env";
import { getRuntimeProvenance } from "./lib/runtime-provenance";

const runtimeDir = dirname(fileURLToPath(import.meta.url));
if (existsSync(join(runtimeDir, "AGENTS.md")) && existsSync(join(runtimeDir, "agents"))) process.chdir(runtimeDir);
const env = validateEnv();
const port = env.PORT;

const { reconcileCanonicalClientPortfolio } = await import("./lib/client-portfolio-migration");
await reconcileCanonicalClientPortfolio();
const { ensureRunGraphPolicy } = await import("./lib/run-graph-policy");
await ensureRunGraphPolicy();

const { default: app } = await import("./app");
const { warmSemanticIndex } = await import("./lib/semantic");
const { startScheduler } = await import("./lib/scheduler");
const { startClickUpWebhookWorker } = await import("./lib/clickup/webhook-worker");

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port, runtime: getRuntimeProvenance() }, "Server listening");
  warmSemanticIndex();
  startScheduler();
  startClickUpWebhookWorker();
});
