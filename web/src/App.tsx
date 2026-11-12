// The app shell: checks if I'm signed in, then shows the five tabs.
// Navigation uses the URL hash (#/people), so no router package is needed.
import { useCallback, useEffect, useState } from "react";
import type { MeResponse } from "../../shared/api";
import { api, ApiError, setCsrfToken } from "./api";
import { Loading } from "./components/ui";
import { Login } from "./pages/Login";
import { Today } from "./pages/Today";
import { People } from "./pages/People";
import { Overview } from "./pages/Overview";
import { History } from "./pages/History";
import { Settings } from "./pages/Settings";

const TABS = [
  { id: "today", label: "Today", icon: "📞" },
  { id: "people", label: "People", icon: "👥" },
  { id: "overview", label: "Haven't called", icon: "⏳" },
  { id: "history", label: "History", icon: "🕘" },
  { id: "settings", label: "Settings", icon: "⚙️" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function currentTab(): TabId {
  const id = window.location.hash.replace(/^#\/?/, "");
  return (TABS.find((t) => t.id === id)?.id ?? "today") as TabId;
}

type Theme = "system" | "light" | "dark";
function readTheme(): Theme {
  try {
    const t = localStorage.getItem("tb-theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}
function applyTheme(theme: Theme) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("tb-theme", theme);
  } catch {
    /* private mode: the theme just won't be remembered */
  }
}

export function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [state, setState] = useState<"loading" | "signed-out" | "signed-in" | "error">("loading");
  const [demo, setDemo] = useState(false);
  const [tab, setTab] = useState<TabId>(currentTab);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    const onHash = () => setTab(currentTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Bumping this number re-checks who is signed in (after login, logout, or "Try again").
  const [check, setCheck] = useState(0);
  const recheck = useCallback(() => setCheck((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    api.me().then(
      (who) => {
        if (cancelled) return;
        setCsrfToken(who.csrfToken);
        setMe(who);
        setState("signed-in");
        api.settings().then((s) => !cancelled && setTimezone(s.timezone), () => undefined);
      },
      (err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setState("signed-out");
          api.health().then((h) => !cancelled && setDemo(h.demo), () => undefined);
        } else setState("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [check]);

  if (state === "loading") {
    return (
      <main className="main">
        <Loading />
      </main>
    );
  }
  if (state === "error") {
    return (
      <main className="main">
        <div className="banner danger" role="alert">
          <strong>Can't reach the server.</strong>
          <p>
            <button type="button" className="btn small" onClick={recheck}>
              Try again
            </button>
          </p>
        </div>
      </main>
    );
  }
  if (state === "signed-out" || !me) return <Login demo={demo} onSignedIn={recheck} />;

  const signOut = async () => {
    try {
      await api.logout();
    } finally {
      setMe(null);
      setState("signed-out");
    }
  };
  const nextTheme: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
  const themeIcon: Record<Theme, string> = { system: "🌗", light: "☀️", dark: "🌙" };

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span aria-hidden="true">📞</span> touchbase
          {me.demo ? <span className="badge never">Demo</span> : null}
        </div>
        <div className="row">
          <button
            type="button"
            className="btn ghost icon-btn"
            aria-label={`Theme: ${theme}. Change theme`}
            title={`Theme: ${theme}`}
            onClick={() => setTheme(nextTheme[theme])}
          >
            {themeIcon[theme]}
          </button>
          <button type="button" className="btn small" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <nav className="tabs" aria-label="Main">
        {TABS.map((t) => (
          <a key={t.id} href={`#/${t.id}`} className="tab" aria-current={tab === t.id ? "page" : undefined}>
            <span className="icon" aria-hidden="true">
              {t.icon}
            </span>
            {t.label}
          </a>
        ))}
      </nav>
      <main className="main">
        {tab === "today" ? <Today /> : null}
        {tab === "people" ? <People aiAvailable={me.aiAvailable} /> : null}
        {tab === "overview" ? <Overview /> : null}
        {tab === "history" ? <History timezone={timezone} /> : null}
        {tab === "settings" ? (
          <Settings
            aiAvailable={me.aiAvailable}
            onSignedOut={() => {
              setMe(null);
              setState("signed-out");
            }}
          />
        ) : null}
      </main>
    </>
  );
}
