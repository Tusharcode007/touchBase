// The planner: the "brain" of touchbase.
//
// It is a PURE function: it gets everything it needs as input (the time now,
// settings, people, busy time, today's calls) and returns a list of actions
// (create / move / remove). It never talks to Google or the database. That is
// why every hard rule can be unit-tested without the internet.
//
// Hard rules enforced here:
//   1. Today only      — slots are only ever taken from today's call windows.
//   2. Calls-per-day   — every call already logged today counts toward the limit.
//   3. Idempotent      — running again after applying the actions creates nothing new.
//   4. Own events only — move/remove actions can only point at calls passed in.
import type { CallStatus, Settings, TimeRange } from "../../../shared/schemas.js";
import { availabilityWithin, dayInfo, DAY_MS, localDate, MINUTE, rangesOnDate, yesterday } from "./day.js";
import { intersect, normalize, overlaps, pad, subtract, type Interval } from "./intervals.js";

/** Calls never start sooner than this, so there is time to see the reminder. */
export const LEAD_MINUTES = 30;
/** Calls start on :00, :15, :30 or :45. (Every real timezone offset is a multiple
 *  of 15 minutes, so rounding epoch time to 15 minutes also rounds local time.) */
export const SLOT_STEP_MINUTES = 15;

export interface PlannerPerson {
  id: string;
  name: string;
  everyDays: number;
  timezone: string;
  available: TimeRange[];
  paused: boolean;
  /** End time of the last call marked done, or null if never called. */
  lastDoneAt: number | null;
  /** "Prioritise next" was pressed. */
  prioritized: boolean;
}

export interface PlannerCall {
  id: string;
  personId: string;
  start: number;
  end: number;
  /** Where touchbase originally put the event. If start !== placedStart, the user moved it. */
  placedStart: number;
  status: CallStatus;
}

export type PlannerSettings = Pick<Settings, "timezone" | "callMinutes" | "bufferMinutes" | "callsPerDay" | "windows">;

export interface PlanInput {
  now: number;
  settings: PlannerSettings;
  people: PlannerPerson[];
  /** My busy time today, from the calendars I chose. touchbase's own events are NOT in here. */
  busy: Interval[];
  /** Every touchbase call logged for today (any status). */
  todayCalls: PlannerCall[];
}

export type PlanAction =
  | { type: "create"; personId: string; start: number; end: number }
  | { type: "move"; callId: string; personId: string; start: number; end: number }
  | { type: "remove"; callId: string; personId: string };

export type PlanOutcome = "scheduled" | "limit-reached" | "no-slot" | "no-people" | "unchanged";

export interface PlanResult {
  actions: PlanAction[];
  outcome: PlanOutcome;
}

function ceilTo(ms: number, stepMs: number): number {
  return Math.ceil(ms / stepMs) * stepMs;
}

/** The first slot of `durationMs` inside the free time, starting on a 15-minute mark. */
export function firstSlot(free: Interval[], durationMs: number): Interval | null {
  for (const f of normalize(free)) {
    const start = ceilTo(f.start, SLOT_STEP_MINUTES * MINUTE);
    if (start + durationMs <= f.end) return { start, end: start + durationMs };
  }
  return null;
}

/**
 * My free time for calls today: inside today's windows, at least LEAD_MINUTES from now,
 * and away from busy events and other calls (with the buffer around them).
 */
export function freeTimeToday(input: PlanInput, extraBooked: Interval[] = [], ignoreCallId?: string): Interval[] {
  const { now, settings } = input;
  const day = dayInfo(now, settings.timezone);
  const windows = rangesOnDate(day.date, settings.windows[day.weekday], settings.timezone);
  const earliest = now + LEAD_MINUTES * MINUTE;
  const open = intersect(windows, [{ start: Math.max(day.start, earliest), end: day.end }]);

  const buffer = settings.bufferMinutes * MINUTE;
  // A skipped call (deleted event) does not block time any more.
  const otherCalls = input.todayCalls.filter((c) => c.id !== ignoreCallId && c.status !== "skipped");
  const blocked = [...pad(input.busy, buffer), ...pad(otherCalls, buffer), ...pad(extraBooked, buffer)];
  return subtract(open, blocked);
}

