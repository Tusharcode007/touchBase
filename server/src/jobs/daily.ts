// The daily job: the "apply" layer around the pure planner.
//
// It runs on every hourly tick (and when I press "Run now"):
//   1. take a lock so two runs can't overlap
//   2. settle finished calls (done / skipped) and sync today's calls with the calendar
//   3. check the guards (paused? active period? active day?)
//   4. morning plan (once a day, after the run time) OR conflict check (later ticks)
//   5. apply the planner's actions to Google Calendar and the database
//   6. release the lock
//
// Order matters for idempotency: a call is saved to the database BEFORE its
// calendar event is created, so a crash can never lead to an extra call.
import mongoose from "mongoose";
import type { RunResult } from "../../../shared/api.js";
import { settingsSchema, type Relation, type Settings } from "../../../shared/schemas.js";
import type { AppContext } from "../context.js";
import { Call, Person, User, type CallDoc, type PersonDoc, type UserDoc } from "../db/models.js";
import { dayInfo, DAY_MS } from "../core/day.js";
import { eventDescription, eventTitle, extractNotes } from "../core/eventText.js";
import { checkGuards, isPastRunTime } from "../core/guards.js";
import { checkConflicts, planToday, type PlanAction, type PlanInput, type PlannerCall } from "../core/planner.js";
import { CalendarAuthError, type CalendarProvider, type NewEvent } from "../calendar/provider.js";
import { lastDoneByPerson } from "../services/dto.js";
import { offlineService } from "../ai/talkingPoints.js";
import { isAllowed } from "../auth/guards.js";

const LOCK_MS = 2 * 60 * 1000;
const { trusted } = mongoose;

export type RunMode = "tick" | "run-now";

/** Take the per-user lock. Returns false if another run holds it. */
async function acquireLock(userId: mongoose.Types.ObjectId, now: number): Promise<boolean> {
  const res = await User.updateOne(
    { _id: userId, $or: [{ "state.lockUntil": null }, { "state.lockUntil": trusted({ $lt: new Date(now) }) }] },
    { $set: { "state.lockUntil": new Date(now + LOCK_MS) } },
  );
  return res.modifiedCount === 1;
}

async function releaseLock(userId: mongoose.Types.ObjectId) {
  await User.updateOne({ _id: userId }, { $set: { "state.lockUntil": null } });
}

/** Calls that have ended become "done" — unless I deleted the event (then "skipped"). */
async function settleFinishedCalls(ctx: AppContext, user: UserDoc, calendar: CalendarProvider, now: number) {
  const finished = await Call.find({ userId: user._id, status: "scheduled", end: trusted({ $lte: new Date(now) }) });
  for (const call of finished) {
    const event = call.eventId ? await calendar.getEvent(call.calendarId, call.eventId) : null;
    call.status = event ? "done" : "skipped";
    call.settledAt = new Date(now);
    // Notes I typed into the calendar event are saved, unless I already wrote some in the dashboard.
    const typed = extractNotes(event?.description);
    if (typed && !call.notesEnc) call.notesEnc = ctx.cipher.encrypt(typed);
    await call.save();
  }
}

/** Keep today's upcoming calls in step with the calendar (I may have moved or deleted them). */
async function syncTodayCalls(calls: CallDoc[], calendar: CalendarProvider, day: { start: number; end: number }) {
  for (const call of calls) {
    if (call.status !== "scheduled") continue;
    if (!call.eventId) {
      // The job stopped between saving the call and creating the event. Look for the event by its tag.
      const own = await calendar.listOwnEvents(call.calendarId, day.start, day.end);
      const match = own.find((e) => e.callId === call.id);
      if (match) {
        call.eventId = match.eventId;
        await call.save();
      } else {
        await call.deleteOne();
      }
      continue;
    }
    const event = await calendar.getEvent(call.calendarId, call.eventId);
    if (!event) {
      call.status = "skipped"; // I deleted it: "not today"
      await call.save();
    } else if (event.start !== call.start.getTime() || event.end !== call.end.getTime()) {
      call.start = new Date(event.start); // I moved it by hand. placedStart stays, so we leave it alone.
      call.end = new Date(event.end);
      await call.save();
    }
  }
}

function toPlannerCall(c: CallDoc): PlannerCall {
  return {
    id: c.id,
    personId: c.personId.toString(),
    start: c.start.getTime(),
    end: c.end.getTime(),
    placedStart: c.placedStart.getTime(),
    status: c.status as PlannerCall["status"],
  };
}

