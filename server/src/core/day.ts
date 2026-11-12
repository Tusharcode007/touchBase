// Turning "today" and "19:30-22:00" into real moments in time, in the right timezone.
// All timezone maths goes through Luxon so daylight-saving changes are handled for us.
import { DateTime } from "luxon";
import { WEEKDAYS, type TimeRange, type Weekday } from "../../../shared/schemas.js";
import { intersect, normalize, type Interval } from "./intervals.js";

export const MINUTE = 60_000;
export const DAY_MS = 24 * 60 * MINUTE;

export interface DayInfo {
  /** Local calendar date, like "2026-11-16". */
  date: string;
  weekday: Weekday;
  /** Start and end of the local day, as epoch ms. */
  start: number;
  end: number;
  /** Local time right now, like "11:05". */
  time: string;
}

export function dayInfo(now: number, tz: string): DayInfo {
  const local = DateTime.fromMillis(now, { zone: tz });
  const start = local.startOf("day");
  const end = start.plus({ days: 1 }).startOf("day");
  return {
    date: start.toISODate() ?? "",
    weekday: WEEKDAYS[local.weekday - 1] ?? "mon",
    start: start.toMillis(),
    end: end.toMillis(),
    time: local.toFormat("HH:mm"),
  };
}

/** The local date of a moment, like "2026-11-15". */
export function localDate(ms: number, tz: string): string {
  return DateTime.fromMillis(ms, { zone: tz }).toISODate() ?? "";
}

/** Yesterday's local date compared with `now`. */
export function yesterday(now: number, tz: string): string {
  return DateTime.fromMillis(now, { zone: tz }).minus({ days: 1 }).toISODate() ?? "";
}

/** Convert "HH:MM-HH:MM" ranges on one local date into real intervals. */
export function rangesOnDate(date: string, ranges: TimeRange[], tz: string): Interval[] {
  return normalize(
    ranges.map((r) => ({
      start: DateTime.fromISO(`${date}T${r.start}`, { zone: tz }).toMillis(),
      end: DateTime.fromISO(`${date}T${r.end}`, { zone: tz }).toMillis(),
    })),
  );
}

/**
 * When is the OTHER person free during my day?
 * Their hours are in their own timezone, so their "8 am - 10 pm" can fall on two of
 * their local dates during one of my days. We check yesterday, today and tomorrow
 * (their time) and keep only what lands inside my day.
 * An empty list means "any time".
 */
export function availabilityWithin(day: Interval, ranges: TimeRange[], tz: string): Interval[] {
  if (ranges.length === 0) return [day];
  const first = DateTime.fromMillis(day.start, { zone: tz }).startOf("day").minus({ days: 1 });
  const all: Interval[] = [];
  for (let i = 0; i < 3; i++) {
    const date = first.plus({ days: i }).toISODate() ?? "";
    all.push(...rangesOnDate(date, ranges, tz));
  }
  return intersect(all, [day]);
}
