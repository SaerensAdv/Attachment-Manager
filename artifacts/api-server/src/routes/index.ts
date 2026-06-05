import { Router, type IRouter } from "express";
import healthRouter from "./health";
import docsRouter from "./docs";
import generateRouter from "./generate";
import autonomousRouter from "./autonomous";
import routeRouter from "./route";
import intakeRouter from "./intake";
import clientsRouter from "./clients";
import generationsRouter from "./generations";
import proposalsRouter from "./proposals";
import teamRouter from "./team";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(docsRouter);
router.use(generateRouter);
router.use(autonomousRouter);
router.use(routeRouter);
router.use(intakeRouter);
router.use(clientsRouter);
router.use(generationsRouter);
router.use(proposalsRouter);
router.use(teamRouter);
router.use(storageRouter);

export default router;
