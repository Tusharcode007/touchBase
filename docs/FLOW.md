# FLOW

How execution travels through the code. File → function → next file.

## 1. Sign in
```
browser: "Sign in with Google" link → GET /api/auth/google
  server/src/auth/routes.ts  GET /google
    randomToken() → state, verifier (lib/crypto.ts)
    save { state, verifier, createdAt } in the session
    redirect → oauth.authUrl(state, pkceChallenge(verifier))     (auth/oauth.ts)
Google consent screen → GET /api/auth/google/callback?code&state
  auth/routes.ts  GET /google/callback
    take + delete session.oauth (one use only)
    safeEqual(state)  and  not older than 10 minutes
    oauth.exchange(code, verifier)  → getToken + verifyIdToken + scope check
    email verified AND in ALLOWED_EMAILS?   no → destroy session → /?error=not-allowed
    find or create User (defaultSettings) → encrypt refresh token → save
    regenerate session → userId, createdAt, csrfToken → redirect /
browser → GET /api/auth/me → { email, csrfToken }  (the token goes in X-CSRF-Token from now on)
```

## 2. The hourly tick (the heart of touchbase)
```
GitHub Actions (tick.yml, every hour) → POST /api/internal/tick  (Bearer CRON_SECRET)
  routes/internal.ts → requireCronSecret (auth/guards.ts) → tickAll()          (jobs/daily.ts)
    for each user: runForUser(user, "tick")
      acquireLock()                         one run at a time per user
      auto-resume if "pause until" reached
      settleFinishedCalls()                 ended calls → done (event exists) or skipped (deleted)
                                            + copy notes typed in the event
      checkGuards()                         core/guards.ts: paused? period? weekday?  → stop if not active
      syncTodayCalls()                      I deleted it → skipped; I moved it → update times
      morning plan due?  (past runTime and not yet planned today, or "Run now")
        yes → planToday(input)              core/planner.ts (pure)
              applyActions(create)          save Call FIRST → buildEvent → calendar.createEvent → save eventId
              state.lastPlanDate = today
        no, already planned today →
              checkConflicts(input)         core/planner.ts (pure)
              applyActions(move/remove)     calendar.moveEvent / deleteEvent (own events only)
      releaseLock()
  → { ok, users, created, failed }   (counts only, logs are public)
```

## 3. Building one event
```
jobs/daily.ts buildEvent()
  last done call with notes → decrypt → "Last time you talked about"
  ctx.topics.pick()                 ai/talkingPoints.ts → Claude (optional) → else core/offlineTopics.ts
  eventDescription()                core/eventText.ts → links (tel, wa.me, sms) + escaped text
calendar.createEvent()              calendar/google.ts → events.insert with private tag {touchbase: "1", tbCallId}
```

## 4. Dashboard request (example: add a person)
```
web → POST /api/people  (cookie + X-CSRF-Token)
  app.ts: helmet → pino → json(20kb) → session → rate limit → csrfProtection → requireAuth
  routes/people.ts → personSchema.parse (shared/schemas.ts) → E.164 phone → encrypt phone + notes
  Person.create({ userId, … }) → personToDTO (services/dto.ts) → 201
```

## 5. Pause
```
web → POST /api/settings/pause { paused, pausedUntil, removeTodayCall }
  routes/today.ts → pauseSchema → save settings
  removeTodayCall? → removeUpcomingToday() (jobs/daily.ts) → deleteEvent for today's calls that haven't started
```
