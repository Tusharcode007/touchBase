# THREAT

Who could behave badly, what they can reach, what they could try, and what stops them.
Honest gaps are listed at the end. An admitted gap beats a hidden one.

## Entry points
| Entry point | Who can reach it |
|---|---|
| `GET /api/auth/google`, `/api/auth/google/callback` | Anyone on the internet |
| `GET /api/health` | Anyone |
| `POST /api/internal/tick` | Anyone can call it; only the holder of `CRON_SECRET` gets past the check |
| All other `/api/*` routes | Signed-in owner only |
| The React app (static files) | Anyone (it contains no data or secrets) |
| GitHub Actions logs | Anyone (public repo) |

## Actors

### 1. Anonymous visitor
- **Could try:** guess routes, read data, sign in as me, brute-force the login, flood the server.
- **Stopped by:** every data route needs a session (401 otherwise). Sign-in only works for emails on `ALLOWED_EMAILS` that Google has verified. Login routes are rate-limited (30 per 15 minutes per IP), all of `/api` is limited too. Request bodies are capped at 20 KB.
- **Tests:** `api.test.ts` → "401 for every data route", "not on the allow list", "rate limiting".

### 2. Someone with a Google account that is not mine
- **Could try:** sign in with their own Google account.
- **Stopped by:** the allow list check runs after Google confirms the email. They are sent back with `?error=not-allowed`, their session is destroyed, and nothing about them is saved.

### 3. A malicious website I visit while signed in (CSRF)
- **Could try:** make my browser send `DELETE /api/people/…` or change my settings.
- **Stopped by:** `SameSite=Lax` cookie, a strict Origin/Referer check, and a secret CSRF token that the other site cannot read. Tests: "CSRF protection".

### 4. A forged or replayed login (login CSRF / code interception)
- **Could try:** send me a callback link with their code, or reuse an old `state`.
- **Stopped by:** a random one-time `state` stored in my session (deleted on first use, expires in 10 minutes), plus PKCE (S256), so a stolen code is useless without the verifier. Tests: "wrong state", "state cannot be used twice".

### 5. Session theft
- **Could try:** steal the session cookie with injected script (XSS), or keep using an old session.
- **Stopped by:** the cookie is `HttpOnly` (scripts can't read it) and `Secure` in production. Strict CSP (`script-src 'self'`, no inline scripts). React escapes text by default and we never use raw HTML. Sessions end after 12 hours idle and always after 7 days. The session ID is regenerated at login (stops session fixation).

### 6. Injection through input
- **Could try:** NoSQL operators like `{"$gt": ""}`, HTML in names or notes, huge payloads.
- **Stopped by:** zod validation on every body and query. `mongoose.sanitizeFilter` strips `$` operators. ObjectIds are checked with a regex. Event text is HTML-escaped. Bodies over 20 KB get 413. Tests: "NoSQL injection", "escapes HTML".

### 7. Someone who gets a copy of the database
- **Could try:** read my Google refresh token, phone numbers and notes.
- **Stopped by:** these fields are encrypted with AES-256-GCM. The key is only in the server's environment, never in the database. Session data in the database is encrypted too.
- **Still visible:** names, relations, call times, settings, my email.

### 8. Someone who learns `CRON_SECRET`
- **Could try:** call `/api/internal/tick` as often as they like.
- **Stopped by:** the tick obeys every rule (today only, daily limit, idempotent), so the worst case is the morning plan running a bit early. It is rate-limited (60 per hour). The secret is compared in constant time.

### 9. GitHub Actions logs (public)
- **Could leak:** the app URL, personal data from responses.
- **Stopped by:** the URL and the secret are stored as GitHub secrets (masked in logs). curl writes the response body to `/dev/null`. The tick response contains only counts.

### 10. The AI service (third party)
- **Could see:** first name, relation, my notes about the person, notes from the last call.
- **Never sees:** phone numbers, email, other people's data.
- **Controls:** AI is optional (no key = off), can be turned off globally and per person. If it fails or refuses, built-in talking points are used and the daily job continues.

### 11. Google (third party)
- **Has:** calendar access through the scopes I grant. touchbase asks for the narrowest scopes: create/edit only on calendars I own, read events, read my calendar list.
- **touchbase reads** event times, free/busy and declined status, and **never stores** event titles or details of other events.

### 12. A compromised dependency
- **Could:** run code inside the server.
- **Reduced by:** few, well-known packages; exact versions plus a committed lockfile; `npm audit` in CI; Dependabot; Actions pinned to commit SHAs with read-only permissions. See [DEPENDENCIES.md](DEPENDENCIES.md).

## Known gaps (accepted for now)
- Rate limits are in memory, so they reset when the server restarts. That's fine for one small server, but they won't work across many servers.
- Names and call times are not encrypted (they are needed for sorting and queries).
- If `TOKEN_ENCRYPTION_KEY` and the database leak together, the encrypted data can be read. Keep them in separate places.
- Free Render and Atlas tiers have no IP allow list between them. Atlas is protected by its password, which lives in `MONGODB_URI`.
- A dev-only package (eslint's `minimatch`) has a moderate advisory. It only processes our own config patterns and is not in the production build.
