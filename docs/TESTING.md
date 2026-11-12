# TESTING

What to run before any change counts as done, and what a pass looks like.
Paste the real output into your notes or the PR. "Tests pass" without output doesn't count.

## 1. Automatic checks (run all of them)
```bash
npm run check     # lint + typecheck + all tests
npm run build     # production build of web + server
npm audit --audit-level=high
```
A pass looks like:
```
 Test Files  7 passed (7)
      Tests  108 passed (108)        ← server
 Test Files  1 passed (1)
      Tests  13 passed (13)          ← web
✓ built in …ms                       ← web build
⚡ Done in …ms                        ← server build
(no high or critical advisories; `npm audit --omit=dev` → found 0 vulnerabilities)
```
The first server test run downloads a MongoDB binary (about 100 MB, once). With MongoDB installed locally, you can skip the download:
`MONGOMS_SYSTEM_BINARY=$(which mongod) npm test`

CI runs the same commands on Node 22 and 24 for every push (`.github/workflows/ci.yml`).

## 2. What the tests cover
| File | Covers |
|---|---|
| `server/test/planner.test.ts` | Hard rules 1–4 and 7: today only, daily limit, idempotent, own events only, buffers, lead time, the other person's timezone, who gets picked, conflict move/remove |
| `server/test/guards.test.ts` | Rules 5–6: pause, pause-until, active period, active days, my timezone, morning run time |
| `server/test/eventText.test.ts` | Event text, one-tap links, HTML escaping, reading notes back, offline topics |
| `server/test/calendar.test.ts` | Which Google events count as busy; AI fallback with no key |
| `server/test/api.test.ts` | Security: 401/403, allow list (also on live sessions), state + PKCE flow, CSRF, rate limit, NoSQL injection, body size, encryption at rest, data scoping, headers |
| `server/test/env.test.ts` | Startup checks (weak secrets, demo in production, public URL needs production) and encryption |
| `server/test/job.test.ts` | The daily job end to end: tick secret, run time, idempotency, settle, delete = skipped, move on conflict, manual move respected, notes round trip, pause / auto-resume, period, weekdays, AI failure, account deletion |
| `web/src/App.test.tsx` | Sign-in screen, Today screen, pause flow + CSRF header, person form validation, settings (extend, weekdays, run time) |

## 3. One manual path (do this before every release)
1. `DEMO_MODE=true npm run dev` → open http://localhost:5173 → **Try the demo**.
2. **Today** shows one call with Call / WhatsApp / Done / Skipped. Press **Run now** → "Today's calls are already planned".
3. **Haven't called** → press **Prioritise next** on someone → the badge says "Next up".
4. **People** → add someone with phone `12345` → error under Phone. Fix it to `+91 98450 12345` → saved.
5. **Today** → turn the switch off → tick "remove today's call" → **Pause** → yellow "Paused" banner, no call.
6. Turn it back on → **Run now** → a call appears again.
7. **Settings** → **Extend +1 week** → **Save** → the end date moved by 7 days.
8. Do it once on a phone-sized window: nothing should scroll sideways.

## 4. With a real Google account (after deploy)
See ASSUMPTIONS.md A1, A2, A6, A7. Press **Run now**, then check the event in Google Calendar, move it, delete it, and tap its links on your phone.
