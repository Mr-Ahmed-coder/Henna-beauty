import mongoose from "mongoose";

const { Schema } = mongoose;
const options = { timestamps: true, strict: "throw" };

export const notificationKinds = ["Appointment", "Queue"];
export const notificationChannels = ["InApp", "SMS", "WhatsApp"];
export const notificationStates = [
  "Scheduled",
  "Sending",
  "Delivered",
  "Deferred",
  "Cancelled",
  "Failed",
];

export const notificationPreferenceSchema = new Schema(
  {
    inApp: { type: Boolean, required: true, default: true },
    sms: { type: Boolean, required: true, default: false },
    whatsapp: { type: Boolean, required: true, default: false },
  },
  { _id: false, strict: "throw" },
);

export const Notification = mongoose.model(
  "Notification",
  new Schema(
    {
      subjectKind: { type: String, enum: notificationKinds, required: true },
      subjectReference: { type: String, required: true, maxlength: 80 },
      type: { type: String, required: true, maxlength: 80 },
      channel: { type: String, enum: notificationChannels, required: true },
      state: { type: String, enum: notificationStates, required: true },
      dedupeKey: { type: String, required: true, unique: true, maxlength: 300 },
      title: { type: String, required: true, maxlength: 160 },
      message: { type: String, required: true, maxlength: 500 },
      scheduledFor: { type: Date, required: true, index: true },
      appointmentStart: Date,
      deliveredAt: Date,
      nextAttemptAt: Date,
      attempts: { type: Number, required: true, default: 0, min: 0, max: 10 },
      lastError: { type: String, trim: true, maxlength: 300, default: "" },
    },
    options,
  ),
);

Notification.schema.index({ subjectKind: 1, subjectReference: 1, createdAt: -1 });
Notification.schema.index({ state: 1, scheduledFor: 1, nextAttemptAt: 1 });

export const notificationModels = [Notification];
