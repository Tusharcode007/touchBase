// Everything a route needs, passed in from one place. Tests build their own
// context with fakes (fake Google, fake calendar, fixed clock), so no real
// accounts are needed.
import type { Logger } from "pino";
import type { Env } from "./config/env.js";
import type { OAuthService } from "./auth/oauth.js";
import type { Cipher } from "./lib/crypto.js";
import type { CalendarProvider } from "./calendar/provider.js";
import type { TopicService } from "./ai/talkingPoints.js";
import type { UserDoc } from "./db/models.js";

export interface AppContext {
  env: Env;
  oauth: OAuthService;
  cipher: Cipher;
  logger: Logger;
  now: () => number;
  /** The calendar for this user (real Google, or the fake one in demo mode/tests). */
  calendarFor: (user: UserDoc) => CalendarProvider;
  topics: TopicService;
}
