import { Router, type IRouter } from "express";
import discoveryRouter from "./clients-discovery";
import coreRouter from "./clients-core";
import liveDataRouter from "./clients-live-data";
import billingRouter from "./clients-billing";

/**
 * The clients API, split into focused modules by responsibility:
 *  - clients-discovery: read-only account discovery + apply-confirmed-results
 *  - clients-core:      CRM (CRUD) + cheap read overviews (coverage, revenue)
 *  - clients-live-data: integration refreshes, snapshots, deck data + generation
 *  - clients-billing:   factuur (invoice) + offerte (proposal) PDFs
 *
 * The HTTP surface is unchanged — every route keeps its exact path and behaviour.
 * Mount order matters: discovery's static `GET /clients/discovery` must be
 * registered before core's parameterised `GET /clients/:id`, or `discovery`
 * would be captured as an id. Within each module the original registration order
 * is preserved.
 */
const router: IRouter = Router();

router.use(discoveryRouter);
router.use(coreRouter);
router.use(liveDataRouter);
router.use(billingRouter);

export default router;
