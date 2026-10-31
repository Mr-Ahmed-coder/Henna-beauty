import mongoose from "mongoose";
import { bookingModels } from "./booking.js";
const { Schema } = mongoose;
const options = { timestamps: true, strict: "throw" };
const text = (max = 120) => ({
  type: String,
  required: true,
  trim: true,
  maxlength: max,
});
const staffSchema = new Schema(
  {
    name: text(),
    email: {
      ...text(254),
      lowercase: true,
      unique: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["Admin", "Receptionist", "Artist"],
      required: true,
    },
    active: { type: Boolean, default: true },
    bootstrap: { type: Boolean, default: false },
  },
  options,
);
export const Staff = mongoose.model("Staff", staffSchema);
export const Service = mongoose.model(
  "Service",
  new Schema(
    {
      name: text(),
      description: { type: String, trim: true, maxlength: 1000, default: "" },
      priceMinor: {
        type: Number,
        required: true,
        min: 0,
        max: 1000000000,
        validate: Number.isInteger,
      },
      durationMinutes: {
        type: Number,
        required: true,
        min: 5,
        max: 1440,
        validate: Number.isInteger,
      },
      active: { type: Boolean, default: true },
    },
    options,
  ),
);
const period = new Schema(
  {
    day: {
      type: Number,
      min: 0,
      max: 6,
      required: true,
      validate: Number.isInteger,
    },
    closed: { type: Boolean, required: true },
    open: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    close: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  },
  { _id: false, strict: "throw" },
);
export const Settings = mongoose.model(
  "Settings",
  new Schema(
    {
      _id: { type: String, default: "salon" },
      name: text(),
      currency: { type: String, required: true, match: /^[A-Z]{3}$/ },
      timezone: text(),
      hours: {
        type: [period],
        required: true,
        validate: (v) =>
          v.length === 7 &&
          new Set(v.map((p) => p.day)).size === 7 &&
          v.every((p) => p.closed || p.open < p.close),
      },
    },
    options,
  ),
);
const scheduleSchema = new Schema(
  {
    staff: { type: Schema.Types.ObjectId, ref: "Staff", required: true },
    day: {
      type: Number,
      min: 0,
      max: 6,
      required: true,
      validate: Number.isInteger,
    },
    available: { type: Boolean, required: true },
    start: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    end: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  },
  options,
);
scheduleSchema.index({ staff: 1, day: 1 }, { unique: true });
scheduleSchema.pre("validate", function () {
  if (this.start >= this.end) this.invalidate("end", "End must be after start");
});
export const Schedule = mongoose.model("Schedule", scheduleSchema);
export const Session = mongoose.model(
  "Session",
  new Schema(
    {
      token: { type: String, unique: true, required: true },
      csrf: { type: String, required: true },
      staff: { type: Schema.Types.ObjectId, ref: "Staff", required: true },
      expires: { type: Date, required: true, index: { expires: 0 } },
    },
    options,
  ),
);
export async function initializeModels() {
  await Promise.all(
    [Staff, Service, Schedule, Settings, Session, ...bookingModels].map((m) =>
      m.init(),
    ),
  );
}
