# HANDOVER

Newest entry on top. Read this first, update it last.

## 2026-11-12: Dashboard
Done:
- React dashboard: Login, Today, People, Haven't called, History, Settings. Light/dark theme, phone-first layout.
- 13 screen tests + 105 server tests pass. Checked by hand in a browser (desktop and phone sizes).
- Skipping an upcoming call in the dashboard also removes it from the calendar (with a test).
- BUG-001 (dev API port) and BUG-002 (phone overflow) fixed and written up.

In progress:
- Nothing.

Broken or risky:
- Still not tried with a real Google account (ASSUMPTIONS A1, A2).

Next:
- README with screenshots, TESTING.md, ROLLBACK.md, the DEFENSE brief, then the final security review.

Do not touch:
- `web/src/api.ts` CSRF header logic.

## 2026-11-12: Calendar sync and the daily job
Done:
- Calendar provider interface with a real Google version and a fake one (demo + tests).
- Daily job (`jobs/daily.ts`): lock → settle → guards → sync → morning plan or conflict check → apply.
- `/api/internal/tick` + `.github/workflows/tick.yml` (hourly), `/api/today`, "Run now", pause (with "remove today's call"), delete account.
- Optional AI talking points with a built-in fallback. Demo mode with sample people.
- 104 server tests pass. Demo mode checked end to end with curl.
- Docs: ARCHITECTURE, FLOW, DATA, FAILURE, ASSUMPTIONS, D-014 to D-018, FEATURE-003.

In progress:
- Nothing.

Broken or risky:
- The Google provider has not been tried against a real account yet (ASSUMPTIONS A1, A2).
- Dependabot's first npm run failed. Added an ignore rule for TypeScript ≥ 6.1 (probable cause, not confirmed: the log needs a login).

Next:
- The React dashboard: Today, People, Haven't called, History, Settings, and its tests.

Do not touch:
- The order "save call → create event → save eventId" in `applyActions` (D-015).

## 2026-11-12: Secure server
Done:
- Server: startup checks, AES-256-GCM encryption, server-side sessions (12 h idle / 7 day absolute), CSRF (Origin + token), helmet CSP/HSTS, rate limits, safe logging, Google sign-in with state + PKCE + allow list.
- Routes: people (CRUD + prioritise), overview, settings, call history.
- 81 server tests pass, including the API security tests (401/403, CSRF, scoping, encryption at rest, rate limit).
- CI workflow, Dependabot, SECURITY.md, THREAT.md, `npm run secrets`, `.env.example`.

In progress:
- Nothing.

Broken or risky:
- No calendar sync or daily job yet. `web/` is still a placeholder.

Next:
- Calendar provider (Google + fake), the daily tick job, the cron endpoint and workflow, AI talking points, demo mode.

Do not touch:
- `server/src/auth/*` and `lib/crypto.ts` without re-running `api.test.ts` and `env.test.ts`.

## 2026-11-12: Scheduling engine
Done:
- Monorepo set up: `server/` (Express + TypeScript), `web/` (React + Vite), `shared/` (zod rules used by both).
- Scheduling engine in `server/src/core/` with 48 passing tests for the hard rules.
- Docs: CONSTRAINTS, DECISIONS, ALTERNATIVES, DEPENDENCIES, FEATURE-001.

In progress:
- Nothing.

Broken or risky:
- `web/` is only a placeholder screen.

Next:
- Server: config checks, encryption, sessions, CSRF, Google sign-in, API routes, API tests, CI.

Do not touch:
- The hard rules in `server/src/core/planner.ts` without updating the tests.

Read first: CONSTRAINTS.md
