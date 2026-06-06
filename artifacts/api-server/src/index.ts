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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  // Warm the local semantic index in the background so the first search is fast.
  warmSemanticIndex();
  // Start the in-app scheduler so enabled schedules fire automatically.
  startScheduler();
});