/** The text for a call's calendar event: links, talking points, last notes. */
async function buildEvent(
  ctx: AppContext,
  user: UserDoc,
  settings: Settings,
  person: PersonDoc,
  callId: string,
  slot: { start: number; end: number },
  date: string,
  lastDone: Map<string, number>,
): Promise<NewEvent> {
  const lastWithNotes = await Call.findOne({
    userId: user._id,
    personId: person._id,
    status: "done",
    notesEnc: trusted({ $ne: null }),
  }).sort({ end: -1 });
  const lastNotes = lastWithNotes?.notesEnc ? ctx.cipher.decrypt(lastWithNotes.notesEnc) : null;
  const notes = person.notesEnc ? ctx.cipher.decrypt(person.notesEnc) : "";
  const last = lastDone.get(person.id) ?? null;

  const request = {
    personId: person.id,
    name: person.name,
    relation: person.relation as Relation,
    notes,
    lastNotes,
    date,
    useAi: settings.aiEnabled && (person.allowAi ?? true),
  };
  // Talking points must never break the job: on any error, use the built-in list.
  let topics;
  try {
    topics = await ctx.topics.pick(request);
  } catch {
    ctx.logger.warn("talking points failed, using the built-in list");
    topics = await offlineService().pick(request);
  }

  return {
    calendarId: settings.targetCalendarId,
    callId,
    title: eventTitle(person.name),
    description: eventDescription({
      name: person.name,
      phoneE164: ctx.cipher.decrypt(person.phoneEnc),
      nudge: person.nudge as "whatsapp" | "sms" | "none",
      start: slot.start,
      theirTimezone: person.timezone,
      callMinutes: Math.round((slot.end - slot.start) / 60_000),
      talkingPoints: topics.points,
      lastNotes,
      daysSinceLast: last === null ? null : Math.floor((slot.start - last) / DAY_MS),
    }),
    start: slot.start,
    end: slot.end,
    timezone: settings.timezone,
    reminderMinutes: settings.reminderMinutes,
  };
}

async function applyActions(
  ctx: AppContext,
  user: UserDoc,
  settings: Settings,
  calendar: CalendarProvider,
  actions: PlanAction[],
  people: PersonDoc[],
  date: string,
): Promise<number> {
  const byId = new Map(people.map((p) => [p.id, p]));
  const lastDone = await lastDoneByPerson(user._id);
  let created = 0;

  for (const action of actions) {
    if (action.type === "create") {
      const person = byId.get(action.personId);
      if (!person) continue;
      // 1) Save the call first (so the daily limit holds even if the next step crashes)…
      const call = await Call.create({
        userId: user._id,
        personId: person._id,
        personName: person.name,
        date,
        start: new Date(action.start),
        end: new Date(action.end),
        placedStart: new Date(action.start),
        calendarId: settings.targetCalendarId,
      });
      try {
        // 2) …then create the calendar event, tagged with the call's id.
        const event = await buildEvent(ctx, user, settings, person, call.id, action, date, lastDone);
        call.eventId = await calendar.createEvent(event);
        await call.save();
        await Person.updateOne({ _id: person._id }, { $set: { prioritizedAt: null } });
        created += 1;
      } catch (err) {
        await call.deleteOne();
        throw err;
      }
    } else if (action.type === "move") {
      const call = await Call.findOne({ _id: action.callId, userId: user._id });
      const person = byId.get(action.personId);
      if (!call?.eventId || !person) continue;
      const event = await buildEvent(ctx, user, settings, person, call.id, action, date, lastDone);
      await calendar.moveEvent(call.calendarId, call.eventId, event);
      call.start = new Date(action.start);
      call.end = new Date(action.end);
      call.placedStart = new Date(action.start);
      await call.save();
    } else {
      const call = await Call.findOne({ _id: action.callId, userId: user._id });
      if (!call) continue;
      if (call.eventId) await calendar.deleteEvent(call.calendarId, call.eventId);
      await call.deleteOne();
    }
  }
  return created;
}

