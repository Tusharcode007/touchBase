// Tests for the hard rules. Each describe block maps to a rule in docs/CONSTRAINTS.md.
import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { defaultSettings } from "../../shared/schemas.js";
import { dayInfo } from "../src/core/day.js";
import {
  checkConflicts,
  planToday,
  type PlanInput,
  type PlannerCall,
  type PlannerPerson,
  type PlanResult,
} from "../src/core/planner.js";

const TZ = "Asia/Kolkata";
const MON = "2026-11-16"; // a Monday
const SUN = "2026-11-22"; // a Sunday
const at = (hhmm: string, date = MON, tz = TZ) => DateTime.fromISO(`${date}T${hhmm}`, { zone: tz }).toMillis();
const DAY = 24 * 60 * 60 * 1000;

function person(id: string, over: Partial<PlannerPerson> = {}): PlannerPerson {
  return {
    id,
    name: id,
    everyDays: 7,
    timezone: TZ,
    available: [],
    paused: false,
    lastDoneAt: null,
    prioritized: false,
    ...over,
  };
}

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    now: at("11:00"),
    settings: defaultSettings(MON),
    people: [person("mom", { everyDays: 2 })],
    busy: [],
    todayCalls: [],
    ...over,
  };
}

/** Apply actions the way the real job would, so we can run the planner again. */
let nextId = 1;
function apply(inp: PlanInput, result: PlanResult): PlanInput {
  let calls: PlannerCall[] = [...inp.todayCalls];
  for (const a of result.actions) {
    if (a.type === "create") {
      calls.push({ id: `call-${nextId++}`, personId: a.personId, start: a.start, end: a.end, placedStart: a.start, status: "scheduled" });
    } else if (a.type === "move") {
      calls = calls.map((c) => (c.id === a.callId ? { ...c, start: a.start, end: a.end, placedStart: a.start } : c));
    } else {
      calls = calls.filter((c) => c.id !== a.callId);
    }
  }
  return { ...inp, todayCalls: calls };
}

function creates(result: PlanResult) {
  return result.actions.filter((a) => a.type === "create");
}

describe("Rule 1: today only", () => {
  it("creates one call tonight, at the start of the evening window", () => {
    const result = planToday(input());
    expect(result.outcome).toBe("scheduled");
    expect(result.actions).toEqual([{ type: "create", personId: "mom", start: at("19:30"), end: at("19:45") }]);
  });

  it("never plans tomorrow, even when today's window is already over", () => {
    const result = planToday(input({ now: at("21:50") })); // earliest start 22:20, window ends 22:00
    expect(result.actions).toEqual([]);
    expect(result.outcome).toBe("no-slot");
  });

  it("creates nothing on a day with no call windows", () => {
    const settings = defaultSettings(MON);
    settings.windows.mon = [];
    expect(planToday(input({ settings })).actions).toEqual([]);
  });

  it("every slot it creates is inside today, whatever the time of day", () => {
    const settings = { ...defaultSettings(MON), callsPerDay: 3 };
    const people = ["a", "b", "c", "d", "e"].map((id) => person(id));
    for (const date of [MON, SUN, "2026-03-08", "2026-12-31"]) {
      for (let hour = 0; hour < 24; hour++) {
        const now = at(`${String(hour).padStart(2, "0")}:07`, date);
        const day = dayInfo(now, TZ);
        for (const a of creates(planToday(input({ now, settings, people })))) {
          expect(a.start).toBeGreaterThanOrEqual(day.start);
          expect(a.end).toBeLessThanOrEqual(day.end);
          expect(a.start).toBeGreaterThan(now);
        }
      }
    }
  });
});

