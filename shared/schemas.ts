// Shared input rules for the server and the React app.
// The server ALWAYS validates with these. The browser uses the same rules only
// to show friendly errors early — it is never trusted on its own.
import { z } from "zod";
import { isValidPhoneNumber } from "libphonenumber-js";

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const RELATIONS = ["parent", "sibling", "grandparent", "relative", "friend", "partner", "other"] as const;
export type Relation = (typeof RELATIONS)[number];

export const NUDGES = ["whatsapp", "sms", "none"] as const;
export type Nudge = (typeof NUDGES)[number];

export const CALL_STATUSES = ["scheduled", "done", "skipped"] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

/** "19:30" style time of day (24 hour clock). */
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM, like 19:30");

/** A time range inside ONE day. Ranges that cross midnight are not allowed on purpose:
 *  it keeps the "today only" rule simple and easy to test. */
export const timeRange = z
  .object({ start: hhmm, end: hhmm })
  .refine((r) => r.start < r.end, { message: "End time must be after start time" });
export type TimeRange = z.infer<typeof timeRange>;

/** "2026-11-16" style calendar date. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "Not a real date");

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const timezone = z.string().min(1).max(64).refine(isValidTimezone, "Unknown timezone");

const windowList = z.array(timeRange).max(4);

export const settingsSchema = z
  .object({
    timezone,
    checkCalendarIds: z.array(z.string().min(1).max(256)).min(1).max(20),
    targetCalendarId: z.string().min(1).max(256),
    callMinutes: z.union([z.literal(10), z.literal(15), z.literal(20)]),
    bufferMinutes: z.number().int().min(0).max(60),
    callsPerDay: z.number().int().min(1).max(3),
    windows: z.object({
      mon: windowList,
      tue: windowList,
      wed: windowList,
      thu: windowList,
      fri: windowList,
      sat: windowList,
      sun: windowList,
    }),
    activeDays: z.array(z.enum(WEEKDAYS)).max(7),
    activeFrom: isoDate,
    activeTo: isoDate,
    paused: z.boolean(),
    pausedUntil: isoDate.nullable(),
    runTime: hhmm.refine((t) => t >= "05:00" && t <= "12:00", "Pick a morning time between 05:00 and 12:00"),
    reminderMinutes: z.array(z.number().int().min(0).max(240)).max(3),
    aiEnabled: z.boolean(),
  })
  .refine((s) => s.activeFrom <= s.activeTo, { message: "Start date must be on or before end date", path: ["activeTo"] })
  .refine((s) => new Set(s.activeDays).size === s.activeDays.length, { message: "Days repeat", path: ["activeDays"] });
export type Settings = z.infer<typeof settingsSchema>;

export const pauseSchema = z.object({
  paused: z.boolean(),
  pausedUntil: isoDate.nullable(),
  /** When pausing: also remove today's call if it hasn't started yet. */
  removeTodayCall: z.boolean(),
});
export type PauseInput = z.infer<typeof pauseSchema>;

export const personSchema = z.object({
  name: z.string().trim().min(1, "Name is needed").max(60),
  relation: z.enum(RELATIONS),
  phone: z
    .string()
    .trim()
    .max(32)
    .refine((p) => isValidPhoneNumber(p), "Enter the full number with country code, like +91 98765 43210"),
  everyDays: z.number().int().min(1).max(90),
  timezone,
  /** The other person's free hours in THEIR timezone. Empty list = any time. */
  available: z.array(timeRange).max(4),
  nudge: z.enum(NUDGES),
  notes: z.string().max(1000),
  paused: z.boolean(),
  allowAi: z.boolean(),
});
export type PersonInput = z.infer<typeof personSchema>;

export const callUpdateSchema = z
  .object({
    status: z.enum(["done", "skipped"]).optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine((u) => u.status !== undefined || u.notes !== undefined, "Nothing to update");
export type CallUpdate = z.infer<typeof callUpdateSchema>;

/** Settings a brand new user starts with. The active period runs for 90 days from sign-up. */
export function defaultSettings(todayIso: string): Settings {
  const end = new Date(`${todayIso}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 90);
  const weekday: TimeRange[] = [{ start: "19:30", end: "22:00" }];
  const weekend: TimeRange[] = [
    { start: "11:00", end: "13:00" },
    { start: "17:00", end: "21:30" },
  ];
  return {
    timezone: "Asia/Kolkata",
    checkCalendarIds: ["primary"],
    targetCalendarId: "primary",
    callMinutes: 15,
    bufferMinutes: 10,
    callsPerDay: 1,
    windows: { mon: weekday, tue: weekday, wed: weekday, thu: weekday, fri: weekday, sat: weekend, sun: weekend },
    activeDays: [...WEEKDAYS],
    activeFrom: todayIso,
    activeTo: end.toISOString().slice(0, 10),
    paused: false,
    pausedUntil: null,
    runTime: "11:00",
    reminderMinutes: [60, 5],
    aiEnabled: true,
  };
}
