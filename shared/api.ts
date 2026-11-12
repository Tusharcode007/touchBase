// The shapes the server sends to the React app. Shared so both sides agree.
import type { CallStatus, Nudge, Relation, Settings, TimeRange } from "./schemas.js";

export type DayStatus = "active" | "paused" | "before-period" | "after-period" | "inactive-day";

export interface MeResponse {
  email: string;
  name: string;
  demo: boolean;
  csrfToken: string;
  aiAvailable: boolean;
}

export interface PersonDTO {
  id: string;
  name: string;
  relation: Relation;
  phone: string;
  everyDays: number;
  timezone: string;
  available: TimeRange[];
  nudge: Nudge;
  notes: string;
  paused: boolean;
  allowAi: boolean;
  prioritized: boolean;
}

export type OverdueBadge = "on-track" | "due" | "overdue" | "never";

export interface OverviewRow {
  id: string;
  name: string;
  relation: Relation;
  everyDays: number;
  paused: boolean;
  prioritized: boolean;
  lastCallAt: string | null;
  daysSince: number | null;
  badge: OverdueBadge;
}

export interface CallDTO {
  id: string;
  personId: string;
  personName: string;
  date: string;
  start: string;
  end: string;
  status: CallStatus;
  notes: string;
}

export interface TodayCallDTO extends CallDTO {
  links: { call: string; whatsapp: string | null; sms: string | null } | null;
  nudge: Nudge | null;
}

export interface TodayResponse {
  date: string;
  status: DayStatus;
  /** What happened at the last morning plan (e.g. "scheduled", "no-slot"), or null if not run today. */
  lastOutcome: string | null;
  ranToday: boolean;
  runTime: string;
  calls: TodayCallDTO[];
  settings: Pick<Settings, "paused" | "pausedUntil" | "activeFrom" | "activeTo">;
}

export interface CalendarInfo {
  id: string;
  name: string;
  primary: boolean;
  canWrite: boolean;
}

export interface RunResult {
  status: DayStatus;
  outcome: string | null;
  created: number;
}
