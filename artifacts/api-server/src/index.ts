import app from "./app";
import { logger } from "./lib/logger";
import { warmSemanticIndex } from "./lib/semantic";
import { startScheduler } from "./lib/scheduler";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

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