describe("Rule 2: calls-per-day limit", () => {
  const three = [person("a"), person("b"), person("c")];

  it("makes only 1 call by default, even with many people", () => {
    expect(creates(planToday(input({ people: three })))).toHaveLength(1);
  });

  it("makes up to 3 calls when allowed, with the buffer between them", () => {
    const settings = { ...defaultSettings(MON), callsPerDay: 3 };
    const made = creates(planToday(input({ people: three, settings })));
    expect(made.map((a) => a.start)).toEqual([at("19:30"), at("20:00"), at("20:30")]);
  });

  it("does nothing if today's call already exists", () => {
    const todayCalls: PlannerCall[] = [
      { id: "x", personId: "a", start: at("19:30"), end: at("19:45"), placedStart: at("19:30"), status: "scheduled" },
    ];
    expect(planToday(input({ people: three, todayCalls }))).toEqual({ actions: [], outcome: "limit-reached" });
  });

  it("a skipped (deleted) call still counts, so nothing sneaks back in", () => {
    const todayCalls: PlannerCall[] = [
      { id: "x", personId: "a", start: at("19:30"), end: at("19:45"), placedStart: at("19:30"), status: "skipped" },
    ];
    expect(planToday(input({ people: three, todayCalls })).outcome).toBe("limit-reached");
  });

  it("tops up to the limit when one call already exists", () => {
    const settings = { ...defaultSettings(MON), callsPerDay: 2 };
    const todayCalls: PlannerCall[] = [
      { id: "x", personId: "a", start: at("19:30"), end: at("19:45"), placedStart: at("19:30"), status: "scheduled" },
    ];
    const made = creates(planToday(input({ people: three, settings, todayCalls })));
    expect(made).toHaveLength(1);
    expect(made[0]?.personId).not.toBe("a");
  });
});

describe("Rule 3: idempotent", () => {
  it("running 5 times gives the same result as running once", () => {
    let state = input({ people: [person("a"), person("b")] });
    for (let i = 0; i < 5; i++) state = apply(state, planToday(state));
    expect(state.todayCalls).toHaveLength(1);
  });

  it("also holds with 3 calls a day", () => {
    let state = input({ people: [person("a"), person("b"), person("c"), person("d")], settings: { ...defaultSettings(MON), callsPerDay: 3 } });
    for (let i = 0; i < 5; i++) state = apply(state, planToday(state));
    expect(state.todayCalls).toHaveLength(3);
  });
});

describe("Busy time, buffer and lead time", () => {
  it("keeps the buffer after a meeting and starts on a 15-minute mark", () => {
    const busy = [{ start: at("19:30"), end: at("20:00") }];
    const [made] = creates(planToday(input({ busy }))); // 20:00 + 10 min buffer = 20:10 → 20:15
    expect(made?.start).toBe(at("20:15"));
  });

  it("with no buffer the call can start right after the meeting", () => {
    const settings = { ...defaultSettings(MON), bufferMinutes: 0 };
    const busy = [{ start: at("19:30"), end: at("20:00") }];
    expect(creates(planToday(input({ busy, settings })))[0]?.start).toBe(at("20:00"));
  });

  it("finds nothing when the whole evening is busy", () => {
    const busy = [{ start: at("19:00"), end: at("22:30") }];
    expect(planToday(input({ busy })).outcome).toBe("no-slot");
  });

  it("never starts sooner than 30 minutes from now", () => {
    expect(creates(planToday(input({ now: at("19:50") })))[0]?.start).toBe(at("20:30"));
  });
});

describe("The other person's timezone", () => {
  // Mid-November: Los Angeles is UTC-8, India is UTC+5:30 (13.5 hours apart).
  const LA = "America/Los_Angeles";

  it("waits until my friend abroad is awake", () => {
    const friend = person("friend", { timezone: LA, available: [{ start: "08:00", end: "22:00" }] });
    const [made] = creates(planToday(input({ people: [friend] })));
    // 08:00 in LA = 21:30 in India.
    expect(made?.start).toBe(at("21:30"));
    expect(DateTime.fromMillis(made!.start, { zone: LA }).toFormat("HH:mm")).toBe("08:00");
  });

  it("never calls them at night their time: picks someone else instead", () => {
    const friend = person("friend", { timezone: LA, available: [{ start: "09:00", end: "22:00" }], lastDoneAt: null });
    const mom = person("mom", { lastDoneAt: at("20:00", "2026-11-10") });
    const [made] = creates(planToday(input({ people: [friend, mom] })));
    expect(made?.personId).toBe("mom");
  });

  it("works when their free hours fall on their previous date", () => {
    // Sunday 11:00 in India = Saturday 21:30 in LA.
    const friend = person("friend", { timezone: LA, available: [{ start: "08:00", end: "22:00" }] });
    const [made] = creates(planToday(input({ now: at("09:00", SUN), people: [friend] })));
    expect(made?.start).toBe(at("11:00", SUN));
  });
});

