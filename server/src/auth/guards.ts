// Middleware that protects routes: login check, CSRF check, cron secret check.
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { safeEqual } from "../lib/crypto.js";
import { User, type UserDoc } from "../db/models.js";
import { ABSOLUTE_MS, destroy, SESSION_COOKIE } from "./session.js";

declare module "express-serve-static-core" {
  interface Locals {
    user: UserDoc;
  }
}

/** Only signed-in users get past this. Also enforces the 7-day absolute session limit. */
export function requireAuth(now: () => number): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { userId, createdAt } = req.session;
    if (!userId || !createdAt) {
      res.status(401).json({ error: "Please sign in." });
      return;
    }
    if (now() - createdAt > ABSOLUTE_MS) {
      await destroy(req);
      res.clearCookie(SESSION_COOKIE);
      res.status(401).json({ error: "Your session expired. Please sign in again." });
      return;
    }
    const user = await User.findById(userId);
    if (!user) {
      await destroy(req);
      res.status(401).json({ error: "Please sign in." });
      return;
    }
    res.locals.user = user;
    next();
  };
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF protection for every request that changes data:
 *  1. If the browser says where the request came from (Origin/Referer), it must be our app.
 *  2. The request must carry the secret token from GET /api/auth/me in the X-CSRF-Token header.
 * A different website can make your browser send a request, but it cannot read our token.
 */
export function csrfProtection(appOrigin: string, exemptPaths: string[] = []): RequestHandler {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method) || exemptPaths.includes(req.path)) {
      next();
      return;
    }
    const origin = req.get("origin");
    const referer = req.get("referer");
    let from: string | null = origin ?? null;
    if (!from && referer) {
      try {
        from = new URL(referer).origin;
      } catch {
        from = "invalid";
      }
    }
    if (from && from !== appOrigin) {
      res.status(403).json({ error: "Security check failed. Please refresh the page." });
      return;
    }
    const sent = req.get("x-csrf-token");
    const expected = req.session.csrfToken;
    if (!sent || !expected || !safeEqual(sent, expected)) {
      res.status(403).json({ error: "Security check failed. Please refresh the page." });
      return;
    }
    next();
  };
}

/** The hourly GitHub Actions job proves itself with a secret bearer token. */
export function requireCronSecret(cronSecret: string): RequestHandler {
  return (req, res, next) => {
    const header = req.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    if (!token || !safeEqual(token, cronSecret)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };
}
