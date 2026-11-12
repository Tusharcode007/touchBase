# ARCHITECTURE

The big picture on one page. ⛔ marks a **trust boundary**: a place where outside input comes in and must be checked.

```
                 ┌──────────────────────── Render (one Node.js server) ───────────────────────┐
  Phone/laptop   │                                                                             │
  browser  ──⛔──▶  Express app (server/src/app.ts)                                            │
  (React app)    │   helmet → logs → size limit → sessions → rate limit → CSRF → requireAuth   │
                 │        │                                                                    │
                 │        ├─ auth/        Google sign-in (state + PKCE + allow list)           │
                 │        ├─ routes/      people, settings, calls, today, account               │
                 │        └─ jobs/daily   the "apply" layer ──▶ core/ (pure planner, no I/O)   │
                 │                │                                                            │
  GitHub Actions ──⛔──▶ /api/internal/tick (CRON_SECRET) ──▶ jobs/daily                       │
  (every hour)   │                │                                                            │
                 │                ├──⛔──▶ Google Calendar API  (calendar/google.ts)            │
                 │                ├──⛔──▶ Claude API, optional (ai/talkingPoints.ts)           │
                 │                └──────▶ MongoDB Atlas (db/models.ts)                         │
                 └─────────────────────────────────────────────────────────────────────────────┘
```

## Modules and what each one owns
| Module | Owns | Talks to |
|---|---|---|
| `shared/` | Input rules (zod) and API shapes, used by both sides | nothing |
| `server/src/core/` | **The rules.** Pure planner, guards, time maths, event text | nothing (no I/O) |
| `server/src/jobs/daily.ts` | Running the plan: lock, settle, sync, plan, apply | core, calendar, db, ai |
| `server/src/calendar/` | Talking to a calendar (Google, or the fake one) | Google Calendar API |
| `server/src/ai/` | Talking points (Claude, or the built-in list) | Claude API |
| `server/src/auth/` | Sign-in, sessions, CSRF, cron secret | Google OAuth |
| `server/src/routes/` | HTTP endpoints, input checks, mapping to safe DTOs | db, jobs |
| `server/src/db/` | MongoDB schemas | MongoDB |
| `server/src/lib/` | Encryption, logging, safe errors | — |
| `server/src/demo/` | Demo login, sample data, fake calendar (never in production) | db |
| `web/` | The dashboard (React). Holds no secrets. | `/api` only |

## Trust boundaries
1. **Browser → server.** Anything from the browser is untrusted. Checked by: session, CSRF, rate limits, zod, owner-scoped queries.
2. **GitHub Actions → server.** Only `/api/internal/tick`, only with `CRON_SECRET`. Can only run the (rule-bound) job.
3. **Google → server.** OAuth callback values (state, code) are checked. Calendar data is only read for times and status.
4. **Claude → server.** The reply is validated (3 short strings) and HTML-escaped before it goes into an event. Any failure falls back to the built-in list.

## Deeper docs
- Step-by-step paths: [FLOW.md](FLOW.md)
- Data shapes: [DATA.md](DATA.md)
- Attacks and defences: [THREAT.md](THREAT.md)
- Failure modes: [FAILURE.md](FAILURE.md)
