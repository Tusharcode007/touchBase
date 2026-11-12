import { useState } from "react";
import { api } from "../api";

const ERRORS: Record<string, string> = {
  "not-allowed": "This Google account isn't allowed to use this touchbase. Only the owner's email can sign in.",
  "login-failed": "Sign-in didn't finish. Please try again.",
  "calendar-permission-missing": "touchbase needs the calendar permissions to work. Please sign in again and tick all the boxes.",
  "no-refresh-token": "Google didn't give touchbase lasting access. Remove touchbase at myaccount.google.com/permissions and sign in again.",
  "demo-mode": "This server is running in demo mode. Use the demo button below.",
};

export function Login({ demo, onSignedIn }: { demo: boolean; onSignedIn: () => void }) {
  const code = new URLSearchParams(window.location.search).get("error");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(code ? (ERRORS[code] ?? "Sign-in didn't work. Please try again.") : null);

  const tryDemo = async () => {
    setBusy(true);
    try {
      await api.demoLogin();
      window.history.replaceState(null, "", "/");
      onSignedIn();
    } catch {
      setError("The demo didn't start. Is the server running with DEMO_MODE=true?");
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <div className="card">
        <div className="logo" aria-hidden="true">
          📞
        </div>
        <h1>touchbase</h1>
        <p className="muted">One short call a day with someone you care about.</p>
        <ul>
          <li>Finds a free 10–15 minutes in your Google Calendar</li>
          <li>Picks who you haven't called for the longest</li>
          <li>Adds one call for today only — no calendar spam</li>
        </ul>
        {error ? (
          <div className="banner danger" role="alert">
            <strong>{error}</strong>
          </div>
        ) : null}
        <div className="stack">
          {demo ? (
            <button type="button" className="btn primary block" onClick={tryDemo} disabled={busy}>
              {busy ? "Starting the demo…" : "Try the demo"}
            </button>
          ) : (
            <a className="btn primary block" href="/api/auth/google">
              Sign in with Google
            </a>
          )}
        </div>
        <p className="hint top-gap">
          {demo
            ? "Demo mode uses a pretend calendar and sample people. Nothing touches Google."
            : "touchbase only adds and changes its own call events. It never edits your other events."}
        </p>
      </div>
    </main>
  );
}
