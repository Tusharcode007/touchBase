// API security tests. These run the real Express app against an in-memory MongoDB.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { Call, Person, User } from "../src/db/models.js";
import { defaultSettings } from "../../shared/schemas.js";
import { APP_URL, clearDb, makeContext, OWNER, signIn, startDb, testEnv, validPerson, type TestDb } from "./helpers.js";

let db: TestDb;
const clock = { now: Date.parse("2026-11-16T05:30:00Z") };
let app: ReturnType<typeof createApp>;
let ctx: ReturnType<typeof makeContext>;

beforeAll(async () => {
  db = await startDb();
});
afterAll(async () => {
  await db.stop();
});
beforeEach(async () => {
  clock.now = Date.parse("2026-11-16T05:30:00Z");
  await clearDb();
  // A fresh app per test also resets the rate-limit counters.
  ctx = makeContext(testEnv(db.uri), clock);
  app = createApp(ctx);
});

describe("security headers", () => {
  it("sends a strict Content-Security-Policy and hides the server type", async () => {
    const res = await request(app).get("/api/health").expect(200);
    const csp = res.headers["content-security-policy"] as string;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});

describe("sign in", () => {
  it("401 for every data route without a login", async () => {
    for (const path of ["/api/people", "/api/settings", "/api/calls", "/api/overview", "/api/auth/me"]) {
      await request(app).get(path).expect(401);
    }
  });

  it("signs in the owner, with a safe session cookie", async () => {
    const agent = request.agent(app);
    const start = await agent.get("/api/auth/google").expect(302);
    const cookie = String(start.headers["set-cookie"]);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    const { csrf, redirect } = await signIn(agent);
    expect(redirect).toBe(`${APP_URL}/`);
    expect(csrf).toHaveLength(43);
    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.email).toBe(OWNER);
    // The refresh token is stored encrypted, never in plain text.
    const user = await User.findOne({ email: OWNER });
    expect(user?.refreshTokenEnc).toMatch(/^v1\./);
    expect(user?.refreshTokenEnc).not.toContain("refresh-owner");
  });

  it("403-style refusal for an email that is not on the allow list, and stores nothing", async () => {
    const agent = request.agent(app);
    const { redirect } = await signIn(agent, "stranger");
    expect(redirect).toBe(`${APP_URL}/?error=not-allowed`);
    await agent.get("/api/auth/me").expect(401);
    expect(await User.countDocuments({})).toBe(0);
  });

  it("refuses an email Google has not verified", async () => {
    const agent = request.agent(app);
    const { redirect } = await signIn(agent, "unverified");
    expect(redirect).toBe(`${APP_URL}/?error=not-allowed`);
    expect(await User.countDocuments({})).toBe(0);
  });

  it("refuses a callback with the wrong state (forged login)", async () => {
    const agent = request.agent(app);
    await agent.get("/api/auth/google").expect(302);
    const res = await agent.get("/api/auth/google/callback?code=owner&state=not-the-real-state").expect(302);
    expect(res.headers.location).toBe(`${APP_URL}/?error=login-failed`);
    await agent.get("/api/auth/me").expect(401);
  });

  it("a state value cannot be used twice", async () => {
    const agent = request.agent(app);
    const start = await agent.get("/api/auth/google").expect(302);
    const state = new URL(start.headers.location as string).searchParams.get("state");
    await agent.get(`/api/auth/google/callback?code=owner&state=${state}`).expect(302);
    const again = await agent.get(`/api/auth/google/callback?code=owner&state=${state}`).expect(302);
    expect(again.headers.location).toBe(`${APP_URL}/?error=login-failed`);
  });

  it("removing an email from ALLOWED_EMAILS locks out that person's live session at once", async () => {
    const agent = request.agent(app);
    await signIn(agent, "second");
    await agent.get("/api/people").expect(200);
    const list = ctx.env.allowedEmails;
    list.splice(list.indexOf("second@example.com"), 1);
    await agent.get("/api/people").expect(401);
    await agent.get("/api/auth/me").expect(401);
  });

  it("logs out after 7 days even if used every day (absolute limit)", async () => {
    const agent = request.agent(app);
    await signIn(agent);
    await agent.get("/api/people").expect(200);
    clock.now += 8 * 24 * 60 * 60 * 1000;
    await agent.get("/api/people").expect(401);
  });

  it("logout needs the CSRF token, then ends the session", async () => {
    const agent = request.agent(app);
    const { csrf } = await signIn(agent);
    await agent.post("/api/auth/logout").expect(403);
    await agent.post("/api/auth/logout").set("X-CSRF-Token", csrf).expect(200);
    await agent.get("/api/people").expect(401);
  });
});

describe("rate limiting", () => {
  it("slows down repeated login attempts", async () => {
    let lastStatus = 0;
    for (let i = 0; i < 31; i++) lastStatus = (await request(app).get("/api/auth/google")).status;
    expect(lastStatus).toBe(429);
  });
});

describe("CSRF protection", () => {
  it("rejects a change without the token", async () => {
    const agent = request.agent(app);
    await signIn(agent);
    await agent.post("/api/people").send(validPerson).expect(403);
  });

  it("rejects a wrong token", async () => {
    const agent = request.agent(app);
    await signIn(agent);
    await agent.post("/api/people").set("X-CSRF-Token", "wrong").send(validPerson).expect(403);
  });

  it("rejects a request from another website, even with the token", async () => {
    const agent = request.agent(app);
    const { csrf } = await signIn(agent);
    await agent.post("/api/people").set("X-CSRF-Token", csrf).set("Origin", "https://evil.example").send(validPerson).expect(403);
  });

  it("accepts a request from our own app with the token", async () => {
    const agent = request.agent(app);
    const { csrf } = await signIn(agent);
    await agent.post("/api/people").set("X-CSRF-Token", csrf).set("Origin", APP_URL).send(validPerson).expect(201);
  });
});

describe("people", () => {
  it("stores the phone as +91… and keeps phone and notes encrypted in the database", async () => {
    const agent = request.agent(app);
    const { csrf } = await signIn(agent);
    const res = await agent.post("/api/people").set("X-CSRF-Token", csrf).send(validPerson).expect(201);
    expect(res.body.phone).toBe("+919876543210");
    expect(res.body.notes).toBe("Ask about her knee");
    const raw = await mongoose.connection.db!.collection("people").findOne({});
    expect(JSON.stringify(raw)).not.toContain("9876543210");
    expect(JSON.stringify(raw)).not.toContain("knee");
  });

  it("rejects bad input with friendly field errors", async () => {
    const agent = request.agent(app);
    const { csrf } = await signIn(agent);
    const res = await agent
      .post("/api/people")
      .set("X-CSRF-Token", csrf)
      .send({ ...validPerson, phone: "12345", everyDays: 0 })
      .expect(400);
    const paths = res.body.fields.map((f: { path: string }) => f.path);
    expect(paths).toContain("phone");
    expect(paths).toContain("everyDays");
  });

  it("rejects query-operator tricks (NoSQL injection)", async () => {
    const agent = request.agent(app);
    const { csrf } = await signIn(agent);
    await agent.post("/api/people").set("X-CSRF-Token", csrf).send({ ...validPerson, name: { $gt: "" } }).expect(400);
    await agent.put("/api/people/%7B%22%24ne%22%3Anull%7D").set("X-CSRF-Token", csrf).send(validPerson).expect(404);
  });

  it("rejects requests that are too large", async () => {
    const agent = request.agent(app);
    const { csrf } = await signIn(agent);
    await agent
      .post("/api/people")
      .set("X-CSRF-Token", csrf)
      .send({ ...validPerson, notes: "x".repeat(50_000) })
      .expect(413);
  });

  it("one user can never see or change another user's people", async () => {
    const owner = request.agent(app);
    const ownerLogin = await signIn(owner, "owner");
    const created = await owner.post("/api/people").set("X-CSRF-Token", ownerLogin.csrf).send(validPerson).expect(201);

    const other = request.agent(app);
    const otherLogin = await signIn(other, "second");
    expect((await other.get("/api/people").expect(200)).body).toEqual([]);
    await other.put(`/api/people/${created.body.id}`).set("X-CSRF-Token", otherLogin.csrf).send(validPerson).expect(404);
    await other.delete(`/api/people/${created.body.id}`).set("X-CSRF-Token", otherLogin.csrf).expect(404);
    await other.post(`/api/people/${created.body.id}/prioritize`).set("X-CSRF-Token", otherLogin.csrf).expect(404);
    expect(await Person.countDocuments({})).toBe(1);
  });

  it("the overview puts the most overdue person first", async () => {
    const agent = request.agent(app);
    const { csrf } = await signIn(agent);
    const mom = await agent.post("/api/people").set("X-CSRF-Token", csrf).send(validPerson).expect(201);
    const friend = await agent
      .post("/api/people")
      .set("X-CSRF-Token", csrf)
      .send({ ...validPerson, name: "Rahul", relation: "friend", everyDays: 7 })
      .expect(201);
    const user = await User.findOne({ email: OWNER });
    const day = 24 * 60 * 60 * 1000;
    const base = { userId: user!._id, calendarId: "primary", status: "done" as const, date: "2026-11-01" };
    await Call.create({ ...base, personId: mom.body.id, personName: "Mom", start: new Date(clock.now - 6 * day), end: new Date(clock.now - 6 * day), placedStart: new Date() });
    await Call.create({ ...base, personId: friend.body.id, personName: "Rahul", start: new Date(clock.now - day), end: new Date(clock.now - day), placedStart: new Date() });
    const rows = (await agent.get("/api/overview").expect(200)).body;
    expect(rows.map((r: { name: string }) => r.name)).toEqual(["Mom", "Rahul"]);
    expect(rows[0].badge).toBe("overdue");
    expect(rows[0].daysSince).toBe(6);
    expect(rows[1].badge).toBe("on-track");
  });
});

describe("settings", () => {
  it("returns defaults and saves valid changes", async () => {
    const agent = request.agent(app);
    const { csrf } = await signIn(agent);
    const current = (await agent.get("/api/settings").expect(200)).body;
    expect(current.runTime).toBe("11:00");
    expect(current.activeDays).toHaveLength(7);
    const saved = await agent.put("/api/settings").set("X-CSRF-Token", csrf).send({ ...current, callsPerDay: 2 }).expect(200);
    expect(saved.body.callsPerDay).toBe(2);
  });

  it("rejects an afternoon run time, a backwards period and too many calls", async () => {
    const agent = request.agent(app);
    const { csrf } = await signIn(agent);
    const s = defaultSettings("2026-11-16");
    for (const bad of [
      { ...s, runTime: "14:00" },
      { ...s, activeFrom: "2026-12-01", activeTo: "2026-11-01" },
      { ...s, callsPerDay: 4 },
      { ...s, windows: { ...s.windows, mon: [{ start: "23:00", end: "01:00" }] } },
    ]) {
      await agent.put("/api/settings").set("X-CSRF-Token", csrf).send(bad).expect(400);
    }
  });
});

describe("call history", () => {
  it("marks a call done or skipped and saves notes, only for its owner", async () => {
    const owner = request.agent(app);
    const { csrf } = await signIn(owner, "owner");
    const user = await User.findOne({ email: OWNER });
    const call = await Call.create({
      userId: user!._id,
      personId: new mongoose.Types.ObjectId(),
      personName: "Mom",
      date: "2026-11-15",
      start: new Date("2026-11-15T14:00:00Z"),
      end: new Date("2026-11-15T14:15:00Z"),
      placedStart: new Date("2026-11-15T14:00:00Z"),
      calendarId: "primary",
    });
    const res = await owner
      .patch(`/api/calls/${call.id}`)
      .set("X-CSRF-Token", csrf)
      .send({ status: "skipped", notes: "She was busy" })
      .expect(200);
    expect(res.body.status).toBe("skipped");
    expect(res.body.notes).toBe("She was busy");

    const other = request.agent(app);
    const otherLogin = await signIn(other, "second");
    await other.patch(`/api/calls/${call.id}`).set("X-CSRF-Token", otherLogin.csrf).send({ status: "done" }).expect(404);
    expect((await other.get("/api/calls").expect(200)).body).toEqual([]);
  });
});
