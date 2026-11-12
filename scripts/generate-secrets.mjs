// Prints fresh random secrets to paste into your .env file (or into Render).
// Run: npm run secrets
// Nothing is saved anywhere. Every run gives new values.
import { randomBytes } from "node:crypto";

console.log("# Paste these into .env (local) or Render → Environment (production).");
console.log("# Use DIFFERENT values for local and production.");
console.log(`SESSION_SECRET=${randomBytes(48).toString("base64url")}`);
console.log(`TOKEN_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`);
console.log(`CRON_SECRET=${randomBytes(48).toString("base64url")}`);
