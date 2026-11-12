# CONSTRAINTS

Hard rules in plain words. If a change would break one of these, **stop and ask first**.

## Product rules (each one has tests)

1. **Today only.** touchbase only ever adds calls for the current day. Never tomorrow, never a week or a month ahead.
2. **Calls-per-day limit.** Never more calls in a day than the "calls per day" setting (1 to 3). Every call logged today counts, even a skipped one.
3. **Idempotent.** Running the daily job many times in one day gives the same result as running it once.
4. **Only its own events.** touchbase only edits or deletes calendar events that it created and tagged itself. It never touches any other event.
5. **When it runs.** Only when ALL are true: not paused, today is inside the active period, and today is a selected weekday.
6. **Morning only.** The daily plan runs once, after the morning run time I picked (05:00 to 12:00, my timezone).
7. **No slot, no event.** If there is no free time today, add nothing and say "No free slot today".
8. **No automatic messages to contacts.** touchbase never sends SMS or WhatsApp on its own. I send the heads-up myself with one tap.

## Security rules

- **Owner only.** Only emails in `ALLOWED_EMAILS` can sign in.
- **Never** send Google tokens to the browser.
- **Never** log tokens, phone numbers, notes or names.
- **Never** commit `.env`, keys or tokens. Secrets live only in environment variables.
- **Never** send phone numbers to the AI service. Only first name, relation and notes.
- **Always** validate input on the server with the shared zod schemas. The browser is never trusted.
- **Always** scope database queries to the signed-in user.
- **Always** encrypt the Google refresh token, phone numbers and notes before saving them.
- **Never** turn on demo mode in production (the server refuses to start).
- **Never** print personal data in GitHub Actions logs (the repo is public, so its logs are public).

## Protected areas: change only with extra care

These parts guard the rules above. Changing them needs a careful read of the diff and the tests:

- `server/src/core/planner.ts` and `server/src/core/guards.ts`: the hard rules.
- `server/src/auth/`: sign-in, sessions, CSRF.
- `server/src/lib/crypto.ts`: encryption.
- `server/src/config/env.ts`: secret checks at startup.
- `.github/workflows/`: anything that runs with secrets.

## Change policy

| Safe to do any time | Pause and read the diff first | Never without a very good reason |
|---|---|---|
| Read files, search the code | Edits across many files | Read or edit `.env` / secrets |
| Run tests, lint, typecheck | Config or build changes | Deploy or touch the production database by hand |
| Fix typos in docs | Adding a dependency | Force-push or rewrite git history |
| Small UI text changes | Anything in the protected areas | Delete or skip tests, or loosen security checks |
| | Calls to a new outside service | Pipe a download straight into a shell |

Rule of thumb: the harder a change is to undo, the slower you should go.
