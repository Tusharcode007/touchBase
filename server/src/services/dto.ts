// Turn database documents into the small, safe objects the browser receives.
// Encrypted fields are decrypted here, for the signed-in owner only.
import { z } from "zod";
import mongoose from "mongoose";
import type { CallDTO, OverdueBadge, PersonDTO } from "../../../shared/api.js";
import type { CallStatus, Nudge, Relation, TimeRange } from "../../../shared/schemas.js";
import type { Cipher } from "../lib/crypto.js";
import { Call, type CallDoc, type PersonDoc } from "../db/models.js";
import { DAY_MS } from "../core/day.js";
import { HttpError } from "../lib/errors.js";

export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Bad id");

export function parseId(value: unknown): mongoose.Types.ObjectId {
  const parsed = objectId.safeParse(value);
  if (!parsed.success) throw new HttpError(404, "Not found");
  return new mongoose.Types.ObjectId(parsed.data);
}

export function personToDTO(p: PersonDoc, cipher: Cipher): PersonDTO {
  return {
    id: p.id,
    name: p.name,
    relation: p.relation as Relation,
    phone: cipher.decrypt(p.phoneEnc),
    everyDays: p.everyDays,
    timezone: p.timezone,
    available: p.available.map((r) => ({ start: r.start ?? "", end: r.end ?? "" })) as TimeRange[],
    nudge: p.nudge as Nudge,
    notes: p.notesEnc ? cipher.decrypt(p.notesEnc) : "",
    paused: p.paused ?? false,
    allowAi: p.allowAi ?? true,
    prioritized: p.prioritizedAt !== null && p.prioritizedAt !== undefined,
  };
}

export function callToDTO(c: CallDoc, cipher: Cipher): CallDTO {
  return {
    id: c.id,
    personId: c.personId.toString(),
    personName: c.personName,
    date: c.date,
    start: c.start.toISOString(),
    end: c.end.toISOString(),
    status: c.status as CallStatus,
    notes: c.notesEnc ? cipher.decrypt(c.notesEnc) : "",
  };
}

/** For each person: the end time of their most recent call marked done. */
export async function lastDoneByPerson(userId: mongoose.Types.ObjectId): Promise<Map<string, number>> {
  const rows = await Call.aggregate<{ _id: mongoose.Types.ObjectId; lastEnd: Date }>([
    { $match: { userId, status: "done" } },
    { $group: { _id: "$personId", lastEnd: { $max: "$end" } } },
  ]);
  return new Map(rows.map((r) => [r._id.toString(), r.lastEnd.getTime()]));
}

/** Simple traffic light for the "Haven't called" screen. */
export function overdueBadge(lastDoneAt: number | null, everyDays: number, now: number): OverdueBadge {
  if (lastDoneAt === null) return "never";
  const ratio = (now - lastDoneAt) / DAY_MS / everyDays;
  if (ratio < 1) return "on-track";
  if (ratio < 1.5) return "due";
  return "overdue";
}