/** How "overdue" someone is: days since last call ÷ how often I want to call them. */
export function overdueScore(p: Pick<PlannerPerson, "lastDoneAt" | "everyDays">, now: number): number {
  if (p.lastDoneAt === null) return Number.POSITIVE_INFINITY;
  return (now - p.lastDoneAt) / DAY_MS / p.everyDays;
}

/** Who should I call first? Prioritised people, then most overdue, then the most frequent ones. */
export function rankPeople(people: PlannerPerson[], now: number): PlannerPerson[] {
  return [...people].sort((a, b) => {
    if (a.prioritized !== b.prioritized) return a.prioritized ? -1 : 1;
    const sa = overdueScore(a, now);
    const sb = overdueScore(b, now);
    if (sa !== sb) return sb - sa > 0 ? 1 : -1;
    if (a.everyDays !== b.everyDays) return a.everyDays - b.everyDays;
    return a.name.localeCompare(b.name);
  });
}

/** The morning plan: pick who to call today and when. */
export function planToday(input: PlanInput): PlanResult {
  const { now, settings } = input;
  const tz = settings.timezone;
  const durationMs = settings.callMinutes * MINUTE;

  // Rule 2: every call already logged today counts, even skipped ones. If you
  // deleted today's call, touchbase must not sneak another one in.
  let remaining = settings.callsPerDay - input.todayCalls.length;
  if (remaining <= 0) return { actions: [], outcome: "limit-reached" };

  const active = input.people.filter((p) => !p.paused);
  if (active.length === 0) return { actions: [], outcome: "no-people" };

  const alreadyToday = new Set(input.todayCalls.map((c) => c.personId));
  let candidates = active.filter((p) => !alreadyToday.has(p.id));

  // Not the same person two days in a row — unless they are the only person.
  if (active.length > 1) {
    const yday = yesterday(now, tz);
    candidates = candidates.filter((p) => p.lastDoneAt === null || localDate(p.lastDoneAt, tz) !== yday);
  }
  if (candidates.length === 0) return { actions: [], outcome: "no-people" };

  const day = dayInfo(now, tz);
  const booked: Interval[] = [];
  const actions: PlanAction[] = [];

  for (const person of rankPeople(candidates, now)) {
    if (remaining === 0) break;
    const theirTime = availabilityWithin({ start: day.start, end: day.end }, person.available, person.timezone);
    const free = intersect(freeTimeToday(input, booked), theirTime);
    const slot = firstSlot(free, durationMs);
    if (!slot) continue; // no time that suits both of us — try the next person
    actions.push({ type: "create", personId: person.id, start: slot.start, end: slot.end });
    booked.push(slot);
    remaining -= 1;
  }

  return { actions, outcome: actions.length > 0 ? "scheduled" : "no-slot" };
}

/**
 * The hourly check after the morning plan: if a new meeting now overlaps a call that
 * hasn't started, move the call to another free slot today, or remove it if there is none.
 * Calls the user moved by hand are left alone.
 */
export function checkConflicts(input: PlanInput): PlanResult {
  const { now, settings } = input;
  const day = dayInfo(now, settings.timezone);
  const actions: PlanAction[] = [];
  const movedTo: Interval[] = [];

  for (const call of input.todayCalls) {
    if (call.status !== "scheduled") continue;
    if (call.start <= now) continue; // already started or over
    if (call.start !== call.placedStart) continue; // the user moved it — respect that
    if (!input.busy.some((b) => overlaps(b, call))) continue;

    const person = input.people.find((p) => p.id === call.personId);
    const theirTime = person
      ? availabilityWithin({ start: day.start, end: day.end }, person.available, person.timezone)
      : [{ start: day.start, end: day.end }];
    const free = intersect(freeTimeToday(input, movedTo, call.id), theirTime);
    const slot = firstSlot(free, call.end - call.start);
    if (slot) {
      actions.push({ type: "move", callId: call.id, personId: call.personId, start: slot.start, end: slot.end });
      movedTo.push(slot);
    } else {
      actions.push({ type: "remove", callId: call.id, personId: call.personId });
    }
  }
  return { actions, outcome: actions.length > 0 ? "scheduled" : "unchanged" };
}
