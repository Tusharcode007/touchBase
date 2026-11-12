// What touchbase needs from a calendar. Two versions exist:
//   - google.ts: the real Google Calendar
//   - fake.ts:   an in-memory calendar for demo mode and tests
// The daily job only talks to this interface, so it never knows which one it uses.
import type { CalendarInfo } from "../../../shared/api.js";
import type { Interval } from "../core/intervals.js";

/** An event created by touchbase (tagged with a private "touchbase" property). */
export interface OwnEvent {
  eventId: string;
  callId: string | null;
  start: number;
  end: number;
  description: string | null;
}

export interface NewEvent {
  calendarId: string;
  callId: string;
  title: string;
  description: string;
  start: number;
  end: number;
  timezone: string;
  reminderMinutes: number[];
}

export interface CalendarProvider {
  listCalendars(): Promise<CalendarInfo[]>;
  /** Busy time in [from, to). Leaves out: touchbase's own events, events marked "free",
   *  cancelled events, and events I declined. */
  busy(calendarIds: string[], from: number, to: number, timezone: string): Promise<Interval[]>;
  /** One of touchbase's events, or null if it was deleted or cancelled. */
  getEvent(calendarId: string, eventId: string): Promise<OwnEvent | null>;
  /** touchbase's events in [from, to). Used to recover from a crash mid-create. */
  listOwnEvents(calendarId: string, from: number, to: number): Promise<OwnEvent[]>;
  createEvent(event: NewEvent): Promise<string>;
  moveEvent(calendarId: string, eventId: string, event: NewEvent): Promise<void>;
  /** Deleting an event that is already gone is not an error. */
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}

/** Thrown when Google says the saved login no longer works (revoked or expired). */
export class CalendarAuthError extends Error {}

/** The private tags touchbase puts on every event it creates (rule 4: only touch our own). */
export const TAG_KEY = "touchbase";
export const TAG_VALUE = "1";
