import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { callLinks, eventDescription, eventTitle, extractNotes, nudgeMessage } from "../src/core/eventText.js";
import { offlineTopics } from "../src/core/offlineTopics.js";
import { intersect, normalize, subtract } from "../src/core/intervals.js";

const start = DateTime.fromISO("2026-11-16T21:30", { zone: "Asia/Kolkata" }).toMillis();

describe("event text", () => {
  it("has a clear title", () => {
    expect(eventTitle("Mom")).toBe("📞 Call Mom");
  });

  it("writes the heads-up message in THEIR timezone", () => {
    expect(nudgeMessage("Rahul", start, "America/Los_Angeles")).toBe("Hey Rahul! Free for a quick call around 8:00 am? 🙂");
    expect(nudgeMessage("Mom", start, "Asia/Kolkata")).toContain("9:30 pm");
  });

  it("builds one-tap call, WhatsApp and SMS links", () => {
    const links = callLinks("+919876543210", "Hi Mom!");
    expect(links.call).toBe("tel:+919876543210");
    expect(links.whatsapp).toBe("https://wa.me/919876543210?text=Hi%20Mom!");
    expect(links.sms).toBe("sms:+919876543210?&body=Hi%20Mom!");
  });

  it("escapes HTML in names, notes and talking points", () => {
    const html = eventDescription({
      name: "<script>x</script>",
      phoneE164: "+919876543210",
      nudge: "whatsapp",
      start,
      theirTimezone: "Asia/Kolkata",
      callMinutes: 15,
      talkingPoints: ["<img src=x onerror=alert(1)>"],
      lastNotes: "a & b",
      daysSinceLast: 3,
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a &amp; b");
    expect(html).toContain("Last talked: 3 days ago.");
  });

  it("leaves out heads-up links when the channel is 'none'", () => {
    const html = eventDescription({
      name: "Dad",
      phoneE164: "+919876543210",
      nudge: "none",
      start,
      theirTimezone: "Asia/Kolkata",
      callMinutes: 15,
      talkingPoints: [],
      lastNotes: null,
      daysSinceLast: null,
    });
    expect(html).toContain("tel:+919876543210");
    expect(html).not.toContain("wa.me");
    expect(html).not.toContain("sms:");
  });
});

describe("reading my notes back", () => {
  it("reads what I typed under the notes line (HTML version)", () => {
    const desc = "<b>Call</b><br>📝 Notes (write below this line after the call):<br>Dad is planning a Goa trip<br>Mom's knee is better";
    expect(extractNotes(desc)).toBe("Dad is planning a Goa trip Mom's knee is better");
  });

  it("reads plain text too", () => {
    expect(extractNotes("x\n📝 Notes (write below):\nExams next week")).toBe("Exams next week");
  });

  it("returns null when nothing was written", () => {
    expect(extractNotes("x<br>📝 Notes (write below this line after the call):<br>")).toBeNull();
    expect(extractNotes("no marker here")).toBeNull();
    expect(extractNotes(undefined)).toBeNull();
  });
});

describe("offline talking points", () => {
  it("gives 3 different points, the same ones for the same seed", () => {
    const a = offlineTopics("parent", "mom|2026-11-16");
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    expect(offlineTopics("parent", "mom|2026-11-16")).toEqual(a);
  });
});

describe("interval helpers", () => {
  it("merges, subtracts and intersects", () => {
    expect(normalize([{ start: 5, end: 8 }, { start: 1, end: 5 }])).toEqual([{ start: 1, end: 8 }]);
    expect(subtract([{ start: 0, end: 10 }], [{ start: 3, end: 5 }])).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 10 },
    ]);
    expect(intersect([{ start: 0, end: 10 }], [{ start: 8, end: 20 }])).toEqual([{ start: 8, end: 10 }]);
  });
});
