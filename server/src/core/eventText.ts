// Builds the text that goes inside each calendar event, and reads my notes back out.
// Pure functions only — easy to test.
import { DateTime } from "luxon";
import type { Nudge } from "../../../shared/schemas.js";

/** Marker line. Whatever I type below it after the call is saved as notes. */
export const NOTES_MARKER = "📝 Notes";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function eventTitle(name: string): string {
  return `📞 Call ${name}`;
}

/** "8:15 pm" in the OTHER person's timezone. */
export function theirLocalTime(start: number, theirTimezone: string): string {
  return DateTime.fromMillis(start, { zone: theirTimezone }).toFormat("h:mm a").toLowerCase();
}

export function nudgeMessage(name: string, start: number, theirTimezone: string): string {
  return `Hey ${name}! Free for a quick call around ${theirLocalTime(start, theirTimezone)}? 🙂`;
}

export interface CallLinks {
  call: string;
  whatsapp: string;
  sms: string;
}

/** One-tap links. The phone number must already be in E.164 form, like +919876543210. */
export function callLinks(phoneE164: string, message: string): CallLinks {
  const digits = phoneE164.replace(/\D/g, "");
  const text = encodeURIComponent(message);
  return {
    call: `tel:${phoneE164}`,
    whatsapp: `https://wa.me/${digits}?text=${text}`,
    // "?&body=" works on both iPhone and Android.
    sms: `sms:${phoneE164}?&body=${text}`,
  };
}

export interface EventTextInput {
  name: string;
  phoneE164: string;
  nudge: Nudge;
  start: number;
  theirTimezone: string;
  callMinutes: number;
  talkingPoints: string[];
  lastNotes: string | null;
  daysSinceLast: number | null;
}

/** The event description (Google Calendar shows simple HTML: links, bold, lists). */
export function eventDescription(input: EventTextInput): string {
  const name = escapeHtml(input.name);
  const links = callLinks(input.phoneE164, nudgeMessage(input.name, input.start, input.theirTimezone));
  const lines: string[] = [];

  lines.push(`<b>📞 ${input.callMinutes}-minute catch-up with ${name}</b>`);
  lines.push(
    input.daysSinceLast === null
      ? "Your first call planned by touchbase."
      : `Last talked: ${input.daysSinceLast} day${input.daysSinceLast === 1 ? "" : "s"} ago.`,
  );
  if (input.lastNotes) lines.push(`Last time you talked about: ${escapeHtml(input.lastNotes)}`);
  lines.push("");
  lines.push(`<a href="${links.call}">Tap to call</a>`);
  if (input.nudge === "whatsapp") {
    lines.push(`<a href="${links.whatsapp}">Send a WhatsApp heads-up</a> · <a href="${links.sms}">or an SMS</a>`);
  } else if (input.nudge === "sms") {
    lines.push(`<a href="${links.sms}">Send an SMS heads-up</a>`);
  }
  lines.push("");
  if (input.talkingPoints.length > 0) {
    lines.push("<b>Things to talk about</b>");
    lines.push(`<ul>${input.talkingPoints.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>`);
  }
  lines.push(`${NOTES_MARKER} (write below this line after the call):`);
  lines.push("");
  return lines.join("<br>");
}

/** Google may return the description as HTML or plain text. Turn it into plain lines. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|ul|ol|h\d)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Read what I typed under the notes line. Returns null if nothing was written. */
export function extractNotes(description: string | null | undefined): string | null {
  if (!description) return null;
  const text = htmlToText(description);
  const idx = text.indexOf(NOTES_MARKER);
  if (idx === -1) return null;
  const afterMarker = text.slice(idx);
  const firstBreak = afterMarker.indexOf("\n");
  if (firstBreak === -1) return null;
  const notes = afterMarker
    .slice(firstBreak + 1)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 1000);
  return notes.length > 0 ? notes : null;
}
