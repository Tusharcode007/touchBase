# ROLLBACK

How to undo a bad change. The harder something is to undo, the slower you should go.

## Last known good commits
| Commit | What it contains | Checked by |
|---|---|---|
| `73a17e2` | Scheduling engine + tests | 48 tests |
| `98536de` | Secure server, sign-in, people API | 81 tests, CI green |
| `23a2f9d` | Calendar sync, daily job, AI, demo | 104 tests, CI green, demo checked with curl |
| `7e6a872` | React dashboard | 105 + 13 tests, CI green, browser check |
| latest `main` | Security review fixes + docs | see HANDOVER.md |

Before a risky change, write the current commit here: `git rev-parse --short HEAD`.

## 1. Emergency stop (no deploy needed)
Something is creating wrong events right now?
1. Dashboard → **Today** → turn touchbase **off** (tick "remove today's call").
2. Or: GitHub → Actions → **Hourly tick** → "…" → **Disable workflow**.
3. Worst case: revoke access at https://myaccount.google.com/permissions → touchbase. It can't touch your calendar after that.

touchbase only ever creates events titled "📞 Call …" for today, so clean-up is at most a few events.

## 2. Roll back the code
- **On Render (fastest):** Dashboard → your service → **Events** → pick the last good deploy → **Rollback**.
- **In git (keeps history, no force-push):**
  ```bash
  git revert <bad-commit>     # makes a new commit that undoes it
  git push
  ```
  Render deploys the revert automatically.

## 3. Data
- There are **no database migrations**. Old and new code read the same documents.
- Settings are checked by the zod schema on every read. If a bad deploy saved invalid settings, open **Settings** and press **Save** with correct values.
- Atlas free tier has no point-in-time backups. To export your data: Atlas → Browse Collections, or `mongodump --uri "$MONGODB_URI"`.

## 4. Secrets
If a secret leaked:
| Secret | Do this |
|---|---|
| `CRON_SECRET` | Render → Environment → Generate a new value → update the GitHub secret too |
| `SESSION_SECRET` | Generate a new value. Everyone is signed out. |
| `TOKEN_ENCRYPTION_KEY` | Generate a new value, then **sign in again** (the old refresh token can't be decrypted). People's phones and notes become unreadable: re-enter them, or keep the old key until you've exported them. |
| `GOOGLE_CLIENT_SECRET` | Google Cloud → Clients → reset the secret → update Render |
| `MONGODB_URI` password | Atlas → Database Access → edit the user's password → update Render |
| `ANTHROPIC_API_KEY` | Revoke it in the Anthropic console, make a new one |

## 5. After any rollback, re-check
`npm run check`, then the manual path in [TESTING.md](TESTING.md) §3.
