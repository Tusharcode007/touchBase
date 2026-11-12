// Connect to MongoDB. In demo mode with no MONGODB_URI, start a throwaway
// in-memory MongoDB so the app can be tried with zero setup.
import mongoose from "mongoose";
import type { Logger } from "pino";
import type { Env } from "../config/env.js";

export interface DbHandle {
  close(): Promise<void>;
}

export async function connectDb(env: Env, logger: Logger): Promise<DbHandle> {
  let uri = env.mongodbUri;
  let stopMemoryServer: (() => Promise<unknown>) | null = null;

  if (!uri && env.demoMode) {
    // Dev-only package, loaded only in demo mode (the server refuses demo mode in production).
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const server = await MongoMemoryServer.create();
    uri = server.getUri();
    stopMemoryServer = () => server.stop();
    logger.warn("demo mode: using a temporary in-memory database (data is lost on restart)");
  }
  if (!uri) throw new Error("MONGODB_URI is required");

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  logger.info("database connected");

  return {
    async close() {
      await mongoose.disconnect();
      if (stopMemoryServer) await stopMemoryServer();
    },
  };
}
