import { logger } from "./lib/logger";
import { validateEnv } from "./lib/env";

// Validate env BEFORE importing the app graph. The app transitively imports the
// db client, which throws at import time on a missing DATABASE_URL — so we keep
// these as dynamic imports below, after validateEnv(), so env.ts owns the
// boot-time error messages and warns about a partial optional integration first.
const env = validateEnv();
const port = env.PORT;

const { default: app } = await import("./app");
const { warmSemanticIndex } = await import("./lib/semantic");
const { startScheduler } = await import("./lib/scheduler");
const { reapplyAcceptedFileProposals } = await import("./lib/improvements");

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  // Restore durable file-based "learned rules" first (a redeploy rebuilds the
  // knowledge docs from the repo, wiping rules the learning loop appended at
  // runtime), THEN warm the semantic index so search includes them. Both run in
  // the background and are best-effort — neither may block serving requests.
  void (async () => {
    try {
      const { applied, skipped } = await reapplyAcceptedFileProposals();
      if (applied || skipped) {
        logger.info(
          { applied, skipped },
          "Geleerde regels hersteld na herstart/redeploy",
        );
      }
    } catch (err) {
      logger.warn({ err }, "Geleerde regels herstellen mislukte");
    }
    // Warm the local semantic index so the first search is fast.
    warmSemanticIndex();
  })();
  // Start the in-app scheduler so enabled schedules fire automatically.
  startScheduler();
});
