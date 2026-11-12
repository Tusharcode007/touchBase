// Screen tests for the key flows. The server is faked; the real rules are tested on the server side.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TodayResponse } from "../../shared/api";
import { defaultSettings } from "../../shared/schemas";
import { App } from "./App";
import { Today } from "./pages/Today";
import { EMPTY_PERSON, PersonForm } from "./pages/People";
import { SettingsForm } from "./pages/Settings";
import { api, setCsrfToken } from "./api";
import { fakeServer } from "./test/fakeServer";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

const later = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();

function today(over: Partial<TodayResponse> = {}): TodayResponse {
  return {
    date: "2026-11-16",
    status: "active",
    lastOutcome: "scheduled",
    ranToday: true,
    runTime: "11:00",
    calls: [
      {
        id: "c1",
        personId: "p1",
        personName: "Mom",
        date: "2026-11-16",
        start: later,
        end: later,
        status: "scheduled",
        notes: "",
        nudge: "whatsapp",
        links: { call: "tel:+919876543210", whatsapp: "https://wa.me/919876543210?text=Hi", sms: "sms:+919876543210?&body=Hi" },
      },
    ],
    settings: { paused: false, pausedUntil: null, activeFrom: "2026-11-01", activeTo: "2027-01-31", timezone: "Asia/Kolkata" },
    ...over,
  };
}

describe("sign in screen", () => {
  it("shows the Google button when signed out", async () => {
    fakeServer({
      "GET /auth/me": () => ({ status: 401, body: { error: "Please sign in." } }),
      "GET /health": () => ({ body: { ok: true, demo: false } }),
    });
    render(<App />);
    const link = await screen.findByRole("link", { name: "Sign in with Google" });
    expect(link).toHaveAttribute("href", "/api/auth/google");
  });

  it("explains when the email is not allowed", async () => {
    window.history.replaceState(null, "", "/?error=not-allowed");
    fakeServer({
      "GET /auth/me": () => ({ status: 401, body: {} }),
      "GET /health": () => ({ body: { ok: true, demo: false } }),
    });
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("isn't allowed");
  });

  it("offers the demo when the server is in demo mode", async () => {
    fakeServer({
      "GET /auth/me": () => ({ status: 401, body: {} }),
      "GET /health": () => ({ body: { ok: true, demo: true } }),
    });
    render(<App />);
    expect(await screen.findByRole("button", { name: "Try the demo" })).toBeInTheDocument();
  });
});

describe("Today screen", () => {
  it("shows today's call with one-tap Call and WhatsApp buttons", async () => {
    fakeServer({ "GET /today": () => ({ body: today() }) });
    render(<Today />);
    const card = await screen.findByRole("article", { name: "Call Mom" });
    expect(within(card).getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:+919876543210");
    const wa = within(card).getByRole("link", { name: "WhatsApp" });
    expect(wa).toHaveAttribute("href", "https://wa.me/919876543210?text=Hi");
    expect(wa).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("says when there is no free slot", async () => {
    fakeServer({ "GET /today": () => ({ body: today({ lastOutcome: "no-slot", calls: [] }) }) });
    render(<Today />);
    expect(await screen.findByText("No free slot today")).toBeInTheDocument();
  });

  it("shows the paused banner and the date it starts again", async () => {
    fakeServer({
      "GET /today": () => ({
        body: today({ status: "paused", calls: [], settings: { ...today().settings, paused: true, pausedUntil: "2026-11-20" } }),
      }),
    });
    render(<Today />);
    expect(await screen.findByText("Paused")).toBeInTheDocument();
    expect(screen.getByText(/starts again on/)).toBeInTheDocument();
  });

  it("pausing asks whether to also remove today's call, and sends the CSRF token", async () => {
    setCsrfToken("token-123");
    const server = fakeServer({
      "GET /today": () => ({ body: today() }),
      "POST /settings/pause": () => ({ body: { settings: defaultSettings("2026-11-16"), removed: 1 } }),
    });
    const user = userEvent.setup();
    render(<Today />);
    await user.click(await screen.findByRole("switch", { name: "touchbase on" }));
    const dialog = await screen.findByRole("dialog", { name: "Pause touchbase?" });
    expect(within(dialog).getByRole("checkbox", { name: /remove today's call/ })).toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(server.requests.some((r) => r.path === "/settings/pause")).toBe(true));
    const req = server.requests.find((r) => r.path === "/settings/pause")!;
    expect(req.body).toEqual({ paused: true, pausedUntil: null, removeTodayCall: true });
    expect(req.headers["X-CSRF-Token"]).toBe("token-123");
  });
});

describe("person form", () => {
  it("catches a bad phone number before sending anything", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<PersonForm initial={EMPTY_PERSON} aiAvailable onSave={onSave} onCancel={() => undefined} />);
    await user.type(screen.getByLabelText("Name"), "Mom");
    await user.type(screen.getByLabelText("Phone (with country code)"), "12345");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/full number with country code/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves a valid person", async () => {
    const onSave = vi.fn(async (_person: unknown) => undefined);
    const user = userEvent.setup();
    render(<PersonForm initial={EMPTY_PERSON} aiAvailable onSave={onSave} onCancel={() => undefined} />);
    await user.type(screen.getByLabelText("Name"), "Mom");
    await user.type(screen.getByLabelText("Phone (with country code)"), "+91 98765 43210");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]).toEqual([expect.objectContaining({ name: "Mom", phone: "+91 98765 43210" })]);
  });
});

describe("settings form", () => {
  const initial = { ...defaultSettings("2026-11-16"), activeFrom: "2026-11-16", activeTo: "2099-06-30" };

  it("'Extend +1 week' and '+1 month' push the end date", async () => {
    const user = userEvent.setup();
    render(<SettingsForm initial={initial} calendars={[]} aiAvailable onSave={vi.fn()} onPauseChanged={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Extend +1 week" }));
    expect(screen.getByLabelText("To")).toHaveValue("2099-07-07");
    await user.click(screen.getByRole("button", { name: "Extend +1 month" }));
    expect(screen.getByLabelText("To")).toHaveValue("2099-08-07");
  });

  it("lets me switch weekdays off", async () => {
    const onSave = vi.fn(async (_settings: unknown) => undefined);
    const user = userEvent.setup();
    render(<SettingsForm initial={initial} calendars={[]} aiAvailable onSave={onSave} onPauseChanged={vi.fn()} />);
    const days = screen.getByRole("group", { name: "Active days" });
    await user.click(within(days).getByRole("button", { name: "Sat" }));
    await user.click(within(days).getByRole("button", { name: "Sun" }));
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0]).toMatchObject({ activeDays: ["mon", "tue", "wed", "thu", "fri"] });
  });

  it("refuses an afternoon run time", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<SettingsForm initial={{ ...initial, runTime: "14:00" }} calendars={[]} aiAvailable onSave={onSave} onPauseChanged={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText(/morning time between 05:00 and 12:00/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("api client", () => {
  it("sends the CSRF token on changes but not on reads", async () => {
    setCsrfToken("abc");
    const server = fakeServer({ "GET /people": () => ({ body: [] }), "POST /today/run": () => ({ body: { status: "active", outcome: null, created: 0 } }) });
    await api.people();
    await api.runNow();
    expect(server.requests[0]!.headers["X-CSRF-Token"]).toBeUndefined();
    expect(server.requests[1]!.headers["X-CSRF-Token"]).toBe("abc");
  });
});
