import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Standard security headers. This is a JSON API (no HTML responses), so the
// HTML-oriented CSP is unnecessary; and the web artifact consumes it across
// origins, so resources must stay readable cross-origin.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(cors());

// Rate-limit the two expensive, LLM-backed endpoints so a runaway client or an
// accidental retry loop can't burn tokens unbounded. All traffic reaches us via
// Replit's proxy (a single source IP), so this is effectively a global ceiling —
// fine for an internal agency tool. The cheap endpoints stay unlimited.
const llmLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  // We don't trust X-Forwarded-For (one upstream proxy); silence the related
  // validation and key off the direct socket IP instead.
  validate: { xForwardedForHeader: false },
  message: {
    error: "Te veel aanvragen na elkaar. Wacht even en probeer opnieuw.",
  },
});
app.use("/api/generate", llmLimiter);
app.use("/api/route", llmLimiter);
// Portrait uploads (POST /api/team/:slug/portrait) carry a base64-encoded image
// that exceeds the default 100kb JSON limit, so parse team routes with a larger
// cap. body-parser marks the request parsed, so the global parser below skips it.
app.use("/api/team", express.json({ limit: "12mb" }));
// Screaming Frog crawl intake (POST /api/crawl-intake) carries a raw CSV export
// that can be several MB, so parse that path as text with a larger cap.
// body-parser marks the request parsed, so the global JSON parser below skips it.
app.use(
  "/api/crawl-intake",
  express.text({ type: () => true, limit: "25mb" }),
);
// The in-app crawl upload (POST /api/clients/:id/crawl-upload) carries a CSV
// export inside a JSON body that can be several MB, so parse client routes with
// a larger cap. body-parser marks the request parsed, so the global JSON parser
// below skips it.
app.use("/api/clients", express.json({ limit: "25mb" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
