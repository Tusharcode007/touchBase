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

// Local development reads the .env file at the repo root. Production (Render) sets real env vars.
const envFile = fileURLToPath(new URL("../../.env", import.meta.url));
if (process.env.NODE_ENV !== "production" && existsSync(envFile)) process.loadEnvFile(envFile);

async function main() {
  const env = loadEnv();
  const logger = createLogger(env.logLevel);
  const db = await connectDb(env, logger);

  const ctx: AppContext = {
    env,
    oauth: googleOAuth(env),
    cipher: createCipher(env.tokenEncryptionKey),
    logger,
    now: () => Date.now(),
  };

  const app = createApp(ctx);
  const server = app.listen(env.port, () => {
    logger.info({ port: env.port, demo: env.demoMode }, "touchbase is running");
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
