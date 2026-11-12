// Settings: call windows, active days, active period, run time, and so on.
import { Router } from "express";
import { settingsSchema } from "../../../shared/schemas.js";
import type { AppContext } from "../context.js";

export function settingsRoutes(_ctx: AppContext): Router {
  const router = Router();

  router.get("/settings", (_req, res) => {
    res.json(settingsSchema.parse(res.locals.user.settings));
  });

  router.put("/settings", async (req, res) => {
    // The whole settings object is checked by the shared schema before saving.
    const settings = settingsSchema.parse(req.body);
    const user = res.locals.user;
    user.settings = settings;
    user.markModified("settings");
    await user.save();
    res.json(settings);
  });

  return router;
}
