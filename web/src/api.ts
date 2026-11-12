// Talks to the server. Every change request carries the CSRF token we got from /api/auth/me.
// The browser never sees Google tokens or other secrets — only the owner's own data.
import type {
  CalendarInfo,
  CallDTO,
  HealthResponse,
  MeResponse,
  OverviewRow,
  PersonDTO,
  RunResult,
  TodayResponse,
} from "../../shared/api";
import type { CallUpdate, PauseInput, PersonInput, Settings } from "../../shared/schemas";

let csrfToken = "";
export function setCsrfToken(token: string) {
  csrfToken = token;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fields: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-CSRF-Token"] = csrfToken;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: { path: string; message: string }[] };
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Something went wrong. Please try again.", data.fields ?? []);
  return data as T;
}

export const api = {
  health: () => request<HealthResponse>("GET", "/health"),
  me: () => request<MeResponse>("GET", "/auth/me"),
  logout: () => request<{ ok: true }>("POST", "/auth/logout"),
  demoLogin: () => request<{ ok: true }>("POST", "/auth/demo"),

  today: () => request<TodayResponse>("GET", "/today"),
  runNow: () => request<RunResult>("POST", "/today/run"),
  pause: (input: PauseInput) => request<{ settings: Settings; removed: number }>("POST", "/settings/pause", input),

  people: () => request<PersonDTO[]>("GET", "/people"),
  addPerson: (p: PersonInput) => request<PersonDTO>("POST", "/people", p),
  updatePerson: (id: string, p: PersonInput) => request<PersonDTO>("PUT", `/people/${encodeURIComponent(id)}`, p),
  deletePerson: (id: string) => request<{ ok: true }>("DELETE", `/people/${encodeURIComponent(id)}`),
  prioritize: (id: string) => request<PersonDTO>("POST", `/people/${encodeURIComponent(id)}/prioritize`),
  overview: () => request<OverviewRow[]>("GET", "/overview"),

  calls: () => request<CallDTO[]>("GET", "/calls"),
  updateCall: (id: string, update: CallUpdate) => request<CallDTO>("PATCH", `/calls/${encodeURIComponent(id)}`, update),

  settings: () => request<Settings>("GET", "/settings"),
  saveSettings: (s: Settings) => request<Settings>("PUT", "/settings", s),
  calendars: () => request<CalendarInfo[]>("GET", "/calendars"),
  deleteAccount: () => request<{ ok: true }>("DELETE", "/account", { confirm: "DELETE" }),
};
