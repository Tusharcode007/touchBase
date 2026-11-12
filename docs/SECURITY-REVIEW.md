# SECURITY REVIEW: 2026-11-12

**Scope:** the whole codebase at the end of the first build (server, web, workflows, config).
**Method:** a line-by-line read of every route, middleware, the job and the calendar provider, checked against [THREAT.md](THREAT.md); production-mode smoke tests; `npm audit`.

## Findings (all fixed)
| # | Finding | Risk | Fix | Proof |
|---|---|---|---|---|
| S-1 | Removing an email from `ALLOWED_EMAILS` didn't end that person's existing session (up to 7 days), and the hourly job kept running for them. | Medium | The allow list is checked on every request (`requireAuth`, `/auth/me`) and in `tickAll`. | `api.test.ts` "removing an email … locks out", `job.test.ts` "skips anyone who is no longer on the allow list" |
| S-2 | A public `APP_URL` with `NODE_ENV` unset would quietly run in development mode: no `Secure` cookie, no HSTS, and no dashboard served. | Medium | The server refuses to start with a public `APP_URL` unless `NODE_ENV=production`. `render.yaml` sets it. | `env.test.ts` "a public address must run with NODE_ENV=production" |
| S-3 | Move/delete trusted the event id stored in the database. If the database were ever tampered with, a non-touchbase event could be changed. | Low | Before patching or deleting, the Google provider fetches the event and checks the private `touchbase` tag. | Code review (`calendar/google.ts` `isOwnEvent`). Needs a live Google check (ASSUMPTIONS A1). |

## Checked and fine
- **Auth:** every `/api` route except health, sign-in and the cron tick sits behind `requireAuth`. The demo route doesn't exist in production (smoke test: `POST /api/auth/demo` → 401).
- **OAuth:** one-time `state` (10 minute limit), PKCE S256, ID token checked (signature, audience, expiry, issuer, `email_verified`), all calendar scopes required. Smoke test: the Google redirect has `code_challenge_method=S256`, `access_type=offline` and only the 3 calendar scopes.
- **Sessions:** regenerated on login; behind HTTPS the cookie is `HttpOnly; Secure; SameSite=Lax` with a 12 h idle limit (smoke test with `X-Forwarded-Proto: https`); over plain HTTP no cookie is sent at all. 7-day absolute limit. Session data is encrypted in MongoDB.
- **CSRF:** token + Origin/Referer check on every non-GET. `X-CSRF-Token` is a custom header, and there's no CORS, so other sites can't send it.
- **Injection:** zod on all bodies and queries; `sanitizeFilter`; ObjectId regex; `mongoose.trusted` only around values made by our code; Express 5's simple query parser (no nested objects).
- **XSS:** React escaping; no `dangerouslySetInnerHTML`; event descriptions HTML-escaped; links built server-side from E.164 numbers (no `javascript:` possible); CSP `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'` (smoke test confirmed the headers on `/`).
- **Open redirect:** redirects only go to `APP_URL` or Google's URL from the library.
- **Logging:** paths only (no query strings, so OAuth codes are never logged), no headers or bodies, error messages scrubbed of emails and phone numbers. The demo-mode log was checked: no names or numbers.
- **Limits:** 20 KB bodies, 50 people, 1,000-character notes, 200 history rows per page, 3 calls a day; rate limits on login, API and tick.
- **Secrets:** none in the repo; placeholders in `.env.example` are rejected at startup; `.gitignore` covers `.env`, key files and token files.
- **Workflows:** `permissions: {}` / `contents: read`, Actions pinned to commit SHAs, `persist-credentials: false`, secrets passed through `env` (not pasted into scripts), the tick response is never printed.
- **Dependencies:** `npm audit --omit=dev` → 0 vulnerabilities. Dev-only: 10 moderate advisories in eslint's `minimatch`, which only reads our own config patterns.

## Not covered (accepted)
- No live test against Google's real API yet (ASSUMPTIONS A1, A2, A6).
- Rate limits are in memory (D-013).
- No automated scanner (CodeQL) yet. GitHub can turn it on for free: repository → Security → Code scanning.
