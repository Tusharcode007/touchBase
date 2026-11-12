// POST /api/internal/tick — called every hour by GitHub Actions.
// Protected by CRON_SECRET (not a login), and mounted before sessions/CSRF.
// The reply contains only counts: the workflow logs are public.
import { Router } from "express";
import type { AppContext } from "../context.js";
import { requireCronSecret } from "../auth/guards.js";
import { tickAll } from "../jobs/daily.js";

export function internalRoutes(ctx: AppContext): Router {
  const router = Router();
  router.post("/tick", requireCronSecret(ctx.env.cronSecret), async (_req, res) => {
    const result = await tickAll(ctx);
    res.json({ ok: true, ...result });
  });
  return router;
}
