# DEFENSE: touchbase

> A one-page "explain it at a whiteboard" brief.
> **This is a first draft. Rewrite it in your own words**, then try to say it out loud with no notes.
> Where you get stuck is exactly what to study next.

**What it does (2 sentences):**
touchbase reads my Google Calendar every morning, finds a free 10–15 minutes later that day, and adds one "📞 Call Mom" event for the person I've gone longest without calling. It only plans today, never touches my other events, and I control it from a small React dashboard.

**How it works (the flow):**
```
GitHub Actions (hourly) → POST /api/internal/tick (secret) → daily job
  → lock → settle yesterday's calls → guards (paused? period? weekday?)
  → morning plan (once, after the run time) or conflict check (later ticks)
  → pure planner returns actions → save call → create Google event → save event id
Dashboard (React) → /api (session cookie + CSRF token) → people, settings, history
```

**Key decisions and why X over Y:**
- *Plan today only, not the week*: no calendar spam, and the plan always uses the latest calendar. (D-001)
- *Pure planner + thin apply layer*: every rule is unit-tested without Google. (D-002)
- *Hourly GitHub Actions tick, not an in-server cron*: free servers sleep, so a timer inside them wouldn't fire. (D-014)
- *Server-side sessions, not JWT in localStorage*: injected scripts can't steal them, and I can end them at any time. (D-010)
- *One-tap WhatsApp links, not Twilio SMS*: messages come from my own number, cost nothing, and need no DLT paperwork. (D-008)
- *events.list with a `fields` filter, not freeBusy*: I need to tell my own calls apart from real meetings, and I still never download event titles. (D-018)

**Data structures and why:**
- `calls` documents keyed by `{userId, date}`: "today's calls" is one indexed query, and that count enforces the daily limit, even across crashes, because the call is saved before the event exists.
- `placedStart` vs `start`: tells "touchbase put it here" apart from "I moved it", so the conflict check respects my manual moves.
- Plain epoch-millisecond intervals in the planner: simple, fast maths (merge, subtract, intersect). Luxon only at the edges, for timezones.

**How a malicious actor could abuse it (and what stops them):**
- *A stranger*: can't sign in (allow list re-checked on every request), login is rate-limited, every data route needs a session.
- *A malicious website while I'm signed in*: blocked by SameSite cookies, the Origin check and the CSRF token.
- *Forged login link*: one-time `state` + PKCE.
- *Database leak*: refresh token, phones and notes are AES-256-GCM encrypted. The key is not in the database.
- *Leaked cron secret*: the worst case is running the plan early. The rules still hold.
- Full list: [THREAT.md](../THREAT.md).

**Where it fails and how I'd notice:**
- First limit: GitHub pauses schedules after 60 days without commits → no calls → GitHub emails me, and "Run now" still works.
- Google token revoked or expired → the dashboard says "sign in again".
- Google down → that tick fails and is retried next hour, and the daily limit can't be broken.
- Full list: [FAILURE.md](../FAILURE.md).

**What I'd change with more time:**
- A weekly summary ("you called 6 people this week").
- Rate limits in a shared store if it ever runs on more than one server.
- A live end-to-end test against a throwaway Google account.
- Show a person's local time in the dashboard next to the call time.

## Whiteboard drill (answer out loud, no notes)
1. What does it do, in two sentences?
2. Walk one hourly tick from GitHub Actions to the new calendar event.
3. Why plan only today instead of the week?
4. Why is the call saved before the calendar event? What breaks if you swap them?
5. What's in a `calls` document, and why the `date` field?
6. What can an anonymous user try? A malicious site while you're signed in?
7. What happens if Google is down for an hour? If MongoDB is?
8. How would you know it broke before a friend asked why you stopped calling?
9. How do you undo a bad deploy? (ROLLBACK.md)
10. What is still unverified? (ASSUMPTIONS.md)
