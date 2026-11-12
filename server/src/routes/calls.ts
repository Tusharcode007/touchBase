// Call history: list past calls, mark them Done/Skipped, add notes.
import { Router } from "express";
import { z } from "zod";
import { callUpdateSchema } from "../../../shared/schemas.js";
import type { AppContext } from "../context.js";
import { Call } from "../db/models.js";
import { notFound } from "../lib/errors.js";
import { callToDTO, parseId } from "../services/dto.js";

const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(60) });

export function callRoutes(ctx: AppContext): Router {
  const router = Router();

  router.get("/calls", async (req, res) => {
    const { limit } = listQuery.parse(req.query);
    const calls = await Call.find({ userId: res.locals.user._id }).sort({ start: -1 }).limit(limit);
    res.json(calls.map((c) => callToDTO(c, ctx.cipher)));
  });

  router.patch("/calls/:id", async (req, res) => {
    const update = callUpdateSchema.parse(req.body);
    const call = await Call.findOne({ _id: parseId(req.params.id), userId: res.locals.user._id });
    if (!call) throw notFound();
    if (update.status) {
      // Skipping a call that hasn't started yet also takes it out of the calendar.
      if (update.status === "skipped" && call.status === "scheduled" && call.start.getTime() > ctx.now() && call.eventId) {
        await ctx.calendarFor(res.locals.user).deleteEvent(call.calendarId, call.eventId);
      }
      call.status = update.status;
      call.settledAt = new Date(ctx.now());
    }
    if (update.notes !== undefined) call.notesEnc = update.notes ? ctx.cipher.encrypt(update.notes) : null;
    await call.save();
    res.json(callToDTO(call, ctx.cipher));
  });

  return router;
}
