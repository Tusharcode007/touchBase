// Demo mode: try the whole app without Google.
// Only mounted when DEMO_MODE=true, and the server refuses DEMO_MODE in production.
//
// "Sign in" creates a demo user with sample people and some past calls, then
// runs today's plan against the fake calendar.
import { Router } from "express";
import { defaultSettings } from "../../../shared/schemas.js";
import type { AppContext } from "../context.js";
import { Call, Person, User, type UserDoc } from "../db/models.js";
import { dayInfo, DAY_MS } from "../core/day.js";
import { randomToken } from "../lib/crypto.js";
import { regenerate, save } from "../auth/session.js";
import { runForUser } from "../jobs/daily.js";
import { createFakeCalendar, type FakeCalendar } from "../calendar/fake.js";

export const DEMO_EMAIL = "demo@touchbase.local";

interface SamplePerson {
  name: string;
  relation: string;
  phone: string;
  everyDays: number;
  /** Days since the last call, or null if never called. */
  daysAgo: number | null;
  notes: string;
  /** Notes from the last call. */
  last: string | null;
  timezone?: string;
  available?: { start: string; end: string }[];
}

// Sample people. Phone numbers are made up.
const SAMPLE: SamplePerson[] = [
  { name: "Mom", relation: "parent", phone: "+919000000001", everyDays: 2, daysAgo: 3, notes: "Knee pain — ask if the physio is helping.", last: "Her knee is a bit better. Dad is planning a Goa trip in December." },
  { name: "Dad", relation: "parent", phone: "+919000000002", everyDays: 3, daysAgo: 2, notes: "Loves cricket. Retiring next year.", last: null },
  { name: "Priya didi", relation: "sibling", phone: "+919000000003", everyDays: 5, daysAgo: 6, notes: "Preparing for her CA exams.", last: "Exams start on the 20th. She is nervous." },
  { name: "Nani", relation: "grandparent", phone: "+919000000004", everyDays: 7, daysAgo: 12, notes: "Speaks Hindi. Call before 9 pm.", last: null },
  { name: "Rahul", relation: "friend", phone: "+14155550132", everyDays: 10, daysAgo: 4, notes: "Lives in San Francisco.", last: "Started his new job at a startup.", timezone: "America/Los_Angeles", available: [{ start: "08:00", end: "23:00" }] },
  { name: "Aisha", relation: "friend", phone: "+919000000005", everyDays: 7, daysAgo: null, notes: "School best friend.", last: null },
  { name: "Kabir mama", relation: "relative", phone: "+919000000006", everyDays: 21, daysAgo: 30, notes: "", last: null },
];

async function seed(ctx: AppContext, user: UserDoc) {
  if ((await Person.countDocuments({ userId: user._id })) > 0) return;
  const now = ctx.now();
  for (const s of SAMPLE) {
    const timezone = s.timezone ?? "Asia/Kolkata";
    const person = await Person.create({
      userId: user._id,
      name: s.name,
      relation: s.relation,
      phoneEnc: ctx.cipher.encrypt(s.phone),
      everyDays: s.everyDays,
      timezone,
      available: s.available ?? [],
      nudge: "whatsapp",
      notesEnc: s.notes ? ctx.cipher.encrypt(s.notes) : null,
    });
    if (s.daysAgo === null) continue;
    const start = new Date(now - s.daysAgo * DAY_MS - 3 * 60 * 60 * 1000);
    await Call.create({
      userId: user._id,
      personId: person._id,
      personName: person.name,
      date: dayInfo(start.getTime(), "Asia/Kolkata").date,
      start,
      end: new Date(start.getTime() + 15 * 60_000),
      placedStart: start,
      calendarId: "primary",
      eventId: null,
      status: "done",
      notesEnc: s.last ? ctx.cipher.encrypt(s.last) : null,
      settledAt: new Date(now),
    });
  }
}

export function demoRoutes(ctx: AppContext): Router {
  const router = Router();
  router.post("/demo", async (req, res) => {
    let user = await User.findOne({ email: DEMO_EMAIL });
    if (!user) {
      user = await User.create({
        email: DEMO_EMAIL,
        name: "Demo user",
        demo: true,
        settings: defaultSettings(dayInfo(ctx.now(), "Asia/Kolkata").date),
      });
    }
    await seed(ctx, user);
    await regenerate(req);
    req.session.userId = user.id;
    req.session.createdAt = ctx.now();
    req.session.csrfToken = randomToken();
    await save(req);
    await runForUser(ctx, user._id, "run-now");
    res.json({ ok: true });
  });
  return router;
}

/** One fake calendar per demo user, kept in memory while the server runs. */
export function demoCalendars() {
  const calendars = new Map<string, FakeCalendar>();
  return (userId: string): FakeCalendar => {
    let cal = calendars.get(userId);
    if (!cal) {
      cal = createFakeCalendar();
      calendars.set(userId, cal);
    }
    return cal;
  };
}
