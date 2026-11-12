// A tiny fake server for screen tests: maps "METHOD /path" to a reply and records requests.
import { vi } from "vitest";

export interface Recorded {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string>;
}

export function fakeServer(routes: Record<string, (body: unknown) => { status?: number; body: unknown }>) {
  const requests: Recorded[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), "http://localhost");
    const method = (init.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/^\/api/, "");
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method, path, body, headers: (init.headers ?? {}) as Record<string, string> });
    const handler = routes[`${method} ${path}`];
    const reply = handler ? handler(body) : { status: 404, body: { error: "Not found" } };
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { requests };
}
