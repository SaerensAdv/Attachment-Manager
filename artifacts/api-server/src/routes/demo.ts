import { Router, type IRouter } from "express";
import { runDemo } from "../lib/demo-deliverables";

/**
 * TEMPORARY dev-only route to run the deliverables demonstration in-process.
 * Fire-and-forget: the long team runs continue inside the persistent server
 * after the response returns. Disabled in production. Remove after the demo.
 */
const router: IRouter = Router();

router.post("/demo/run", (_req, res): void => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  void runDemo();
  res.status(202).json({ started: true });
});

export default router;
