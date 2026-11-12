// Sign-in routes.
//
// Flow (see docs/FLOW.md "Sign in"):
//   GET  /api/auth/google            → make state + PKCE verifier, save in session, send to Google
//   GET  /api/auth/google/callback   → check state, swap code for tokens, check email is allowed,
//                                      new session ID, save encrypted refresh token
//   GET  /api/auth/me                → who am I + CSRF token
//   POST /api/auth/logout            → end the session
import { Router } from "express";
import { z } from "zod";
import { defaultSettings } from "../../../shared/schemas.js";
import type { MeResponse } from "../../../shared/api.js";
import type { AppContext } from "../context.js";
import { User } from "../db/models.js";
import { pkceChallenge, randomToken, safeEqual } from "../lib/crypto.js";
import { dayInfo } from "../core/day.js";
import { HttpError } from "../lib/errors.js";
import { destroy, regenerate, save, SESSION_COOKIE } from "./session.js";

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

const callbackQuery = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().min(1).max(256).optional(),
  error: z.string().max(256).optional(),
});

export function authRoutes(ctx: AppContext): Router {
  const router = Router();
  const home = (error?: string) => (error ? `${ctx.env.appUrl}/?error=${encodeURIComponent(error)}` : `${ctx.env.appUrl}/`);

  router.get("/google", async (req, res) => {
    if (ctx.env.demoMode) {
      res.redirect(home("demo-mode"));
      return;
    }
    const state = randomToken();
    const verifier = randomToken(48);
    req.session.oauth = { state, verifier, createdAt: ctx.now() };
    await save(req);
    res.redirect(ctx.oauth.authUrl(state, pkceChallenge(verifier)));
  });

  router.get("/google/callback", async (req, res) => {
    const query = callbackQuery.safeParse(req.query);
    const pending = req.session.oauth;
    delete req.session.oauth; // a state value can only be used once

    if (!query.success || query.data.error || !query.data.code || !query.data.state || !pending) {
      res.redirect(home("login-failed"));
      return;
    }
    // The state must match what we stored, or this could be a forged login.
    if (!safeEqual(query.data.state, pending.state) || ctx.now() - pending.createdAt > STATE_MAX_AGE_MS) {
      res.redirect(home("login-failed"));
      return;
    }

    let identity;
    try {
      identity = await ctx.oauth.exchange(query.data.code, pending.verifier);
    } catch (err) {
      const missingScope = err instanceof HttpError && err.publicMessage === "calendar-permission-missing";
      ctx.logger.warn({ reason: missingScope ? "missing-scope" : "exchange-failed" }, "google sign-in failed");
      res.redirect(home(missingScope ? "calendar-permission-missing" : "login-failed"));
      return;
    }

    // Owner only: anyone not on the list is turned away and nothing about them is stored.
    if (!identity.emailVerified || !ctx.env.allowedEmails.includes(identity.email)) {
      await destroy(req);
      res.clearCookie(SESSION_COOKIE);
      ctx.logger.warn("sign-in refused: email not on the allow list");
      res.redirect(home("not-allowed"));
      return;
    }

    let user = await User.findOne({ email: identity.email });
    if (!user) {
      const today = dayInfo(ctx.now(), "Asia/Kolkata").date;
      user = new User({ email: identity.email, settings: defaultSettings(today) });
    }
    user.googleSub = identity.sub;
    user.name = identity.name;
    if (identity.refreshToken) user.refreshTokenEnc = ctx.cipher.encrypt(identity.refreshToken);
    if (!user.refreshTokenEnc) {
      res.redirect(home("no-refresh-token"));
      return;
    }
    await user.save();

    // New session ID after login stops "session fixation" attacks.
    await regenerate(req);
    req.session.userId = user.id;
    req.session.createdAt = ctx.now();
    req.session.csrfToken = randomToken();
    await save(req);
    ctx.logger.info("user signed in");
    res.redirect(home());
  });

  router.get("/me", async (req, res) => {
    if (!req.session.userId) {
      res.status(401).json({ error: "Please sign in." });
      return;
    }
    const user = await User.findById(req.session.userId);
    if (!user) {
      await destroy(req);
      res.status(401).json({ error: "Please sign in." });
      return;
    }
    if (!req.session.csrfToken) {
      req.session.csrfToken = randomToken();
      await save(req);
    }
    const body: MeResponse = {
      email: user.email,
      name: user.name ?? "",
      demo: user.demo ?? false,
      csrfToken: req.session.csrfToken,
      aiAvailable: ctx.env.anthropicApiKey !== null,
    };
    res.json(body);
  });

  router.post("/logout", async (req, res) => {
    await destroy(req);
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  });

  return router;
}
