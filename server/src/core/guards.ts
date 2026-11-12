// "Should touchbase do anything today?" — the on/off switches from the settings page.
import type { Settings } from "../../../shared/schemas.js";
import { dayInfo } from "./day.js";

export type GuardStatus = "active" | "paused" | "before-period" | "after-period" | "inactive-day";

type GuardSettings = Pick<Settings, "timezone" | "paused" | "pausedUntil" | "activeFrom" | "activeTo" | "activeDays">;

/**
 * Paused means: the pause switch is on AND (there is no end date OR today is before it).
 * "Pause until 20 Nov" means calls start again ON 20 Nov.
 */
export function isPaused(s: Pick<Settings, "paused" | "pausedUntil">, today: string): boolean {
  return s.paused && (s.pausedUntil === null || today < s.pausedUntil);
}

/** Rule 5: run only when not paused, inside the active period, and on an active weekday. */
export function checkGuards(now: number, s: GuardSettings): GuardStatus {
  const { date, weekday } = dayInfo(now, s.timezone);
  // ISO dates ("2026-11-16") compare correctly as plain strings.
  if (isPaused(s, date)) return "paused";
  if (date < s.activeFrom) return "before-period";
  if (date > s.activeTo) return "after-period";
  if (!s.activeDays.includes(weekday)) return "inactive-day";
  return "active";
}

/** Rule 6: the morning plan only runs once it is past the chosen run time (local). */
export function isPastRunTime(now: number, s: Pick<Settings, "timezone" | "runTime">): boolean {
  return dayInfo(now, s.timezone).time >= s.runTime;
}