/** Run the job for one user. Safe to call as often as you like (rule 3). */
export async function runForUser(ctx: AppContext, userId: mongoose.Types.ObjectId, mode: RunMode): Promise<RunResult> {
  const now = ctx.now();
  if (!(await acquireLock(userId, now))) return { status: "active", outcome: "busy", created: 0 };

  try {
    const user = await User.findById(userId);
    if (!user) return { status: "active", outcome: "no-user", created: 0 };
    const settings = settingsSchema.parse(user.settings);
    const day = dayInfo(now, settings.timezone);

    // "Pause until" date reached: switch the pause off by itself.
    if (settings.paused && settings.pausedUntil && day.date >= settings.pausedUntil) {
      settings.paused = false;
      settings.pausedUntil = null;
      await User.updateOne({ _id: user._id }, { $set: { settings } });
    }

    const calendar = ctx.calendarFor(user);
    await settleFinishedCalls(ctx, user, calendar, now);

    const status = checkGuards(now, settings);
    if (status !== "active") return { status, outcome: null, created: 0 };

    const todayDocs = await Call.find({ userId: user._id, date: day.date });
    await syncTodayCalls(todayDocs, calendar, day);

    const shouldPlan = mode === "run-now" || (isPastRunTime(now, settings) && user.state?.lastPlanDate !== day.date);
    const isAfterPlan = user.state?.lastPlanDate === day.date;
    if (!shouldPlan && !isAfterPlan) return { status, outcome: "waiting-for-run-time", created: 0 };

    const [people, lastDone, busy, todayCalls] = await Promise.all([
      Person.find({ userId: user._id }),
      lastDoneByPerson(user._id),
      calendar.busy(settings.checkCalendarIds, day.start, day.end, settings.timezone),
      Call.find({ userId: user._id, date: day.date }),
    ]);

    const input: PlanInput = {
      now,
      settings,
      people: people.map((p) => ({
        id: p.id,
        name: p.name,
        everyDays: p.everyDays,
        timezone: p.timezone,
        available: p.available.map((r) => ({ start: r.start ?? "00:00", end: r.end ?? "23:59" })),
        paused: p.paused ?? false,
        lastDoneAt: lastDone.get(p.id) ?? null,
        prioritized: p.prioritizedAt != null,
      })),
      busy,
      todayCalls: todayCalls.map(toPlannerCall),
    };

    if (shouldPlan) {
      const result = planToday(input);
      const created = await applyActions(ctx, user, settings, calendar, result.actions, people, day.date);
      await User.updateOne(
        { _id: user._id },
        { $set: { "state.lastPlanDate": day.date, "state.lastOutcome": result.outcome, "state.lastRunAt": new Date(now) } },
      );
      ctx.logger.info({ outcome: result.outcome, created }, "morning plan finished");
      return { status, outcome: result.outcome, created };
    }

    const result = checkConflicts(input);
    if (result.actions.length > 0) {
      await applyActions(ctx, user, settings, calendar, result.actions, people, day.date);
      ctx.logger.info({ changes: result.actions.length }, "conflict check moved or removed calls");
    }
    return { status, outcome: user.state?.lastOutcome ?? null, created: 0 };
  } catch (err) {
    if (err instanceof CalendarAuthError) {
      await User.updateOne({ _id: userId }, { $set: { "state.lastOutcome": "reconnect-google" } });
      ctx.logger.warn("google access no longer works; the user must sign in again");
      return { status: "active", outcome: "reconnect-google", created: 0 };
    }
    throw err;
  } finally {
    await releaseLock(userId);
  }
}

/** The hourly tick: run the job for every user, one at a time. One user's error never stops the others. */
export async function tickAll(ctx: AppContext): Promise<{ users: number; created: number; failed: number }> {
  const all = await User.find({}, { _id: 1, email: 1, demo: 1 });
  // Never touch the calendar of someone who is no longer on the allow list.
  const users = all.filter((u) => isAllowed(u, ctx.env.allowedEmails, ctx.env.demoMode));
  let created = 0;
  let failed = 0;
  for (const u of users) {
    try {
      created += (await runForUser(ctx, u._id as mongoose.Types.ObjectId, "tick")).created;
    } catch (err) {
      failed += 1;
      ctx.logger.error({ err: { name: (err as Error).name } }, "daily job failed for a user");
    }
  }
  return { users: users.length, created, failed };
}

/** When I pause: optionally remove today's call if it hasn't started yet. */
export async function removeUpcomingToday(ctx: AppContext, user: UserDoc): Promise<number> {
  const settings = settingsSchema.parse(user.settings);
  const now = ctx.now();
  const day = dayInfo(now, settings.timezone);
  const calendar = ctx.calendarFor(user);
  const upcoming = await Call.find({
    userId: user._id,
    date: day.date,
    status: "scheduled",
    start: trusted({ $gt: new Date(now) }),
  });
  for (const call of upcoming) {
    if (call.eventId) await calendar.deleteEvent(call.calendarId, call.eventId);
    await call.deleteOne();
  }
  return upcoming.length;
}
