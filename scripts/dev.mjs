// Starts the API server and the React app together for local development.
// We use a tiny script instead of adding a package like "concurrently".
import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";

// The React dev server (5173) forwards /api to port 3000, so the API must use 3000
// here even if PORT is set in the environment (some tools set PORT for the web port).
const children = [
  spawn(npm, ["run", "dev", "-w", "server"], { stdio: "inherit", env: { ...process.env, PORT: "3000" } }),
  spawn(npm, ["run", "dev", "-w", "web"], { stdio: "inherit" }),
];

// If one side stops, stop the other too, so nothing is left running.
function stopAll(code) {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(code ?? 0);
}

for (const child of children) {
  child.on("exit", (code) => stopAll(code));
}
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
