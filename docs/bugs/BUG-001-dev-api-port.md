# BUG-001: API server used the wrong port in development

Symptom: The dashboard showed "Can't reach the server". Vite logged `http proxy error: /api/auth/me ECONNREFUSED`.

Repro steps:
1. Set `PORT=5173` in the environment (some tools do this for the web port).
2. Run `npm run dev`.
3. Open http://localhost:5173.

Root cause: `scripts/dev.mjs` passed the whole environment to the API server, so it also read `PORT=5173` and listened there instead of on 3000. Vite forwards `/api` to 3000, so nothing answered.

Fix: `scripts/dev.mjs` now always starts the API with `PORT=3000` during development.

Verification: `curl http://localhost:3000/api/health` → `{"ok":true,"demo":true}`, and the dashboard loaded and signed in to demo mode in the browser.

## Log
- 2026-11-12: Found while checking the dashboard in a browser. Confirmed with `lsof` that the API process was listening on :5173, not :3000. Fixed and re-checked.
