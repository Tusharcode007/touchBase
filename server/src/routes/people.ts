// People I want to stay in touch with: add, edit, delete, "prioritise next",
// and the "Haven't called" overview.
import { Router } from "express";
import { parsePhoneNumberWithError } from "libphonenumber-js";
import type { OverviewRow } from "../../../shared/api.js";
import { personSchema, type PersonInput, type Relation } from "../../../shared/schemas.js";
import type { AppContext } from "../context.js";
import { Person } from "../db/models.js";
import { DAY_MS } from "../core/day.js";
import { overdueScore } from "../core/planner.js";
import { HttpError, notFound } from "../lib/errors.js";
import { lastDoneByPerson, overdueBadge, parseId, personToDTO } from "../services/dto.js";

const MAX_PEOPLE = 50;

/** Store the phone in E.164 form (+919876543210) and encrypt personal fields. */
function toStored(input: PersonInput, ctx: AppContext) {
  const phone = parsePhoneNumberWithError(input.phone).number;
  return {
    name: input.name,
    relation: input.relation,
    phoneEnc: ctx.cipher.encrypt(phone),
    everyDays: input.everyDays,
    timezone: input.timezone,
    available: input.available,
    nudge: input.nudge,
    notesEnc: input.notes ? ctx.cipher.encrypt(input.notes) : null,
    paused: input.paused,
    allowAi: input.allowAi,
  };
}

export function peopleRoutes(ctx: AppContext): Router {
  const router = Router();

  router.get("/people", async (_req, res) => {
    const people = await Person.find({ userId: res.locals.user._id }).sort({ name: 1 });
    res.json(people.map((p) => personToDTO(p, ctx.cipher)));
  });

  router.post("/people", async (req, res) => {
    const input = personSchema.parse(req.body);
    const count = await Person.countDocuments({ userId: res.locals.user._id });
    if (count >= MAX_PEOPLE) throw new HttpError(400, `You can add up to ${MAX_PEOPLE} people.`);
    const person = await Person.create({ userId: res.locals.user._id, ...toStored(input, ctx) });
    res.status(201).json(personToDTO(person, ctx.cipher));
  });

  router.put("/people/:id", async (req, res) => {
    const input = personSchema.parse(req.body);
    // Always match on BOTH the id and the owner, so nobody can edit someone else's data.
    const person = await Person.findOneAndUpdate(
      { _id: parseId(req.params.id), userId: res.locals.user._id },
      { $set: toStored(input, ctx) },
      { returnDocument: "after" },
    );
    if (!person) throw notFound();
    res.json(personToDTO(person, ctx.cipher));
  });

  router.delete("/people/:id", async (req, res) => {
    const result = await Person.deleteOne({ _id: parseId(req.params.id), userId: res.locals.user._id });
    if (result.deletedCount === 0) throw notFound();
    res.json({ ok: true });
  });

  /** "Prioritise next": this person goes first in the next morning plan. */
  router.post("/people/:id/prioritize", async (req, res) => {
    const person = await Person.findOneAndUpdate(
      { _id: parseId(req.params.id), userId: res.locals.user._id },
      { $set: { prioritizedAt: new Date(ctx.now()) } },
      { returnDocument: "after" },
    );
    if (!person) throw notFound();
    res.json(personToDTO(person, ctx.cipher));
  });

  /** "Haven't called": everyone, most overdue first. */
  router.get("/overview", async (_req, res) => {
    const userId = res.locals.user._id;
    const now = ctx.now();
    const [people, lastDone] = await Promise.all([Person.find({ userId }), lastDoneByPerson(userId)]);
    const rows = people.map((p) => {
      const last = lastDone.get(p.id) ?? null;
      const row: OverviewRow = {
        id: p.id,
        name: p.name,
        relation: p.relation as Relation,
        everyDays: p.everyDays,
        paused: p.paused ?? false,
        prioritized: p.prioritizedAt != null,
        lastCallAt: last === null ? null : new Date(last).toISOString(),
        daysSince: last === null ? null : Math.floor((now - last) / DAY_MS),
        badge: overdueBadge(last, p.everyDays, now),
      };
      return { row, score: overdueScore({ lastDoneAt: last, everyDays: p.everyDays }, now) };
    });
    rows.sort((a, b) => (b.score === a.score ? a.row.name.localeCompare(b.row.name) : b.score > a.score ? 1 : -1));
    res.json(rows.map((r) => r.row));
  });

  return router;
}