describe("Who gets picked", () => {
  const now = at("11:00");

  it("picks the most overdue person (days since ÷ every N days)", () => {
    const mom = person("mom", { everyDays: 2, lastDoneAt: now - 3 * DAY }); // 1.5
    const friend = person("friend", { everyDays: 7, lastDoneAt: now - 7 * DAY }); // 1.0
    expect(creates(planToday(input({ people: [friend, mom] })))[0]?.personId).toBe("mom");
  });

  it("'Prioritise next' wins over everything else", () => {
    const mom = person("mom", { everyDays: 2, lastDoneAt: now - 10 * DAY });
    const friend = person("friend", { prioritized: true, lastDoneAt: now - 2 * DAY });
    expect(creates(planToday(input({ people: [mom, friend] })))[0]?.personId).toBe("friend");
  });

  it("someone never called comes before someone called before", () => {
    const mom = person("mom", { everyDays: 2, lastDoneAt: now - 10 * DAY });
    const cousin = person("cousin", { everyDays: 30 });
    expect(creates(planToday(input({ people: [mom, cousin] })))[0]?.personId).toBe("cousin");
  });

  it("never picks a paused person", () => {
    const mom = person("mom", { paused: true });
    expect(planToday(input({ people: [mom] }))).toEqual({ actions: [], outcome: "no-people" });
  });

  it("does not pick the same person two days in a row", () => {
    const mom = person("mom", { everyDays: 1, lastDoneAt: at("20:00", "2026-11-15") });
    const friend = person("friend", { everyDays: 30, lastDoneAt: now - 5 * DAY });
    expect(creates(planToday(input({ people: [mom, friend] })))[0]?.personId).toBe("friend");
  });

  it("…unless they are the only person", () => {
    const mom = person("mom", { everyDays: 1, lastDoneAt: at("20:00", "2026-11-15") });
    expect(creates(planToday(input({ people: [mom] })))[0]?.personId).toBe("mom");
  });

  it("does not pick someone who already has a call today", () => {
    const settings = { ...defaultSettings(MON), callsPerDay: 2 };
    const todayCalls: PlannerCall[] = [
      { id: "x", personId: "mom", start: at("19:30"), end: at("19:45"), placedStart: at("19:30"), status: "scheduled" },
    ];
    const people = [person("mom", { prioritized: true }), person("friend")];
    expect(creates(planToday(input({ people, settings, todayCalls })))[0]?.personId).toBe("friend");
  });
});

describe("Conflict check (hourly, after the morning plan)", () => {
  const call: PlannerCall = {
    id: "c1",
    personId: "mom",
    start: at("19:30"),
    end: at("19:45"),
    placedStart: at("19:30"),
    status: "scheduled",
  };
  const later = at("14:00");

  it("moves the call when a new meeting overlaps it", () => {
    const busy = [{ start: at("19:00"), end: at("20:00") }];
    const result = checkConflicts(input({ now: later, busy, todayCalls: [call] }));
    expect(result.actions).toEqual([{ type: "move", callId: "c1", personId: "mom", start: at("20:15"), end: at("20:30") }]);
  });

  it("removes the call if there is no other free slot today", () => {
    const busy = [{ start: at("19:00"), end: at("22:00") }];
    expect(checkConflicts(input({ now: later, busy, todayCalls: [call] })).actions).toEqual([
      { type: "remove", callId: "c1", personId: "mom" },
    ]);
  });

  it("leaves alone a call that I moved myself", () => {
    const moved = { ...call, start: at("21:00"), end: at("21:15") };
    const busy = [{ start: at("21:00"), end: at("21:30") }];
    expect(checkConflicts(input({ now: later, busy, todayCalls: [moved] })).actions).toEqual([]);
  });

  it("leaves alone calls that are done, skipped or already started", () => {
    const busy = [{ start: at("19:00"), end: at("20:00") }];
    const done = { ...call, status: "done" as const };
    const skipped = { ...call, id: "c2", status: "skipped" as const };
    expect(checkConflicts(input({ now: later, busy, todayCalls: [done, skipped] })).actions).toEqual([]);
    expect(checkConflicts(input({ now: at("19:35"), busy, todayCalls: [call] })).actions).toEqual([]);
  });

  it("Rule 4: only ever points at touchbase's own calls", () => {
    const busy = [{ start: at("19:00"), end: at("22:00") }];
    const ids = new Set(["c1"]);
    for (const a of checkConflicts(input({ now: later, busy, todayCalls: [call] })).actions) {
      expect(a.type).not.toBe("create");
      if (a.type !== "create") expect(ids.has(a.callId)).toBe(true);
    }
  });

  it("changes nothing when there is no clash", () => {
    expect(checkConflicts(input({ now: later, todayCalls: [call] }))).toEqual({ actions: [], outcome: "unchanged" });
  });
});
