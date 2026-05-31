import { Router, type IRouter } from "express";
import healthRouter from "./health";
import docsRouter from "./docs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(docsRouter);

export default router;
