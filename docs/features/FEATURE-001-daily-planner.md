# FEATURE-001: Daily planner (the scheduling engine)

**Goal:** Every morning, pick one person and one free time today, and never break the hard rules.

**Scope:**
- In: guards (pause, active period, active days, run time), finding free slots, buffers, the other person's timezone, choosing who to call, the hourly conflict check, event text, offline talking points.
- Out: talking to Google or the database (that is the "apply" layer, FEATURE-003).

**Design:**
- `server/src/core/guards.ts`: should we run today?
- `server/src/core/planner.ts`: `planToday()` and `checkConflicts()` return actions (create / move / remove).
- `server/src/core/day.ts`: timezone helpers. `intervals.ts`: time range maths.
- `server/src/core/eventText.ts`: event title, description, one-tap links, reading notes back.
- `server/src/core/offlineTopics.ts`: built-in talking points.

**Status:** Done.

## Log
- 2026-11-12: Wrote the engine and 48 tests covering rules 1–6 and the conflict check. All pass (`npm test -w server`).
