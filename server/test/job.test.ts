// The daily job end to end: real API + database, fake calendar, controllable clock.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { DateTime } from "luxon";
import { createApp } from "../src/app.js";
import { internalRoutes } from "../src/routes/internal.js";
import { todayRoutes } from "../src/routes/today.js";
import { Call, Person, User } from "../src/db/models.js";
import type { CalendarProvider } from "../src/calendar/provider.js";
import type { FakeCalendar } from "../src/calendar/fake.js";
import type { TopicService } from "../src/ai/talkingPoints.js";
import { clearDb, makeContext, signIn, startDb, testEnv, validPerson, type TestContext, type TestDb } from "./helpers.js";

const TZ = "Asia/Kolkata";
const at = (hhmm: string, date = "2026-11-16") => DateTime.fromISO(`${date}T${hhmm}`, { zone: TZ }).toMillis();
const local = (ms: number) => DateTime.fromMillis(ms, { zone: TZ }).toFormat("yyyy-MM-dd HH:mm");

let db: TestDb;
const clock = { now: at("09:00") };
let ctx: TestContext;
let app: ReturnType<typeof createApp>;
let agent: ReturnType<typeof request.agent>;
let csrf: string;

function build(topics?: TopicService) {
  ctx = makeContext(testEnv(db.uri), clock, topics);
  app = createApp(ctx, { internal: internalRoutes(ctx), api: [todayRoutes(ctx)] });
}

const tick = () => request(app).post("/api/internal/tick").set("Authorization", `Bearer ${ctx.env.cronSecret}`);

async function calendar(): Promise<FakeCalendar> {
  const user = await User.findOne({});
  return ctx.calendarFor(user!) as FakeCalendar;
}

async function addPerson(over: Record<string, unknown> = {}) {
  return (await agent.post("/api/people").set("X-CSRF-Token", csrf).send({ ...validPerson, ...over }).expect(201)).body;
}

async function updateSettings(change: Record<string, unknown>) {
  const current = (await agent.get("/api/settings").expect(200)).body;
  await agent.put("/api/settings").set("X-CSRF-Token", csrf).send({ ...current, ...change }).expect(200);
}

beforeAll(async () => {
  db = await startDb();
});
afterAll(async () => {
  await db.stop();
});
beforeEach(async () => {
  await clearDb();
  clock.now = at("09:00");
  build();
  agent = request.agent(app);
  ({ csrf } = await signIn(agent));
  await addPerson({ name: "Mom", everyDays: 2 });
  await addPerson({ name: "Rahul", relation: "friend", everyDays: 7, phone: "+91 91234 56789" });
});

describe("the hourly tick", () => {
  it("needs the cron secret, and replies with counts only", async () => {
    await request(app).post("/api/internal/tick").expect(401);
    await request(app).post("/api/internal/tick").set("Authorization", "Bearer wrong").expect(401);
    const res = await tick().expect(200);
    expect(Object.keys(res.body).sort()).toEqual(["created", "failed", "ok", "users"]);
  });

  it("skips anyone who is no longer on the allow list", async () => {
    ctx.env.allowedEmails.length = 0;
    clock.now = at("11:00");
    expect((await tick().expect(200)).body).toMatchObject({ users: 0, created: 0 });
  });

  it("does nothing before the morning run time", async () => {
    clock.now = at("10:59");
    expect((await tick().expect(200)).body.created).toBe(0);
    expect((await calendar()).events.size).toBe(0);
  });

  it("after the run time, adds ONE call for today with links and talking points", async () => {
    clock.now = at("11:00");
    expect((await tick().expect(200)).body.created).toBe(1);
    const events = [...(await calendar()).events.values()];
    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.title).toBe("📞 Call Mom");
    expect(local(event.start)).toBe("2026-11-16 19:30");
    expect(event.description).toContain("https://wa.me/919876543210?text=");
    expect(event.description).toContain("Things to talk about");
    expect(event.callId).toBeTruthy();

    const today = (await agent.get("/api/today").expect(200)).body;
    expect(today.status).toBe("active");
    expect(today.ranToday).toBe(true);
    expect(today.calls).toHaveLength(1);
    expect(today.calls[0].links.call).toBe("tel:+919876543210");
  });

  it("is idempotent: many ticks in one day still give one call", async () => {
    for (const time of ["11:00", "11:05", "12:00", "15:00", "18:00"]) {
      clock.now = at(time);
      await tick().expect(200);
    }
    expect((await calendar()).events.size).toBe(1);
    expect(await Call.countDocuments({})).toBe(1);
  });

  it("respects a higher calls-per-day limit, and still never goes over it", async () => {
    await updateSettings({ callsPerDay: 3 });
    await addPerson({ name: "Nani", relation: "grandparent" });
    await addPerson({ name: "Aisha", relation: "friend" });
    clock.now = at("11:00");
    await tick().expect(200);
    clock.now = at("12:00");
    await agent.post("/api/today/run").set("X-CSRF-Token", csrf).expect(200);
    expect((await calendar()).events.size).toBe(3);
  });

  it("next day: yesterday's call counts as done, and someone else is picked", async () => {
    clock.now = at("11:00");
    await tick();
    clock.now = at("11:00", "2026-11-17");
    await tick();
    const calls = await Call.find({}).sort({ start: 1 });
    expect(calls.map((c) => [c.personName, c.status])).toEqual([
      ["Mom", "done"],
      ["Rahul", "scheduled"],
    ]);
  });
});

