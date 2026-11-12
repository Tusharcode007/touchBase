# HANDOVER

Newest entry on top. Read this first, update it last.

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
