// Starts touchbase: check settings → connect to the database → start the web server.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EnvError, loadEnv } from "./config/env.js";
import { createLogger } from "./lib/logger.js";
import { createCipher } from "./lib/crypto.js";
import { connectDb } from "./db/connect.js";
import { googleOAuth } from "./auth/oauth.js";
import { createApp } from "./app.js";
import type { AppContext } from "./context.js";
import { CalendarAuthError } from "./calendar/provider.js";
import { googleCalendarProvider } from "./calendar/google.js";
import { createTopicService } from "./ai/talkingPoints.js";
import { internalRoutes } from "./routes/internal.js";
import { todayRoutes } from "./routes/today.js";
import { demoCalendars, demoRoutes } from "./demo/demo.js";

// Local development reads the .env file at the repo root. Production (Render) sets real env vars.
const envFile = fileURLToPath(new URL("../../.env", import.meta.url));
if (process.env.NODE_ENV !== "production" && existsSync(envFile)) process.loadEnvFile(envFile);

async function main() {
  const env = loadEnv();
  const logger = createLogger(env.logLevel);
  const db = await connectDb(env, logger);
  const cipher = createCipher(env.tokenEncryptionKey);
  const oauth = googleOAuth(env);
  const fakeCalendarFor = env.demoMode ? demoCalendars() : null;

  const ctx: AppContext = {
    env,
    oauth,
    cipher,
    logger,
    now: () => Date.now(),
    calendarFor: (user) => {
      if (fakeCalendarFor) return fakeCalendarFor(user.id);
      if (!user.refreshTokenEnc) throw new CalendarAuthError("No Google access saved");
      return googleCalendarProvider(oauth.clientFor(cipher.decrypt(user.refreshTokenEnc)));
    },
    topics: createTopicService(env.anthropicApiKey, logger),
  };

  const app = createApp(ctx, {
    internal: internalRoutes(ctx),
    auth: env.demoMode ? demoRoutes(ctx) : undefined,
    api: [todayRoutes(ctx)],
  });
  const server = app.listen(env.port, () => {
    logger.info({ port: env.port, demo: env.demoMode, ai: env.anthropicApiKey !== null }, "touchbase is running");
  });

  const shutdown = () => {
    server.close(() => {
      void db.close().then(() => process.exit(0));
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err: unknown) => {
  // Startup errors are printed plainly so they are easy to read and fix.
  console.error(err instanceof EnvError ? err.message : err);
  process.exit(1);
});
