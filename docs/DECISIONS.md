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
