// Test helpers: a real (in-memory) MongoDB, a fake Google, and a controllable clock.
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Agent } from "supertest";
import { loadEnv, type Env } from "../src/config/env.js";
import type { GoogleIdentity, OAuthService } from "../src/auth/oauth.js";
import { createCipher } from "../src/lib/crypto.js";
import { createLogger } from "../src/lib/logger.js";
import type { AppContext } from "../src/context.js";
import { createFakeCalendar, type FakeCalendar } from "../src/calendar/fake.js";
import { offlineService, type TopicService } from "../src/ai/talkingPoints.js";

export const OWNER = "owner@example.com";
export const SECOND = "second@example.com";
export const APP_URL = "http://localhost:5173";

/** Login "codes" the fake Google understands. */
const IDENTITIES: Record<string, GoogleIdentity> = {
  owner: { sub: "1", email: OWNER, emailVerified: true, name: "Owner", refreshToken: "refresh-owner" },
  second: { sub: "2", email: SECOND, emailVerified: true, name: "Second", refreshToken: "refresh-second" },
  stranger: { sub: "3", email: "stranger@example.com", emailVerified: true, name: "Stranger", refreshToken: "refresh-x" },
  unverified: { sub: "4", email: OWNER, emailVerified: false, name: "Owner?", refreshToken: "refresh-y" },
};

export function fakeOAuth(): OAuthService & { revoked: string[] } {
  const revoked: string[] = [];
  return {
    revoked,
    authUrl: (state, challenge) => `https://accounts.example.test/auth?state=${state}&code_challenge=${challenge}`,
    exchange: async (code) => {
      const identity = IDENTITIES[code];
      if (!identity) throw new Error("bad code");
      return identity;
    },
    revoke: async (token) => {
      revoked.push(token);
    },
    clientFor: () => {
      throw new Error("Google client not available in tests");
    },
  };
}

export function testEnv(mongoUri: string, over: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: "test",
    APP_URL,
    MONGODB_URI: mongoUri,
    SESSION_SECRET: randomBytes(48).toString("base64url"),
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    CRON_SECRET: randomBytes(48).toString("base64url"),
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-client-secret-value",
    ALLOWED_EMAILS: `${OWNER}, ${SECOND}`,
    LOG_LEVEL: "silent",
    ...over,
  });
}

export interface TestDb {
  uri: string;
  stop(): Promise<void>;
}

export async function startDb(): Promise<TestDb> {
  const server = await MongoMemoryServer.create();
  const uri = server.getUri();
  await mongoose.connect(uri);
  return {
    uri,
    async stop() {
      await mongoose.disconnect();
      await server.stop();
    },
  };
}

export async function clearDb() {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

export type TestContext = AppContext & {
  oauth: ReturnType<typeof fakeOAuth>;
  /** The fake calendar each user gets (created on first use). */
  calendars: Map<string, FakeCalendar>;
};

export function makeContext(env: Env, clock: { now: number }, topics: TopicService = offlineService()): TestContext {
  const calendars = new Map<string, FakeCalendar>();
  return {
    env,
    oauth: fakeOAuth(),
    cipher: createCipher(env.tokenEncryptionKey),
    logger: createLogger("silent"),
    now: () => clock.now,
    calendars,
    calendarFor: (user) => {
      let cal = calendars.get(user.id);
      if (!cal) {
        cal = createFakeCalendar({ timetable: false });
        calendars.set(user.id, cal);
      }
      return cal;
    },
    topics,
  };
}

/** Go through the whole Google sign-in flow with the fake Google. Returns the CSRF token. */
export async function signIn(agent: Agent, code = "owner"): Promise<{ csrf: string; redirect: string }> {
  const start = await agent.get("/api/auth/google").expect(302);
  const state = new URL(start.headers.location as string).searchParams.get("state");
  const callback = await agent.get(`/api/auth/google/callback?code=${code}&state=${state}`).expect(302);
  const me = await agent.get("/api/auth/me");
  return { csrf: me.body.csrfToken as string, redirect: callback.headers.location as string };
}

export const validPerson = {
  name: "Mom",
  relation: "parent",
  phone: "+91 98765 43210",
  everyDays: 2,
  timezone: "Asia/Kolkata",
  available: [],
  nudge: "whatsapp",
  notes: "Ask about her knee",
  paused: false,
  allowAi: true,
};
