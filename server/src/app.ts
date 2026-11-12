// Builds the Express app. The ORDER of middleware matters for security:
//
//   1. security headers (helmet)          — every response
//   2. request logging (no query strings) — so OAuth codes never hit the logs
//   3. body size limit                    — reject huge requests early
//   4. /api/health                        — no session needed
//   5. /api/internal/* (cron secret)      — mounted BEFORE sessions and CSRF
//   6. sessions → rate limits → CSRF      — for everything else under /api
//   7. auth routes, then requireAuth, then the data routes
//   8. the built React app (production only)
//   9. error handler                      — last, turns errors into safe messages
import express, { type ErrorRequestHandler, type Router } from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { pinoHttp } from "pino-http";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import type { AppContext } from "./context.js";
import { csrfProtection, requireAuth } from "./auth/guards.js";
import { authRoutes } from "./auth/routes.js";
import { sessionMiddleware } from "./auth/session.js";
import { HttpError } from "./lib/errors.js";
import { peopleRoutes } from "./routes/people.js";
import { settingsRoutes } from "./routes/settings.js";
import { callRoutes } from "./routes/calls.js";

export interface ExtraRoutes {
  /** Routes that do not use sessions (protected by the cron secret instead). */
  internal?: Router;
  /** Extra auth routes (e.g. demo login). Mounted before the login check. */
  auth?: Router;
  /** Extra signed-in routes. */
  api?: Router[];
}

/** Error messages can contain values (e.g. a duplicate email). Hide anything that looks personal. */
export function scrub(text: string): string {
  return text
    .replace(/[^\s@"']+@[^\s@"']+/g, "[hidden]")
    .replace(/\+?\d[\d\s-]{6,}\d/g, "[hidden]")
    .slice(0, 300);
}

const limiter = (windowMinutes: number, limit: number) =>
  rateLimit({ windowMs: windowMinutes * 60_000, limit, standardHeaders: "draft-8", legacyHeaders: false });

export function createApp(ctx: AppContext, extra: ExtraRoutes = {}) {
  const { env } = ctx;
  const app = express();
  app.disable("x-powered-by");
  // On Render there is one proxy in front of us. Trusting it gives the real client IP
  // for rate limiting and lets secure cookies work behind HTTPS.
  if (env.isProduction) app.set("trust proxy", env.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          ...(env.isProduction ? { upgradeInsecureRequests: [] } : {}),
        },
      },
      hsts: env.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
      referrerPolicy: { policy: "same-origin" },
    }),
  );

  app.use(
    pinoHttp({
      logger: ctx.logger,
      // Log only the method, the path (no query string) and the status. Never headers or bodies.
      serializers: {
        req: (req: { method: string; url: string }) => ({ method: req.method, path: req.url.split("?")[0] }),
        res: (res: { statusCode: number }) => ({ status: res.statusCode }),
      },
      autoLogging: { ignore: (req) => req.url === "/api/health" },
    }),
  );

  app.use(express.json({ limit: "20kb" }));

  app.get("/api/health", (_req, res) => {
    // "demo" lets the login screen show the demo button. It reveals nothing else.
    res.json({ ok: true, demo: env.demoMode });
  });

  if (extra.internal) app.use("/api/internal", limiter(60, 60), extra.internal);

  app.use("/api", sessionMiddleware(env));
  // Strict limit on the login routes (slows down brute force), a looser one for the rest.
  app.use(["/api/auth/google", "/api/auth/demo"], limiter(15, 30));
  app.use("/api", limiter(15, 900));
  app.use("/api", csrfProtection(env.appOrigin, ["/auth/demo"]));

  app.use("/api/auth", authRoutes(ctx));
  if (extra.auth) app.use("/api/auth", extra.auth);

  app.use("/api", requireAuth(ctx.now, env.allowedEmails, env.demoMode));
  app.use("/api", peopleRoutes(ctx), settingsRoutes(ctx), callRoutes(ctx), ...(extra.api ?? []));

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // In production the same server also serves the built React app.
  const webDist = fileURLToPath(new URL("../../web/dist/", import.meta.url));
  if (env.isProduction && existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile("index.html", { root: webDist });
    });
  }

  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: "Please check the highlighted fields.",
        fields: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.publicMessage });
      return;
    }
    const type = (err as { type?: string }).type;
    if (type === "entity.too.large") {
      res.status(413).json({ error: "That request is too large." });
      return;
    }
    if (type === "entity.parse.failed") {
      res.status(400).json({ error: "That request was not valid JSON." });
      return;
    }
    // Unknown error: log what happened (no request body), reply with a generic message.
    req.log?.error({ err: { name: (err as Error).name, message: scrub((err as Error).message ?? "") } }, "unhandled error");
    res.status(500).json({ error: "Something went wrong. Please try again." });
  };
  app.use(errorHandler);

  return app;
}
