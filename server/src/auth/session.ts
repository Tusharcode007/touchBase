// Login sessions, kept on the server (in MongoDB). The browser only holds a
// random session ID in an httpOnly cookie, so page scripts can't read it.
import type { RequestHandler, Request } from "express";
import session from "express-session";
import { MongoStore } from "connect-mongo";
import mongoose from "mongoose";
import type { Env } from "../config/env.js";

declare module "express-session" {
  interface SessionData {
    userId: string;
    /** When this login started. Used for the absolute 7-day limit. */
    createdAt: number;
    csrfToken: string;
    oauth: { state: string; verifier: string; createdAt: number };
  }
}

export const SESSION_COOKIE = "tb.sid";
const IDLE_MS = 12 * 60 * 60 * 1000; // logged out after 12 hours of no use
export const ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000; // and always after 7 days

export function sessionMiddleware(env: Env): RequestHandler {
  return session({
    name: SESSION_COOKIE,
    secret: env.sessionSecret,
    store: MongoStore.create({
      client: mongoose.connection.getClient(),
      collectionName: "sessions",
      ttl: ABSOLUTE_MS / 1000,
      autoRemove: "native",
      // Session data is also encrypted inside the database.
      crypto: { secret: env.sessionSecret },
    }),
    resave: false,
    saveUninitialized: false, // no session (and no DB row) for anonymous visitors
    rolling: true, // each request pushes the idle timeout back
    proxy: env.isProduction,
    cookie: {
      httpOnly: true,
      secure: env.isProduction,
      sameSite: "lax", // "lax" so the Google redirect back to us still carries the cookie
      maxAge: IDLE_MS,
    },
  });
}

/** Promise wrappers for the callback-style session methods. */
export function regenerate(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
}
export function save(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
}
export function destroy(req: Request): Promise<void> {
  return new Promise((resolve) => req.session.destroy(() => resolve()));
}
