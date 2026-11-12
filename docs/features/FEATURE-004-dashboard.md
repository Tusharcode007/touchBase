# FEATURE-004: React dashboard

**Goal:** A clean, phone-friendly dashboard to see today's call, manage people, see who I haven't called, read history, and control everything in settings.

**Scope:** Login (Google, or demo), Today (status banner, call card with Call/WhatsApp/Done/Skipped/Notes, Run now, big Pause switch), People (add/edit/delete with the shared validation), Haven't called (overdue badges, Prioritise next), History (Done/Skipped, notes), Settings (active period with Extend buttons, active days, run time, pause, call length, calls per day, buffer, reminders, windows per weekday, calendars, timezone, AI, danger zone). Light/dark/system theme.

**Design:**
- No router or UI library: hash links and plain CSS keep the bundle and the dependency list small.
- `web/src/api.ts` adds the CSRF token to every change request.
- Inputs are checked with the same zod rules as the server (`shared/schemas.ts`), for quick feedback only.
- No inline scripts or `dangerouslySetInnerHTML`, so the strict CSP holds.

**Status:** Done.

## Log
- 2026-11-12: Built all screens and 13 screen tests (React Testing Library). The strict React lint rules caught three patterns (setState inside effects, a ref read during render, `Date.now()` during render). All fixed.
- 2026-11-12: Checked by hand in the browser in demo mode, at desktop and phone sizes, light and dark: demo sign-in, Run now (correctly refused a second call), Prioritise next (the next plan picked that person, then cleared the flag), add person (bad phone caught, good one saved), pause with "remove today's call", resume, extend the period, switch a weekday off, save settings. No JS errors in the console.
- 2026-11-12: Found and fixed BUG-001 (dev API port) and BUG-002 (phone overflow). Improved the Today banner when today's call was removed ("No call left today").
