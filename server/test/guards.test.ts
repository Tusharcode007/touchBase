// Rule 5 (when it runs) and Rule 6 (morning only).
import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { defaultSettings, type Settings } from "../../shared/schemas.js";
import { checkGuards, isPastRunTime } from "../src/core/guards.js";

const TZ = "Asia/Kolkata";
const at = (iso: string) => DateTime.fromISO(iso, { zone: TZ }).toMillis();
const monday = at("2026-11-16T09:00");
const base = (over: Partial<Settings> = {}): Settings => ({ ...defaultSettings("2026-11-01"), ...over });

describe("Rule 5: when touchbase runs", () => {
  it("is active on a normal day", () => {
    expect(checkGuards(monday, base())).toBe("active");
  });

  it("does nothing while paused", () => {
    expect(checkGuards(monday, base({ paused: true }))).toBe("paused");
  });

  it("'pause until' keeps it paused before that date and resumes on that date", () => {
    expect(checkGuards(monday, base({ paused: true, pausedUntil: "2026-11-17" }))).toBe("paused");
    expect(checkGuards(monday, base({ paused: true, pausedUntil: "2026-11-16" }))).toBe("active");
    expect(checkGuards(monday, base({ paused: true, pausedUntil: "2026-11-01" }))).toBe("active");
  });

  it("only works inside the active period (both ends included)", () => {
    expect(checkGuards(monday, base({ activeFrom: "2026-11-17", activeTo: "2026-12-31" }))).toBe("before-period");
    expect(checkGuards(monday, base({ activeFrom: "2026-10-01", activeTo: "2026-11-15" }))).toBe("after-period");
    expect(checkGuards(monday, base({ activeFrom: "2026-11-16", activeTo: "2026-11-16" }))).toBe("active");
  });

  it("only works on the selected weekdays", () => {
    expect(checkGuards(monday, base({ activeDays: ["sat", "sun"] }))).toBe("inactive-day");
    expect(checkGuards(monday, base({ activeDays: ["mon"] }))).toBe("active");
  });

  it("uses MY timezone to decide what 'today' is", () => {
    // 20:00 UTC on Sunday is already 01:30 Monday in India.
    const sundayUtc = DateTime.fromISO("2026-11-15T20:00", { zone: "UTC" }).toMillis();
    expect(checkGuards(sundayUtc, base({ activeDays: ["mon"] }))).toBe("active");
  });
});

describe("Rule 6: morning run time", () => {
  it("is not time yet before the run time, and is after it", () => {
    const s = base({ runTime: "11:00" });
    expect(isPastRunTime(at("2026-11-16T10:59"), s)).toBe(false);
    expect(isPastRunTime(at("2026-11-16T11:00"), s)).toBe(true);
    expect(isPastRunTime(at("2026-11-16T18:00"), s)).toBe(true);
  });
});
