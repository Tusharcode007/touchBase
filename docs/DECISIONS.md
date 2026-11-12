# DECISIONS

One entry per meaningful choice: context, options, what we chose, why, and the trade-off.
Newest at the bottom. Rejected options are explained in more detail in [ALTERNATIVES.md](ALTERNATIVES.md).

## D-001: Plan only today, never ahead
Date: 2026-11-12
Context: I don't want my calendar full of "call this, call that" events for weeks.
Options: 1) plan a week ahead 2) plan a few days ahead 3) plan only today, every morning
Chosen: 3
Why: My calendar stays clean. Each morning's plan uses the latest calendar, so it is always up to date.
Trade-off: I only see today's call, not a weekly view. If the job fails one morning, that day has no call.
Revisit if: I start wanting to plan calls with people further in advance.

## D-002: The planner is a pure function
Date: 2026-11-12
Context: The hard rules (today only, limit, idempotent, own events) must be tested well.
Options: 1) mix Google calls and logic together 2) a pure function that returns actions, plus a thin layer that applies them
Chosen: 2
Why: A pure function can be tested with fake times and calendars in milliseconds, with no internet or Google account.
Trade-off: A bit more code to turn calendar data into planner input and actions back into API calls.
Revisit if: never. This is the core design.

## D-003: Times are epoch milliseconds, timezone maths via Luxon
Date: 2026-11-12
Context: My friend abroad and I are in different timezones. Daylight-saving changes exist.
Options: 1) native `Date` only 2) date-fns-tz 3) Luxon
Chosen: 3, with plain epoch-millisecond numbers inside the planner.
Why: Luxon handles IANA timezones and DST well and has a clear API. Plain numbers make interval maths simple.
Trade-off: One more dependency (about 70 KB).
Revisit if: the `Temporal` API is available everywhere we run.

## D-004: "Who to call" = days since last call ÷ how often I want to call them
Date: 2026-11-12
Context: Mom (every 2 days) and a friend (every 2 weeks) need fair turns.
Options: 1) simple round robin 2) random 3) overdue score
Chosen: 3. "Prioritise next" goes first, then the highest score, then people I want to call more often.
Why: It respects how often I want to talk to each person. Round robin would treat Mom and a cousin the same.
Trade-off: People with a long gap can wait a while if others are always more overdue (that is intended).
Revisit if: some people never get picked in practice.

## D-005: A skipped (deleted) call still counts toward today's limit
Date: 2026-11-12
Context: If I delete today's event, should touchbase add another one?
Options: 1) yes, refill 2) no, the day is done
Chosen: 2
Why: Deleting means "not today". Refilling would feel like spam and break the calls-per-day promise.
Trade-off: If I deleted by mistake, I have to press "Run now" (which also respects the limit) or wait for tomorrow.
Revisit if: I often want a replacement call on the same day.

## D-006: Slots start on :00, :15, :30, :45, at least 30 minutes from now
Date: 2026-11-12
Context: Odd times like 19:37 feel strange, and a call right "now" gives no time to see the reminder.
Chosen: Round up to 15-minute marks. Every real timezone offset is a multiple of 15 minutes, so this also gives round local times.
Trade-off: Can waste up to 14 minutes of a free gap.

## D-007: Call windows cannot cross midnight
Date: 2026-11-12
Context: A window like 23:00 to 01:00 would put part of the call on tomorrow.
Chosen: Windows must start and end on the same day (validated in `shared/schemas.ts`).
Why: Keeps "today only" simple and easy to prove.
Trade-off: Night owls cannot plan calls after midnight.

## D-008: No automatic SMS or WhatsApp to my contacts
Date: 2026-11-12
Context: Should touchbase message people for me?
Options: 1) Twilio SMS 2) WhatsApp Business API 3) one-tap links that I send from my own phone
Chosen: 3
Why: Twilio numbers look like spam to my parents, India needs DLT registration for app SMS, and WhatsApp Business needs business verification. A message from my own number is personal, and it is free.
Trade-off: I still have to tap once.

## D-009: MongoDB with Mongoose
Date: 2026-11-12
Context: Need to store people, settings, call history and sessions. Free hosting matters.
Options: 1) PostgreSQL (Neon/Supabase free tier) 2) MongoDB Atlas M0 3) SQLite file
Chosen: 2
Why: Fits my MERN skills, has a free tier, and the data is small and document-shaped (a user with a settings object, people, calls). SQLite would be lost on Render's free tier because its disk is wiped on every deploy.
Trade-off: Fewer database-level guarantees than Postgres (no foreign keys). We enforce ownership in code instead (every query has `userId`).
Revisit if: we need complex reports or many users.

## D-010: Server-side sessions, not JWT in the browser
Date: 2026-11-12
Context: How to keep the user signed in.
Options: 1) JWT in localStorage 2) JWT in a cookie 3) random session ID cookie + session data in MongoDB
Chosen: 3
Why: localStorage can be read by any injected script. A server-side session can be ended at any moment (logout, delete account), and the cookie holds nothing useful by itself.
Trade-off: One database read per request. Fine for one user.

