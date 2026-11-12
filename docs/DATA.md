# DATA

The data we keep, its shape, how it is used, how big it gets, and who writes it.

## `users` (one document per owner)
| Field | Shape | Notes |
|---|---|---|
| `email` | string, unique | From Google. Must be in `ALLOWED_EMAILS`. |
| `refreshTokenEnc` | string | Google refresh token, **encrypted**. Never sent to the browser. |
| `settings` | object | Checked by `settingsSchema` before every save. Windows, active days, active period, pause, run time, limits. |
| `state.lastPlanDate` | "YYYY-MM-DD" | The day the morning plan last ran. Makes the plan once-a-day. |
| `state.lockUntil` | date | Stops two runs at once. Expires after 2 minutes in case of a crash. |

- **Access:** read on every request (the session points to it).
- **Size:** one document per user, ~2 KB.
- **Trade-off:** settings live inside the user (one read gets everything) instead of their own collection. Fine because settings are small and always needed together.
- **Writes:** sign-in, settings page, pause, the job (state only).

## `people`
| Field | Shape | Notes |
|---|---|---|
| `userId` | ObjectId, indexed | Every query filters on this. |
| `name`, `relation` | string | Plain text (needed for display and sorting). |
| `phoneEnc` | string | E.164 phone, **encrypted**. |
| `notesEnc` | string \| null | My notes about them, **encrypted**. |
| `everyDays` | number 1–90 | How often I want to call them. |
| `timezone`, `available` | IANA zone, `[{start,end}]` | Their waking hours, in their timezone. |
| `nudge` | whatsapp \| sms \| none | Which heads-up link to show. |
| `paused`, `allowAi`, `prioritizedAt` | | |

- **Size:** capped at 50 per user.
- **Access:** the whole list is loaded for each plan (tiny), and per id for edits.

## `calls` (one document per planned call, kept as history)
| Field | Shape | Notes |
|---|---|---|
| `userId`, `personId` | ObjectId | |
| `personName` | string | A copy, so history still reads well if the person is deleted. |
| `date` | "YYYY-MM-DD" | The **local** day the call belongs to. Indexed with `userId`. This is how "today's calls" are found, and so how the daily limit is counted. |
| `start`, `end` | Date (UTC) | Where the call is now. |
| `placedStart` | Date | Where touchbase put it. If `start ≠ placedStart`, I moved it myself and touchbase leaves it alone. |
| `eventId`, `calendarId` | string | The Google event. `eventId` is null for a moment while it is being created. |
| `status` | scheduled \| done \| skipped | |
| `notesEnc` | string \| null | What we talked about, **encrypted**. |

- **Indexes:** `{userId, date}` for today's calls; `{userId, personId, status, end}` for "last done call per person"; `{userId, start}` for history.
- **Size:** at most 3 per day → about 1,000 a year. Tiny.
- **Trade-off:** we keep our own copy of each call instead of asking Google every time. That costs a little sync code, but it makes history, the daily limit and the "who is overdue" maths fast and independent of Google.

## `sessions` (managed by connect-mongo)
- One per signed-in browser. The contents are **encrypted** and the document **expires** automatically (MongoDB TTL index).

## What we never store
- Titles, descriptions or guests of my other calendar events (we don't even download them, see `BUSY_FIELDS` in `calendar/google.ts`).
- Google access tokens (only the encrypted refresh token).
- Anything about people who are not on the allow list.
