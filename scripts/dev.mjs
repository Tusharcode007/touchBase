// Starts the API server and the React app together for local development.
// We use a tiny script instead of adding a package like "concurrently".
import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";

const children = [
  spawn(npm, ["run", "dev", "-w", "server"], { stdio: "inherit" }),
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
