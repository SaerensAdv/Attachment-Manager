import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import partnerRouter from "./routes/partner";
import clickupWebhookRouter from "./routes/clickup-webhook";
import { authMiddleware } from "./middlewares/authMiddleware";
import { requireAuth } from "./middlewares/requireAuth";
import { buildCorsOptions } from "./lib/cors-origins";
import { logger } from "./lib/logger";
import { getRuntimeProvenance } from "./lib/runtime-provenance";
import { apiProblem } from "./lib/http-contract";

const app: Express = express();
app.use(pinoHttp({ logger, serializers: { req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; }, res(res) { return { statusCode: res.statusCode }; } } }));
app.use((_req, res, next) => { const provenance = getRuntimeProvenance(); res.setHeader("x-atlas-api-sha", provenance.gitSha ?? "unknown"); res.setHeader("x-atlas-manifest-hash", provenance.manifestHash ?? "unknown"); next(); });
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors(buildCorsOptions()));
app.use(cookieParser());

const llmLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false,
  validate: { xForwardedForHeader: false }, message: apiProblem({ error: "Too many requests. Wait briefly and try again.", code: "RATE_LIMITED", retryable: true }) });
app.use("/api/generate", llmLimiter); app.use("/api/route", llmLimiter); app.use("/api/v1/partner/generations", llmLimiter); app.use("/api/visuals", llmLimiter);
app.use("/api/webhooks/clickup", express.raw({ type: "application/json", limit: "1mb" }), clickupWebhookRouter);
app.use("/api/team", express.json({ limit: "12mb" }));
app.use("/api/crawl-intake", express.text({ type: () => true, limit: "25mb" }));
app.use("/api/clients", express.json({ limit: "25mb" }));
app.use(express.json()); app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware); app.use("/api/v1/partner", partnerRouter); app.use("/api", requireAuth); app.use("/api", router);
export default app;
