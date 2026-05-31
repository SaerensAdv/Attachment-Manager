import { Router, type IRouter } from "express";
import healthRouter from "./health";
import docsRouter from "./docs";
import generateRouter from "./generate";
import routeRouter from "./route";
import intakeRouter from "./intake";

const router: IRouter = Router();

router.use(healthRouter);
router.use(docsRouter);
router.use(generateRouter);
router.use(routeRouter);
router.use(intakeRouter);

export default router;
