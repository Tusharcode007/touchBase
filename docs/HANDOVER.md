# HANDOVER

Newest entry on top. Read this first, update it last.

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
