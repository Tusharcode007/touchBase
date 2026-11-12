// MongoDB collections. See docs/DATA.md for why each one looks like this.
//
// Fields ending in "Enc" are encrypted with lib/crypto.ts before saving.
// Nothing in here is ever sent to the browser directly — routes map documents
// to small "DTO" objects first (see services/dto.ts).
import mongoose, { Schema, type InferSchemaType, type HydratedDocument } from "mongoose";

// Defence in depth against NoSQL injection: strips "$" operators from query filters.
mongoose.set("sanitizeFilter", true);
mongoose.set("strictQuery", true);

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    googleSub: { type: String, default: null },
    name: { type: String, default: "" },
    refreshTokenEnc: { type: String, default: null },
    demo: { type: Boolean, default: false },
    // Validated with shared/schemas.ts settingsSchema before every save.
    settings: { type: Schema.Types.Mixed, required: true },
    state: {
      lastPlanDate: { type: String, default: null }, // local date of the last morning plan
      lastOutcome: { type: String, default: null },
      lastRunAt: { type: Date, default: null },
      lockUntil: { type: Date, default: null }, // stops two jobs running at once
    },
  },
  { timestamps: true, minimize: false },
);

const timeRangeSchema = new Schema({ start: String, end: String }, { _id: false });

const personSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true },
    relation: { type: String, required: true },
    phoneEnc: { type: String, required: true },
    everyDays: { type: Number, required: true },
    timezone: { type: String, required: true },
    available: { type: [timeRangeSchema], default: [] },
    nudge: { type: String, required: true },
    notesEnc: { type: String, default: null },
    paused: { type: Boolean, default: false },
    allowAi: { type: Boolean, default: true },
    prioritizedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const callSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    personId: { type: Schema.Types.ObjectId, required: true },
    // A copy of the name, so history still reads well after a person is deleted.
    personName: { type: String, required: true },
    date: { type: String, required: true }, // local "YYYY-MM-DD" the call belongs to
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    placedStart: { type: Date, required: true }, // where touchbase put it (to spot manual moves)
    calendarId: { type: String, required: true },
    eventId: { type: String, default: null },
    status: { type: String, enum: ["scheduled", "done", "skipped"], default: "scheduled" },
    notesEnc: { type: String, default: null },
    settledAt: { type: Date, default: null },
  },
  { timestamps: true },
);
callSchema.index({ userId: 1, date: 1 });
callSchema.index({ userId: 1, personId: 1, status: 1, end: -1 });
callSchema.index({ userId: 1, start: -1 });

export const User = mongoose.model("User", userSchema);
export const Person = mongoose.model("Person", personSchema);
export const Call = mongoose.model("Call", callSchema);

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export type PersonDoc = HydratedDocument<InferSchemaType<typeof personSchema>>;
export type CallDoc = HydratedDocument<InferSchemaType<typeof callSchema>>;