describe("respecting what I did in my calendar", () => {
  it("if I delete today's call, it is skipped and not replaced (not even by Run now)", async () => {
    clock.now = at("11:00");
    await tick();
    const cal = await calendar();
    cal.userDeletes([...cal.events.keys()][0]!);
    clock.now = at("12:00");
    await tick();
    expect((await Call.findOne({}))?.status).toBe("skipped");
    const run = await agent.post("/api/today/run").set("X-CSRF-Token", csrf).expect(200);
    expect(run.body.created).toBe(0);
    expect(cal.events.size).toBe(0);
  });

  it("skipping an upcoming call in the dashboard also removes it from the calendar", async () => {
    clock.now = at("11:00");
    await tick();
    const call = (await agent.get("/api/today").expect(200)).body.calls[0];
    await agent.patch(`/api/calls/${call.id}`).set("X-CSRF-Token", csrf).send({ status: "skipped" }).expect(200);
    expect((await calendar()).events.size).toBe(0);
    clock.now = at("12:00");
    await tick();
    expect((await calendar()).events.size).toBe(0); // and nothing new is added
  });

  it("moves the call when a new meeting lands on it", async () => {
    clock.now = at("11:00");
    await tick();
    const cal = await calendar();
    cal.extraBusy.push({ start: at("19:00"), end: at("20:00") });
    clock.now = at("14:00");
    await tick();
    const event = [...cal.events.values()][0]!;
    expect(local(event.start)).toBe("2026-11-16 20:15");
    expect(local((await Call.findOne({}))!.start.getTime())).toBe("2026-11-16 20:15");
  });

  it("removes the call when there is no other free time today", async () => {
    clock.now = at("11:00");
    await tick();
    const cal = await calendar();
    cal.extraBusy.push({ start: at("18:00"), end: at("23:00") });
    clock.now = at("14:00");
    await tick();
    expect(cal.events.size).toBe(0);
    expect(await Call.countDocuments({})).toBe(0);
  });

  it("leaves a call alone if I moved it myself", async () => {
    clock.now = at("11:00");
    await tick();
    const cal = await calendar();
    const id = [...cal.events.keys()][0]!;
    cal.userMoves(id, at("21:00"), at("21:15"));
    cal.extraBusy.push({ start: at("21:00"), end: at("21:30") });
    clock.now = at("14:00");
    await tick();
    expect(local(cal.events.get(id)!.start)).toBe("2026-11-16 21:00");
  });

  it("saves the notes I typed in the event, and shows them next time", async () => {
    await agent.delete(`/api/people/${(await Person.findOne({ name: "Rahul" }))!.id}`).set("X-CSRF-Token", csrf).expect(200);
    clock.now = at("11:00");
    await tick();
    const cal = await calendar();
    cal.userWritesNotes([...cal.events.keys()][0]!, "Dad is planning a Goa trip");
    clock.now = at("20:00"); // after the 19:30–19:45 call
    await tick();
    const history = (await agent.get("/api/calls").expect(200)).body;
    expect(history[0].status).toBe("done");
    expect(history[0].notes).toBe("Dad is planning a Goa trip");

    clock.now = at("11:00", "2026-11-17"); // Mom is the only person, so she can be picked again
    await tick();
    const latest = [...cal.events.values()].sort((a, b) => b.start - a.start)[0]!;
    expect(latest.description).toContain("Last time you talked about: Dad is planning a Goa trip");
  });

  it("Rule 4: only ever moves or deletes events it created itself", async () => {
    clock.now = at("11:00");
    await tick();
    const cal = await calendar();
    const created = new Set(cal.events.keys());
    const touched: string[] = [];
    const spy: CalendarProvider = {
      ...cal,
      moveEvent: async (c, id, e) => {
        touched.push(id);
        return cal.moveEvent(c, id, e);
      },
      deleteEvent: async (c, id) => {
        touched.push(id);
        return cal.deleteEvent(c, id);
      },
    };
    ctx.calendarFor = () => spy;
    cal.extraBusy.push({ start: at("19:00"), end: at("23:00") });
    clock.now = at("14:00");
    await tick();
    expect(touched.length).toBeGreaterThan(0);
    for (const id of touched) expect(created.has(id)).toBe(true);
  });
});