## D-011: CSRF = Origin check + secret token
Date: 2026-11-12
Context: Cookie-based login needs CSRF protection.
Options: 1) SameSite cookie only 2) Origin check only 3) token in session, sent in a header, plus the Origin check
Chosen: 3 (on top of SameSite=Lax)
Why: Layers. SameSite has browser edge cases, some requests have no Origin header, and the token covers both.
Trade-off: The React app must fetch the token from `/api/auth/me` first.

## D-012: Narrowest Google scopes
Date: 2026-11-12
Context: Calendar access is sensitive.
Options: 1) `calendar` (full access) 2) `calendar.events` (edit events on ALL calendars) 3) `calendar.events.owned` + `calendar.events.readonly` + `calendar.calendarlist.readonly`
Chosen: 3
Why: touchbase can only create/change events on calendars I own, can read times to find busy slots, and can list calendars for the settings page. It can't delete calendars, change sharing, or edit events in calendars shared with me.
Trade-off: Three scopes to explain on the consent screen instead of one.
Revisit if: we switch to free/busy-only reading (`calendar.freebusy`), which would be even narrower but can't tell touchbase's own events apart from real meetings.

## D-013: Rate limits in memory
Date: 2026-11-12
Context: Need basic protection against brute force and floods.
Chosen: express-rate-limit with its built-in memory store. 30 login attempts per 15 min per IP, 900 API requests per 15 min, 60 tick calls per hour.
Why: One small server, no extra service to run.
Trade-off: Counters reset on restart and aren't shared across servers.
Revisit if: we run more than one server instance.

## D-014: An hourly GitHub Actions tick instead of a cron job inside the server
Date: 2026-11-12
Context: Free Render servers sleep when idle, so a timer inside the server would not fire.
Options: 1) node-cron inside the server 2) a paid always-on server 3) an outside scheduler that calls a protected endpoint every hour (GitHub Actions or cron-job.org)
Chosen: 3, with GitHub Actions
Why: Free, already where the code lives, and the request also wakes the server. Ticking hourly (not once at 11:00) gives the conflict check a chance to run later in the day, and the server itself decides whether it's time for the morning plan.
Trade-off: Depends on GitHub. Schedules can be late, and they stop after 60 days without commits in a public repo (see FAILURE.md).
Revisit if: the app moves to an always-on server.

## D-015: Save the call before creating the calendar event
Date: 2026-11-12
Context: If the server crashes between "create event" and "save to database", we could end up with an event we don't know about, and then create another.
Chosen: Save the call first (no eventId yet), then create the event tagged with the call's id, then save the eventId. On the next tick, a call with no eventId is matched to its event by tag, or deleted.
Why: The daily limit is counted from saved calls, so it can never be broken by a crash.

## D-016: AI talking points are optional, with a built-in fallback
Date: 2026-11-12
Context: Not everyone has an API key, and APIs fail.
Chosen: Claude (claude-opus-5-5, low effort, structured output, server-side fallback model) when a key is set and AI is allowed for that person, otherwise a built-in list. Any error falls back to the list.
Why: The daily call is the product. The talking points are a bonus that must never block it.
Trade-off: Built-in points are generic.

## D-017: Demo mode with a fake calendar and an in-memory database
Date: 2026-11-12
Context: Trying the app should not need Google Cloud, Atlas and Render set up first.
Chosen: `DEMO_MODE=true` → fake calendar with a student timetable, sample people, temporary database, one-click demo login. The server refuses to start this way in production.
Trade-off: Extra code paths, guarded by a startup check and tests.

## D-018: Read busy time with events.list, asking for only the fields we need
Date: 2026-11-12
Context: We need busy times without collecting private event details.
Options: 1) freeBusy API 2) events.list with a `fields` filter
Chosen: 2
Why: freeBusy can't tell touchbase's own calls apart from real meetings, so the conflict check couldn't work. With `fields`, Google sends only times, status, free/busy flag, my RSVP and our tag. No titles or guests are downloaded.

## D-019: No router or UI component library in the dashboard
Date: 2026-11-12
Context: Five screens, used mostly on a phone.
Options: 1) React Router + a UI kit (MUI, Chakra) 2) plain React with hash links and one CSS file
Chosen: 2
Why: Fewer dependencies to trust and update, a smaller bundle, and full control over the strict CSP (no inline styles injected by a UI kit).
Trade-off: Hand-written CSS and a small modal/switch, which took more effort.
Revisit if: the dashboard grows past ~10 screens.

## D-020: Re-check the allow list on every request
Date: 2026-11-12
Context: Security review S-1. Sessions last up to 7 days.
Chosen: `requireAuth`, `/auth/me` and the hourly job all check `ALLOWED_EMAILS`.
Why: Removing someone should take effect at once.
Trade-off: None worth noting (an in-memory array lookup).
