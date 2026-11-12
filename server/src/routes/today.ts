// Today screen, "Run now", pause/resume, calendar list, and "delete all my data".
import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import type { TodayCallDTO, TodayResponse } from "../../../shared/api.js";
import { pauseSchema, settingsSchema } from "../../../shared/schemas.js";
import type { AppContext } from "../context.js";
import { Call, Person, User } from "../db/models.js";
import { dayInfo } from "../core/day.js";
import { checkGuards } from "../core/guards.js";
import { callLinks, nudgeMessage } from "../core/eventText.js";
import { CalendarAuthError } from "../calendar/provider.js";
import { HttpError } from "../lib/errors.js";
import { callToDTO } from "../services/dto.js";
import { removeUpcomingToday, runForUser } from "../jobs/daily.js";
import { destroy, SESSION_COOKIE } from "../auth/session.js";

const deleteAccountSchema = z.object({ confirm: z.literal("DELETE") });

export function todayRoutes(ctx: AppContext): Router {
  const router = Router();

  router.get("/today", async (_req, res) => {
    const user = res.locals.user;
    const settings = settingsSchema.parse(user.settings);
    const now = ctx.now();
    const day = dayInfo(now, settings.timezone);
    const calls = await Call.find({ userId: user._id, date: day.date }).sort({ start: 1 });
    // "trusted" tells the NoSQL-injection filter that this $in comes from our code, not from the user.
    const people = await Person.find({ userId: user._id, _id: mongoose.trusted({ $in: calls.map((c) => c.personId) }) });

    const dto: TodayCallDTO[] = calls.map((call) => {
      const person = people.find((p) => p.id === call.personId.toString());
      let links: TodayCallDTO["links"] = null;
      if (person) {
        const l = callLinks(ctx.cipher.decrypt(person.phoneEnc), nudgeMessage(person.name, call.start.getTime(), person.timezone));
        links = {
          call: l.call,
          whatsapp: person.nudge === "whatsapp" ? l.whatsapp : null,
          sms: person.nudge === "none" ? null : l.sms,
        };
      }
      return { ...callToDTO(call, ctx.cipher), links, nudge: (person?.nudge as TodayCallDTO["nudge"]) ?? null };
    });

    const ranToday = user.state?.lastPlanDate === day.date;
    const outcome = user.state?.lastOutcome ?? null;
    const body: TodayResponse = {
      date: day.date,
      status: checkGuards(now, settings),
      lastOutcome: ranToday || outcome === "reconnect-google" ? outcome : null,
      ranToday,
      runTime: settings.runTime,
      calls: dto,
      settings: {
        paused: settings.paused,
        pausedUntil: settings.pausedUntil,
        activeFrom: settings.activeFrom,
        activeTo: settings.activeTo,
      },
    };
    res.json(body);
  });

  /** "Run now": plan today immediately. Still obeys every rule, including the daily limit. */
  router.post("/today/run", async (_req, res) => {
    res.json(await runForUser(ctx, res.locals.user._id, "run-now"));
  });

  router.post("/settings/pause", async (req, res) => {
    const input = pauseSchema.parse(req.body);
    const user = res.locals.user;
    const settings = settingsSchema.parse({
      ...user.settings,
      paused: input.paused,
      pausedUntil: input.paused ? input.pausedUntil : null,
    });
    await User.updateOne({ _id: user._id }, { $set: { settings } });
    const removed = input.paused && input.removeTodayCall ? await removeUpcomingToday(ctx, user) : 0;
    res.json({ settings, removed });
  });

  router.get("/calendars", async (_req, res) => {
    try {
      res.json(await ctx.calendarFor(res.locals.user).listCalendars());
    } catch (err) {
      if (err instanceof CalendarAuthError) throw new HttpError(409, "Google access expired. Please sign in again.");
      throw err;
    }
  });

  /** Danger zone: remove today's upcoming call, revoke Google access, delete everything. */
  router.delete("/account", async (req, res) => {
    deleteAccountSchema.parse(req.body);
    const user = res.locals.user;
    try {
      await removeUpcomingToday(ctx, user);
    } catch {
      ctx.logger.warn("could not remove today's call while deleting the account");
    }
    if (user.refreshTokenEnc) {
      try {
        await ctx.oauth.revoke(ctx.cipher.decrypt(user.refreshTokenEnc));
      } catch {
        ctx.logger.warn("could not revoke the Google token (it may already be revoked)");
      }
    }
    await Promise.all([Call.deleteMany({ userId: user._id }), Person.deleteMany({ userId: user._id })]);
    await User.deleteOne({ _id: user._id });
    await destroy(req);
    res.clearCookie(SESSION_COOKIE);
    ctx.logger.info("account deleted");
    res.json({ ok: true });
  });

  return router;
}
