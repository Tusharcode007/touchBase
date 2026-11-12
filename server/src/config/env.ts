// Reads and checks every setting from environment variables at startup.
// If something required is missing or a secret looks weak, the server refuses
// to start. Failing loudly at boot is much safer than failing quietly later.
import { randomBytes } from "node:crypto";
import { z } from "zod";

const WEAK_WORDS = ["change", "example", "placeholder", "secret", "password", "xxxx"];

/** A secret must be long, random-looking and not a placeholder from .env.example. */
export function isStrongSecret(value: string): boolean {
  if (value.length < 32) return false;
  const lower = value.toLowerCase();
  if (WEAK_WORDS.some((w) => lower.includes(w))) return false;
  if (new Set(value).size < 10) return false; // e.g. "aaaaaaaa…"
  return true;
}

const secret = (name: string) =>
  z.string().refine(isStrongSecret, `${name} must be at least 32 random characters (run: npm run secrets)`);

const booleanString = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const rawSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_URL: z.url().default("http://localhost:5173"),
  MONGODB_URI: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  ALLOWED_EMAILS: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  DEMO_MODE: booleanString,
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export interface Env {
  nodeEnv: "development" | "test" | "production";
  isProduction: boolean;
  port: number;
  appUrl: string;
  appOrigin: string;
  mongodbUri: string | null;
  sessionSecret: string;
  tokenEncryptionKey: string;
  cronSecret: string;
  googleClientId: string;
  googleClientSecret: string;
  allowedEmails: string[];
  anthropicApiKey: string | null;
  demoMode: boolean;
  trustProxy: number;
  logLevel: string;
}

export class EnvError extends Error {}

function isEncryptionKey(value: string): boolean {
  return Buffer.from(value, "base64").length === 32;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const raw = rawSchema.safeParse(source);
  if (!raw.success) {
    throw new EnvError(`Invalid environment: ${raw.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  const r = raw.data;
  const problems: string[] = [];
  const isProduction = r.NODE_ENV === "production";
  const demoMode = r.DEMO_MODE;

  if (isProduction && demoMode) problems.push("DEMO_MODE must never be on in production");

  // Demo mode is for trying the app locally, so it can make up throwaway secrets.
  const orRandom = (value: string | undefined, bytes: number, encoding: BufferEncoding) =>
    value && value.length > 0 ? value : demoMode ? randomBytes(bytes).toString(encoding) : "";

  const sessionSecret = orRandom(r.SESSION_SECRET, 48, "base64url");
  const tokenEncryptionKey = orRandom(r.TOKEN_ENCRYPTION_KEY, 32, "base64");
  const cronSecret = orRandom(r.CRON_SECRET, 48, "base64url");

  for (const [name, value] of [
    ["SESSION_SECRET", sessionSecret],
    ["CRON_SECRET", cronSecret],
  ] as const) {
    const check = secret(name).safeParse(value);
    if (!check.success) problems.push(check.error.issues[0]?.message ?? `${name} is weak`);
  }
  if (!isEncryptionKey(tokenEncryptionKey)) {
    problems.push("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded (run: npm run secrets)");
  }

  const allowedEmails = (r.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!demoMode) {
    if (!r.MONGODB_URI) problems.push("MONGODB_URI is required");
    if (!r.GOOGLE_CLIENT_ID || !r.GOOGLE_CLIENT_SECRET) problems.push("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required");
    if (allowedEmails.length === 0) problems.push("ALLOWED_EMAILS must list at least one email");
  }
  if (isProduction && !r.APP_URL.startsWith("https://")) problems.push("APP_URL must use https in production");

  if (problems.length > 0) throw new EnvError(`Cannot start touchbase:\n - ${problems.join("\n - ")}`);

  return {
    nodeEnv: r.NODE_ENV,
    isProduction,
    port: r.PORT,
    appUrl: r.APP_URL.replace(/\/$/, ""),
    appOrigin: new URL(r.APP_URL).origin,
    mongodbUri: r.MONGODB_URI ?? null,
    sessionSecret,
    tokenEncryptionKey,
    cronSecret,
    googleClientId: r.GOOGLE_CLIENT_ID ?? "",
    googleClientSecret: r.GOOGLE_CLIENT_SECRET ?? "",
    allowedEmails,
    anthropicApiKey: r.ANTHROPIC_API_KEY && r.ANTHROPIC_API_KEY.length > 0 ? r.ANTHROPIC_API_KEY : null,
    demoMode,
    trustProxy: r.TRUST_PROXY,
    logLevel: r.LOG_LEVEL,
  };
}
