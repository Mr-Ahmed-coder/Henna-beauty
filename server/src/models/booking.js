import mongoose from "mongoose";
const { Schema } = mongoose;
const options = { timestamps: true, strict: "throw" };
const integer = (min, max, defaultValue) => ({
  type: Number,
  required: true,
  min,
  max,
  default: defaultValue,
  validate: Number.isInteger,
});
export const BookingPolicy = mongoose.model(
  "BookingPolicy",
  new Schema(
    {
      _id: { type: String, default: "salon" },
      approvalRequired: { type: Boolean, required: true, default: false },
      cancellationEnabled: { type: Boolean, required: true, default: true },
      reschedulingEnabled: { type: Boolean, required: true, default: true },
      cancellationNoticeHours: integer(0, 720, 24),
      reschedulingNoticeHours: integer(0, 720, 24),
      minimumNoticeMinutes: integer(0, 10080, 60),
      advanceDays: integer(1, 365, 90),
      slotIntervalMinutes: integer(5, 60, 15),
    },
    options,
  ),
);
const pause = new Schema(
  {
    day: integer(0, 6),
    start: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    end: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  },
  { _id: false, strict: "throw" },
);
export const ArtistProfile = mongoose.model(
  "ArtistProfile",
  new Schema(
    {
      staff: {
        type: Schema.Types.ObjectId,
        ref: "Staff",
        required: true,
        unique: true,
      },
      services: {
        type: [{ type: Schema.Types.ObjectId, ref: "Service" }],
        default: [],
      },
      breaks: {
        type: [pause],
        default: [],
        validate: (v) =>
          v.length <= 50 &&
          v.every((b) => Number.isInteger(b.day) && b.start < b.end),
      },
    },
    options,
  ),
);
export const statuses = [
  "Pending",
  "Confirmed",
  "Checked In",
  "In Service",
  "Completed",
  "Cancelled",
  "No-Show",
];
export const Appointment = mongoose.model(
  "Appointment",
  new Schema(
    {
      reference: { type: String, required: true, unique: true },
      accessHash: { type: String, required: true, select: false },
      service: { type: Schema.Types.ObjectId, ref: "Service", required: true },
      serviceName: { type: String, required: true },
      priceMinor: { type: Number, required: true },
      currency: { type: String, required: true },
      durationMinutes: { type: Number, required: true },
      artist: { type: Schema.Types.ObjectId, ref: "Staff", required: true },
      artistName: { type: String, required: true },
      start: { type: Date, required: true, index: true },
      end: { type: Date, required: true },
      timezone: { type: String, required: true },
      customerName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
      },
      phone: {
        type: String,
        required: true,
        trim: true,
        match: /^\+?[0-9 ()-]{7,25}$/,
      },
      notes: { type: String, default: "", trim: true, maxlength: 1000 },
      status: { type: String, required: true, enum: statuses },
      history: {
        type: [
          new Schema({ status: String, at: Date, by: String }, { _id: false }),
        ],
        default: [],
      },
    },
    options,
  ),
);
Appointment.schema.index({ artist: 1, start: 1, end: 1 });
export const BookingLock = mongoose.model(
  "BookingLock",
  new Schema(
    { _id: String, revision: { type: Number, default: 0 } },
    { versionKey: false },
  ),
);
export const bookingModels = [
  BookingPolicy,
  ArtistProfile,
  Appointment,
  BookingLock,
];
