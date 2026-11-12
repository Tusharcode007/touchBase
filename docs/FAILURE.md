# FAILURE

How touchbase fails, one dependency at a time. For each: what happens, and how we notice.

## Google Calendar
| If it is… | What happens | How we notice |
|---|---|---|
| Slow | Each tick waits. GitHub's curl gives up after 120 s and retries. | Failed run in the Actions tab |
| Down | The job throws for that user and `failed` goes up by 1. Nothing is half-created: the call is saved before the event, and the call is removed if creating the event fails. The next hourly tick tries again. | Actions log shows `failed: 1`; Render logs show "daily job failed" |
| Refusing our token (revoked, or app left in "Testing" mode so it expired after 7 days) | `CalendarAuthError` → `lastOutcome = "reconnect-google"` | The dashboard shows "Please sign in again" |
| Returning odd data (event without times) | That event is skipped | — |

## MongoDB Atlas
| If it is… | What happens | How we notice |
|---|---|---|
| Down at startup | Server stops after 10 s with a clear error | Render deploy fails |
| Down later | Requests return the generic 500 message. The tick fails and is retried next hour. | Render logs, dashboard errors |
| Full (free tier: 512 MB) | Very far away: ~1,000 calls a year is a few hundred KB | Atlas email |

## Render (free tier)
- **Sleeps after ~15 minutes idle.** The first request takes ~1 minute. tick.yml retries 5 times, 20 s apart, with a 120 s timeout.
- **Restarts** clear the in-memory rate-limit counters (accepted, see THREAT.md).

## GitHub Actions
- **Scheduled runs are delayed** at busy times (often 5–15 minutes). Harmless: the plan runs "after the run time", not "at" it.
- **GitHub turns off schedules in public repos after 60 days with no commits.** Then no calls get planned. You get an email from GitHub. Fix: Actions → Hourly tick → "Enable workflow" (or push any commit).
- **If Actions is down for a whole morning**, that day has no call. Press "Run now" in the dashboard.

## Claude API (optional)
- Slow (30 s timeout), down, out of credit, or refusing → the built-in talking points are used. The call is still created. Tested in `job.test.ts`.

## Our own limits
- **Two ticks at once** (manual "Run now" during the hourly tick): the per-user lock lets only one run. The other returns `busy`.
- **A crash mid-plan:** the lock expires after 2 minutes. A call with no `eventId` is either matched to its event by tag or deleted on the next tick. The daily limit holds either way.
- **The first limit we will hit:** GitHub's 60-day schedule pause (above). After that, Google API quotas, which are far away at ~24 ticks × a few requests a day.
