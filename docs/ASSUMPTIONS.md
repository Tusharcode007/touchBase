# ASSUMPTIONS and OPEN QUESTIONS

Things we believe but have not fully proven. Clear the "unverified" list before relying on touchbase every day.

| # | Assumption | Status | How to check |
|---|---|---|---|
| A1 | The Google provider (`calendar/google.ts`) works against the real API: insert with private tags, the `privateExtendedProperty` search, the `fields` filter, patch, delete. | **Unverified**. Type-checked, the busy filter is unit-tested, the job is tested with the fake calendar. | Sign in with a real account, press "Run now", check the event in Google Calendar, then move and delete it. |
| A2 | `calendar.events.owned` + `calendar.events.readonly` are enough to create, patch and delete events on my primary calendar. | **Unverified** | Same as A1. |
| A3 | With `prompt=consent` and `access_type=offline`, Google returns a refresh token on every sign-in. | Verified in Google's docs | Sign in twice. |
| A4 | Refresh tokens stop expiring after 7 days once the OAuth app is set to "In production". | Verified in Google's docs | Check the dashboard after 8 days. |
| A5 | Render's free tier has exactly one proxy in front of the app (`TRUST_PROXY=1`). | **Unverified** | After deploy, check that rate limits apply per real client IP. |
| A6 | The Claude call (structured output + server-side fallback) returns 3 points. | **Unverified live**. It compiles against the SDK types, and the fallback path is tested. | Set `ANTHROPIC_API_KEY`, press "Run now", read the event. |
| A7 | `wa.me/<number>?text=` and `sms:<number>?&body=` open correctly on both Android and iPhone. | **Unverified on real phones** | Tap both links from a real event. |
| A8 | All-day events in Google are "free" by default, so holidays don't block the day, but an all-day "Trip" marked busy does. | Logic verified in tests. Google's default is unverified. | Create both kinds and run the plan. |
| A9 | GitHub's hourly schedule is late by minutes, not hours. | Assumed from experience | Watch the Actions tab for a week. |
| A10 | "Every morning around 11 or 12" means the plan runs once after the chosen morning time (default 11:00). | Interpretation of the request | Change it in Settings if needed. |

## Open questions
- Should a call deleted by mistake be easy to bring back the same day? (Today: no, see D-005.)
- Should there be a weekly summary ("you called 6 people this week")? Not built.
