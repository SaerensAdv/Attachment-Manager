import { logger } from "./lib/logger";
import { validateEnv } from "./lib/env";

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
