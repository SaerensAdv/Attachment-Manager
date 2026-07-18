import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./lib/logger";
import { validateEnv } from "./lib/env";

// Production deploys execute the bundled server without the repository tree.
// The build copies canonical agent/workflow/knowledge markdown beside this file;
// use that packaged tree as cwd so the existing document scanner can find it.
const runtimeDir = dirname(fileURLToPath(import.meta.url));
if (existsSync(join(runtimeDir, "AGENTS.md")) && existsSync(join(runtimeDir, "agents"))) {
  process.chdir(runtimeDir);
}

const env = validateEnv();
const port = env.PORT;
const { default: app } = await import("./app");
const { warmSemanticIndex } = await import("./lib/semantic");
const { startScheduler } = await import("./lib/scheduler");
const { reapplyAcceptedFileProposals } = await import("./lib/improvements");
const { startClickUpWebhookWorker } = await import("./lib/clickup/webhook-worker");

app.listen(port, (err) => {
  if (err) { logger.error({ err }, "Error listening on port"); process.exit(1); }
  logger.info({ port }, "Server listening");
  void (async () => {
    try {
      const { applied, skipped } = await reapplyAcceptedFileProposals();
      if (applied || skipped) logger.info({ applied, skipped }, "Geleerde regels hersteld na herstart/redeploy");
    } catch (err) { logger.warn({ err }, "Geleerde regels herstellen mislukte"); }
    warmSemanticIndex();
  })();
  startScheduler();
  startClickUpWebhookWorker();
});
