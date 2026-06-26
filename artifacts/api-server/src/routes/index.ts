import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import docsRouter from "./docs";
import generateRouter from "./generate";
import autonomousRouter from "./autonomous";
import routeRouter from "./route";
import intakeRouter from "./intake";
import crawlRouter from "./crawl";
import clientsRouter from "./clients";
import clientGroupsRouter from "./client-groups";
import generationsRouter from "./generations";
import proposalsRouter from "./proposals";
import teamRouter from "./team";
import storageRouter from "./storage";
import schedulesRouter from "./schedules";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(docsRouter);
router.use(generateRouter);
router.use(autonomousRouter);
router.use(routeRouter);
router.use(intakeRouter);
router.use(crawlRouter);
router.use(clientsRouter);
router.use(clientGroupsRouter);
router.use(generationsRouter);
router.use(proposalsRouter);
router.use(teamRouter);
router.use(storageRouter);
router.use(schedulesRouter);

export default router;
