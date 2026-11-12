# FEATURE-003: Calendar sync, daily job, AI talking points, demo mode

**Goal:** Turn the planner's decisions into real calendar events, safely and repeatably.

**Scope:** `calendar/` (Google + fake), `jobs/daily.ts`, `/api/internal/tick` + `tick.yml`, `/api/today`, "Run now", pause with "remove today's call", "delete all my data", `ai/talkingPoints.ts`, `demo/`.

**Design:** see FLOW.md §2–3 and decisions D-014 to D-018.

**Status:** Done (Google provider is type-checked and its busy filter is unit-tested; it still needs a live check with a real Google account, see ASSUMPTIONS.md).

## Log
- 2026-11-12: Wrote the job and 20 end-to-end tests with a fake calendar (idempotency, settle, delete = skipped, conflict move/remove, manual move respected, notes round trip, pause/auto-resume, period, weekdays, AI failure, account deletion). 104 server tests pass.
- 2026-11-12: One test failed at first because the test rebuilt the app with a new encryption key while old data was still in the database. Not a product bug, but it showed that one user's failure is counted (`failed: 1`) without stopping the tick. Fixed the test setup.
- 2026-11-12: Ran demo mode end to end with curl: demo login planned one call with correct links; the overview ranked people by overdue score; the server log contained no names or numbers.
