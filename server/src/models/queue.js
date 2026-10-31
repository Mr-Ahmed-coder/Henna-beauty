import mongoose from "mongoose";
const { Schema } = mongoose;
const options = { timestamps: true, strict: "throw" };
const minutes = (value, min = 0, max = 180) => ({
  type: Number,
  required: true,
  default: value,
  min,
  max,
  validate: Number.isInteger,
});
export const queueStatuses = [
  "Waiting",
  "Checked In",
  "Called",
  "In Service",
  "Completed",
  "Cancelled",
  "Missed",
];
export const QueuePolicy = mongoose.model(
  "QueuePolicy",
  new Schema(
    {
      _id: { type: String, default: "salon" },
      enabled: { type: Boolean, required: true, default: true },
      remoteEnabled: { type: Boolean, required: true, default: true },
      remoteArrivalMinutes: minutes(20),
      graceMinutes: minutes(5, 1, 60),
      joinCutoffMinutes: minutes(30, 0, 180),
      maxActiveTickets: minutes(100, 1, 200),
    },
    options,
  ),
);
export const QueueDay = mongoose.model(
  "QueueDay",
  new Schema(
    { _id: String, nextNumber: { type: Number, default: 0 } },
    { versionKey: false },
  ),
);
const ticketSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    accessHash: { type: String, required: true, select: false },
    phoneHash: { type: String, required: true, select: false },
    number: { type: Number, required: true },
    date: { type: String, required: true, index: true },
    timezone: { type: String, required: true },
    source: { type: String, enum: ["Online", "Walk-in"], required: true },
    service: { type: Schema.Types.ObjectId, ref: "Service", required: true },
    serviceName: { type: String, required: true },
    durationMinutes: {
      type: Number,
      required: true,
      min: 5,
      max: 1440,
      validate: Number.isInteger,
    },
    priceMinor: { type: Number, required: true },
    currency: { type: String, required: true },
    customerName: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true },
    notes: { type: String, default: "", maxlength: 1000 },
    status: { type: String, enum: queueStatuses, required: true },
    active: { type: Boolean, required: true, default: true },
    checkedInAt: Date,
    calledAt: Date,
    deadlineAt: Date,
    artist: { type: Schema.Types.ObjectId, ref: "Staff" },
    artistName: String,
    start: Date,
    end: Date,
    startedAt: Date,
    finishedAt: Date,
    history: {
      type: [
        new Schema({ status: String, at: Date, by: String }, { _id: false }),
      ],
      default: [],
    },
  },
  options,
);
ticketSchema.index(
  { phoneHash: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);
ticketSchema.index({ date: 1, active: 1, number: 1 });
export const QueueTicket = mongoose.model("QueueTicket", ticketSchema);
export const queueModels = [QueuePolicy, QueueDay, QueueTicket];