describe("pause, active period and active days", () => {
  it("does nothing while paused", async () => {
    await agent.post("/api/settings/pause").set("X-CSRF-Token", csrf).send({ paused: true, pausedUntil: null, removeTodayCall: false }).expect(200);
    clock.now = at("11:00");
    await tick();
    expect((await calendar()).events.size).toBe(0);
    expect((await agent.get("/api/today")).body.status).toBe("paused");
  });

  it("'pause until today' switches itself off and plans again", async () => {
    await agent
      .post("/api/settings/pause")
      .set("X-CSRF-Token", csrf)
      .send({ paused: true, pausedUntil: "2026-11-16", removeTodayCall: false })
      .expect(200);
    clock.now = at("11:00");
    await tick();
    expect((await calendar()).events.size).toBe(1);
    expect((await agent.get("/api/settings")).body.paused).toBe(false);
  });

  it("pausing can also remove today's upcoming call", async () => {
    clock.now = at("11:00");
    await tick();
    const res = await agent
      .post("/api/settings/pause")
      .set("X-CSRF-Token", csrf)
      .send({ paused: true, pausedUntil: null, removeTodayCall: true })
      .expect(200);
    expect(res.body.removed).toBe(1);
    expect((await calendar()).events.size).toBe(0);
  });

  it("does nothing outside the active period", async () => {
    await updateSettings({ activeFrom: "2026-10-01", activeTo: "2026-11-15" });
    clock.now = at("11:00");
    await tick();
    expect((await calendar()).events.size).toBe(0);
    expect((await agent.get("/api/today")).body.status).toBe("after-period");
  });

  it("does nothing on a day that is switched off", async () => {
    await updateSettings({ activeDays: ["sat", "sun"] });
    clock.now = at("11:00");
    await tick();
    expect((await calendar()).events.size).toBe(0);
  });
});

describe("talking points", () => {
  it("if the AI service breaks, the call is still created with built-in points", async () => {
    build({
      pick: async () => {
        throw new Error("AI is down");
      },
    });
    // A new app means a new encryption key, so start again with fresh data.
    await clearDb();
    agent = request.agent(app);
    ({ csrf } = await signIn(agent));
    await addPerson({ name: "Mom" });
    clock.now = at("11:00");
    const res = await tick().expect(200);
    expect(res.body).toMatchObject({ created: 1, failed: 0 });
    const event = [...(await calendar()).events.values()][0]!;
    expect(event.description).toContain("Things to talk about");
  });
});

describe("delete all my data", () => {
  it("needs a typed confirmation", async () => {
    await agent.delete("/api/account").set("X-CSRF-Token", csrf).send({}).expect(400);
  });

  it("removes today's call, revokes Google access and wipes everything", async () => {
    clock.now = at("11:00");
    await tick();
    const cal = await calendar();
    await agent.delete("/api/account").set("X-CSRF-Token", csrf).send({ confirm: "DELETE" }).expect(200);
    expect(ctx.oauth.revoked).toEqual(["refresh-owner"]);
    expect(cal.events.size).toBe(0);
    expect(await User.countDocuments({})).toBe(0);
    expect(await Person.countDocuments({})).toBe(0);
    expect(await Call.countDocuments({})).toBe(0);
    await agent.get("/api/auth/me").expect(401);
  });
});
