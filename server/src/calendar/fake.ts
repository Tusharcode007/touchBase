// An in-memory calendar that behaves like a student's Google Calendar.
// Used by demo mode (so you can try the app with no Google account) and by tests.
import { DateTime } from "luxon";
import type { CalendarInfo } from "../../../shared/api.js";
import { normalize, overlaps, type Interval } from "../core/intervals.js";
import type { CalendarProvider, NewEvent, OwnEvent } from "./provider.js";

interface StoredEvent extends OwnEvent {
  calendarId: string;
  title: string;
}

type Block = [string, string]; // ["09:00", "13:00"]

/** A pretend weekly timetable: classes, gym, a club meeting. */
const WEEKLY: Record<number, Block[]> = {
  1: [["09:00", "13:00"], ["14:00", "17:00"], ["18:30", "19:30"]],
  2: [["09:00", "13:00"], ["14:00", "16:00"], ["20:00", "21:00"]],
  3: [["09:00", "13:00"], ["14:00", "17:00"], ["18:30", "19:30"]],
  4: [["10:00", "13:00"], ["14:00", "17:00"]],
  5: [["09:00", "12:00"], ["18:30", "19:30"]],
  6: [["15:00", "17:30"]],
  7: [["19:00", "20:00"]],
};

export interface FakeCalendar extends CalendarProvider {
  /** All touchbase events (for tests and demo inspection). */
  events: Map<string, StoredEvent>;
  /** Extra busy blocks (tests use this to add a "new meeting"). */
  extraBusy: Interval[];
  /** Pretend the user deleted or moved an event in Google Calendar. */
  userDeletes(eventId: string): void;
  userMoves(eventId: string, start: number, end: number): void;
  userWritesNotes(eventId: string, notes: string): void;
}

export function createFakeCalendar(options: { timetable?: boolean } = {}): FakeCalendar {
  const events = new Map<string, StoredEvent>();
  const extraBusy: Interval[] = [];
  let nextId = 1;

  const timetable = (from: number, to: number, timezone: string): Interval[] => {
    if (options.timetable === false) return [];
    const out: Interval[] = [];
    let day = DateTime.fromMillis(from, { zone: timezone }).startOf("day");
    while (day.toMillis() < to) {
      for (const [start, end] of WEEKLY[day.weekday] ?? []) {
        const date = day.toISODate();
        out.push({
          start: DateTime.fromISO(`${date}T${start}`, { zone: timezone }).toMillis(),
          end: DateTime.fromISO(`${date}T${end}`, { zone: timezone }).toMillis(),
        });
      }
      day = day.plus({ days: 1 });
    }
    return out;
  };

  return {
    events,
    extraBusy,

    async listCalendars(): Promise<CalendarInfo[]> {
      return [
        { id: "primary", name: "My calendar", primary: true, canWrite: true },
        { id: "college", name: "College timetable", primary: false, canWrite: false },
      ];
    },

    async busy(_calendarIds, from, to, timezone) {
      const window = { start: from, end: to };
      return normalize([...timetable(from, to, timezone), ...extraBusy].filter((b) => overlaps(b, window)));
    },

    async getEvent(_calendarId, eventId) {
      const e = events.get(eventId);
      return e ? { ...e } : null;
    },

    async listOwnEvents(_calendarId, from, to) {
      return [...events.values()].filter((e) => e.start < to && e.end > from).map((e) => ({ ...e }));
    },

    async createEvent(event: NewEvent) {
      const eventId = `fake-${nextId++}`;
      events.set(eventId, {
        eventId,
        calendarId: event.calendarId,
        callId: event.callId,
        title: event.title,
        start: event.start,
        end: event.end,
        description: event.description,
      });
      return eventId;
    },

    async moveEvent(_calendarId, eventId, event) {
      const e = events.get(eventId);
      if (e) Object.assign(e, { start: event.start, end: event.end, description: event.description, title: event.title });
    },

    async deleteEvent(_calendarId, eventId) {
      events.delete(eventId);
    },

    userDeletes(eventId) {
      events.delete(eventId);
    },
    userMoves(eventId, start, end) {
      const e = events.get(eventId);
      if (e) Object.assign(e, { start, end });
    },
    userWritesNotes(eventId, notes) {
      const e = events.get(eventId);
      if (e) e.description = `${e.description ?? ""}<br>${notes}`;
    },
  };
}
