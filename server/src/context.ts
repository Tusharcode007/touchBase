// Everything a route needs, passed in from one place. Tests build their own
// context with fakes (fake Google, fixed clock), so no real accounts are needed.
import type { Logger } from "pino";
import type { Env } from "./config/env.js";
import type { OAuthService } from "./auth/oauth.js";
import type { Cipher } from "./lib/crypto.js";

export interface AppContext {
  env: Env;
  oauth: OAuthService;
  cipher: Cipher;
  logger: Logger;
  now: () => number;
}
