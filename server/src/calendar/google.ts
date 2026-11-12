// The real Google Calendar.
//
// Privacy: when reading busy time we ask Google for ONLY the fields we need
// (start, end, free/busy, status, my RSVP, our tag). Titles, descriptions and
// guest lists of other events are never even downloaded.
import { calendar_v3, calendar as googleCalendar } from "@googleapis/calendar";
import type { OAuth2Client } from "google-auth-library";
import { DateTime } from "luxon";
import type { CalendarInfo } from "../../../shared/api.js";
import { normalize, type Interval } from "../core/intervals.js";
import { CalendarAuthError, TAG_KEY, TAG_VALUE, type CalendarProvider, type NewEvent, type OwnEvent } from "./provider.js";

const BUSY_FIELDS =
  "nextPageToken,items(start,end,transparency,status,attendees(self,responseStatus),extendedProperties/private)";

function statusOf(err: unknown): number | undefined {
  const e = err as { code?: number | string; status?: number; response?: { status?: number } };
  return e.response?.status ?? e.status ?? (typeof e.code === "number" ? e.code : undefined);
}

/** Turn Google's "the saved login is no good" into one clear error type. */
function rethrow(err: unknown): never {
  const message = (err as { message?: string }).message ?? "";
  if (message.includes("invalid_grant") || statusOf(err) === 401) throw new CalendarAuthError("Google sign-in expired");
  throw err;
}

function eventTimes(e: calendar_v3.Schema$Event, timezone: string): Interval | null {
  if (e.start?.dateTime && e.end?.dateTime) {
    return { start: Date.parse(e.start.dateTime), end: Date.parse(e.end.dateTime) };
  }
  // All-day event: busy from the start of its first day to the start of the day after it ends.
  if (e.start?.date && e.end?.date) {
    return {
      start: DateTime.fromISO(e.start.date, { zone: timezone }).toMillis(),
      end: DateTime.fromISO(e.end.date, { zone: timezone }).toMillis(),
    };
  }
  return null;
}

/** Which events make me busy? Pure function, so it is unit-tested. */
export function busyFromEvents(items: calendar_v3.Schema$Event[], timezone: string): Interval[] {
  const out: Interval[] = [];
  for (const e of items) {
    if (e.status === "cancelled") continue;
    if (e.transparency === "transparent") continue; // marked "free"
    if (e.attendees?.some((a) => a.self && a.responseStatus === "declined")) continue;
    if (e.extendedProperties?.private?.[TAG_KEY] === TAG_VALUE) continue; // our own call
    const times = eventTimes(e, timezone);
    if (times) out.push(times);
  }
  return out;
}

function toOwnEvent(e: calendar_v3.Schema$Event): OwnEvent | null {
  if (!e.id || e.status === "cancelled") return null;
  const times = eventTimes(e, "UTC");
  if (!times) return null;
  return {
    eventId: e.id,
    callId: e.extendedProperties?.private?.tbCallId ?? null,
    start: times.start,
    end: times.end,
    description: e.description ?? null,
  };
}

function eventBody(event: NewEvent): calendar_v3.Schema$Event {
  return {
    summary: event.title,
    description: event.description,
    start: { dateTime: new Date(event.start).toISOString(), timeZone: event.timezone },
    end: { dateTime: new Date(event.end).toISOString(), timeZone: event.timezone },
    transparency: "opaque",
    reminders: { useDefault: false, overrides: event.reminderMinutes.map((minutes) => ({ method: "popup", minutes })) },
    extendedProperties: { private: { [TAG_KEY]: TAG_VALUE, tbCallId: event.callId } },
  };
}

export function googleCalendarProvider(auth: OAuth2Client): CalendarProvider {
  const api = googleCalendar({ version: "v3", auth });

  async function isOwnEvent(calendarId: string, eventId: string): Promise<boolean> {
    try {
      const res = await api.events.get({ calendarId, eventId, fields: "status,extendedProperties/private" });
      return res.data.status !== "cancelled" && res.data.extendedProperties?.private?.[TAG_KEY] === TAG_VALUE;
    } catch (err) {
      const status = statusOf(err);
      if (status === 404 || status === 410) return false;
      rethrow(err);
    }
  }

  return {
    async listCalendars(): Promise<CalendarInfo[]> {
      try {
        const res = await api.calendarList.list({ minAccessRole: "reader", maxResults: 100 });
        return (res.data.items ?? []).map((c) => ({
          id: c.id ?? "",
          name: c.summaryOverride ?? c.summary ?? c.id ?? "",
          primary: c.primary === true,
          // Our scope only lets us write to calendars we own.
          canWrite: c.accessRole === "owner",
        }));
      } catch (err) {
        rethrow(err);
      }
    },

    async busy(calendarIds, from, to, timezone) {
      const out: Interval[] = [];
      for (const calendarId of calendarIds) {
        let pageToken: string | undefined;
        do {
          let res;
          try {
            res = await api.events.list({
              calendarId,
              timeMin: new Date(from).toISOString(),
              timeMax: new Date(to).toISOString(),
              singleEvents: true,
              maxResults: 250,
              pageToken,
              fields: BUSY_FIELDS,
            });
          } catch (err) {
            if (statusOf(err) === 404) break; // calendar removed: skip it
            rethrow(err);
          }
          out.push(...busyFromEvents(res.data.items ?? [], timezone));
          pageToken = res.data.nextPageToken ?? undefined;
        } while (pageToken);
      }
      return normalize(out);
    },

    async getEvent(calendarId, eventId) {
      try {
        const res = await api.events.get({ calendarId, eventId });
        if (res.data.extendedProperties?.private?.[TAG_KEY] !== TAG_VALUE) return null; // never trust a non-touchbase event
        return toOwnEvent(res.data);
      } catch (err) {
        const status = statusOf(err);
        if (status === 404 || status === 410) return null;
        rethrow(err);
      }
    },

    async listOwnEvents(calendarId, from, to) {
      try {
        const res = await api.events.list({
          calendarId,
          timeMin: new Date(from).toISOString(),
          timeMax: new Date(to).toISOString(),
          singleEvents: true,
          privateExtendedProperty: [`${TAG_KEY}=${TAG_VALUE}`],
          maxResults: 50,
        });
        return (res.data.items ?? []).map(toOwnEvent).filter((e): e is OwnEvent => e !== null);
      } catch (err) {
        rethrow(err);
      }
    },

    async createEvent(event) {
      try {
        const res = await api.events.insert({ calendarId: event.calendarId, requestBody: eventBody(event) });
        if (!res.data.id) throw new Error("Google did not return an event id");
        return res.data.id;
      } catch (err) {
        rethrow(err);
      }
    },

    async moveEvent(calendarId, eventId, event) {
      // Rule 4, double-checked: never change an event that doesn't carry our tag,
      // even if the database says otherwise.
      if (!(await isOwnEvent(calendarId, eventId))) return;
      try {
        await api.events.patch({ calendarId, eventId, requestBody: eventBody(event) });
      } catch (err) {
        rethrow(err);
      }
    },

    async deleteEvent(calendarId, eventId) {
      if (!(await isOwnEvent(calendarId, eventId))) return; // gone already, or not ours
      try {
        await api.events.delete({ calendarId, eventId });
      } catch (err) {
        const status = statusOf(err);
        if (status === 404 || status === 410) return;
        rethrow(err);
      }
    },
  };
}
