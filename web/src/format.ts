// Small display helpers. Times are shown in MY timezone from settings.

export function timeOf(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(new Date(iso));
}

export function dateLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

export function daysAgo(days: number | null): string {
  if (days === null) return "Never called with touchbase";
  if (days === 0) return "Called today";
  if (days === 1) return "Called yesterday";
  return `Called ${days} days ago`;
}

/** Add days to "YYYY-MM-DD" and return "YYYY-MM-DD". */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Add calendar months to "YYYY-MM-DD" (31 Jan + 1 month → 28/29 Feb). */
export function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

export function todayIso(timeZone: string): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

export const RELATION_LABEL: Record<string, string> = {
  parent: "Parent",
  sibling: "Brother / sister",
  grandparent: "Grandparent",
  relative: "Relative",
  friend: "Friend",
  partner: "Partner",
  other: "Other",
};

export const WEEKDAY_LABEL: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

export function allTimezones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  return intl.supportedValuesOf?.("timeZone") ?? ["Asia/Kolkata", "UTC", "America/New_York", "America/Los_Angeles", "Europe/London"];
}
