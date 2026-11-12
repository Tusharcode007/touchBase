// Startup checks and encryption.
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isStrongSecret, loadEnv } from "../src/config/env.js";
import { createCipher, safeEqual } from "../src/lib/crypto.js";

const good = {
  NODE_ENV: "production",
  APP_URL: "https://touchbase.example.com",
  MONGODB_URI: "mongodb://localhost/test",
  SESSION_SECRET: randomBytes(48).toString("base64url"),
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  CRON_SECRET: randomBytes(48).toString("base64url"),
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret-value",
  ALLOWED_EMAILS: "me@example.com",
};

describe("startup checks", () => {
  it("starts with good settings", () => {
    const env = loadEnv(good);
    expect(env.isProduction).toBe(true);
    expect(env.allowedEmails).toEqual(["me@example.com"]);
  });

  it("refuses to start in demo mode in production", () => {
    expect(() => loadEnv({ ...good, DEMO_MODE: "true" })).toThrow(/DEMO_MODE must never be on in production/);
  });

  it("refuses weak or placeholder secrets", () => {
    expect(() => loadEnv({ ...good, SESSION_SECRET: "short" })).toThrow(/SESSION_SECRET/);
    expect(() => loadEnv({ ...good, CRON_SECRET: "change-me-change-me-change-me-change-me" })).toThrow(/CRON_SECRET/);
    expect(() => loadEnv({ ...good, TOKEN_ENCRYPTION_KEY: "abc" })).toThrow(/TOKEN_ENCRYPTION_KEY/);
    expect(isStrongSecret("a".repeat(40))).toBe(false);
  });

  it("needs the database, Google keys and the allow list outside demo mode", () => {
    expect(() => loadEnv({ ...good, MONGODB_URI: "" })).toThrow(/MONGODB_URI/);
    expect(() => loadEnv({ ...good, GOOGLE_CLIENT_SECRET: "" })).toThrow(/GOOGLE_CLIENT/);
    expect(() => loadEnv({ ...good, ALLOWED_EMAILS: " , " })).toThrow(/ALLOWED_EMAILS/);
  });

  it("needs https in production", () => {
    expect(() => loadEnv({ ...good, APP_URL: "http://touchbase.example.com" })).toThrow(/https/);
  });

  it("demo mode (development) works with no secrets at all", () => {
    const env = loadEnv({ NODE_ENV: "development", DEMO_MODE: "true" });
    expect(env.demoMode).toBe(true);
    expect(env.sessionSecret.length).toBeGreaterThanOrEqual(32);
  });
});

describe("encryption at rest", () => {
  const cipher = createCipher(randomBytes(32).toString("base64"));

  it("round-trips and never repeats the same ciphertext", () => {
    const a = cipher.encrypt("+919876543210");
    const b = cipher.encrypt("+919876543210");
    expect(a).not.toBe(b);
    expect(cipher.decrypt(a)).toBe("+919876543210");
  });

  it("detects tampering", () => {
    const parts = cipher.encrypt("secret note").split(".");
    const last = parts[3]!;
    parts[3] = (last[0] === "A" ? "B" : "A") + last.slice(1);
    expect(() => cipher.decrypt(parts.join("."))).toThrow();
  });

  it("cannot be read with a different key", () => {
    const other = createCipher(randomBytes(32).toString("base64"));
    expect(() => other.decrypt(cipher.encrypt("x"))).toThrow();
  });

  it("compares secrets safely", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
