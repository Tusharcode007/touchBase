// The Google busy-time filter and the AI fallback (no network needed).
import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { busyFromEvents } from "../src/calendar/google.js";
import { createTopicService } from "../src/ai/talkingPoints.js";
import { createLogger } from "../src/lib/logger.js";

const TZ = "Asia/Kolkata";
const timed = (start: string, end: string) => ({
  start: { dateTime: `2026-11-16T${start}:00+05:30` },
  end: { dateTime: `2026-11-16T${end}:00+05:30` },
});

describe("which Google events count as busy", () => {
  it("counts normal events and all-day busy events", () => {
    const busy = busyFromEvents(
      [timed("09:00", "10:00"), { start: { date: "2026-11-16" }, end: { date: "2026-11-17" } }],
      TZ,
    );
    expect(busy).toHaveLength(2);
    expect(busy[1]).toEqual({
      start: DateTime.fromISO("2026-11-16T00:00", { zone: TZ }).toMillis(),
      end: DateTime.fromISO("2026-11-17T00:00", { zone: TZ }).toMillis(),
    });
  });

  it("ignores events marked free, cancelled, declined, and touchbase's own calls", () => {
    const busy = busyFromEvents(
      [
        { ...timed("09:00", "10:00"), transparency: "transparent" },
        { ...timed("10:00", "11:00"), status: "cancelled" },
        { ...timed("11:00", "12:00"), attendees: [{ self: true, responseStatus: "declined" }] },
        { ...timed("19:30", "19:45"), extendedProperties: { private: { touchbase: "1" } } },
        { ...timed("12:00", "13:00"), attendees: [{ self: true, responseStatus: "accepted" }] },
      ],
      TZ,
    );
    expect(busy).toEqual([{ start: Date.parse("2026-11-16T12:00:00+05:30"), end: Date.parse("2026-11-16T13:00:00+05:30") }]);
  });
});

describe("talking points without an API key", () => {
  it("uses the built-in list and never calls the network", async () => {
    const service = createTopicService(null, createLogger("silent"));
    const result = await service.pick({
      personId: "p1",
      name: "Mom",
      relation: "parent",
      notes: "",
      lastNotes: null,
      date: "2026-11-16",
      useAi: true,
    });
    expect(result.source).toBe("offline");
    expect(result.points).toHaveLength(3);
  });
});
