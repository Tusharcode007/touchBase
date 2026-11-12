import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // API tests start a real (in-memory) MongoDB, which can take a few seconds the first time.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
