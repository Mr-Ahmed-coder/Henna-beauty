import mongoose from "mongoose";
import { DateTime } from "luxon";
import { randomBytes } from "node:crypto";
import { Staff, Service, Schedule, Settings } from "../models/index.js";
import {
  BookingPolicy,
  ArtistProfile,
  Appointment,
  BookingLock,
} from "../models/booking.js";
import { digest, randomToken } from "../security.js";
export const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
export function fields(body, allowed) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((k) => !allowed.includes(k))
  )
    fail(400, "Invalid request fields");
  return body;
}
export function objectId(value) {
  if (typeof value !== "string" || !mongoose.isValidObjectId(value))
    fail(400, "Invalid record ID");
  return value;
}
export async function configuration(session = null) {
  const settings = await Settings.findById("salon").session(session);
  if (!settings)
    fail(
      503,
      "The salon must configure business hours and currency before accepting bookings.",
    );
  const policy =
    (await BookingPolicy.findById("salon").session(session)) ||
    new BookingPolicy();
  return { settings, policy };
}
export async function bookingReady() {
  if (mongoose.connection.readyState !== 1)
    fail(503, "Booking requires a connected database.");
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== "isdbgrid")
    fail(503, "Booking requires a MongoDB replica set for safe reservations.");
}
export async function atomic(action) {
  await bookingReady();
  await BookingLock.updateOne(
    { _id: "salon" },
    { $setOnInsert: { revision: 0 } },
    { upsert: true },
  );
  return mongoose.connection.transaction(
    async (session) => {
      await BookingLock.updateOne(
        { _id: "salon" },
        { $inc: { revision: 1 } },
        { session },
      );
      return action(session);
    },
    {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
      maxCommitTimeMS: 10000,
    },
  );
}
function localTime(date, time, zone) {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone });
  if (!dt.isValid || dt.toFormat("yyyy-MM-dd HH:mm") !== `${date} ${time}`)
    return null;
  return dt;
}
export async function availability(
  { service: serviceId, date, artist },
  session = null,
  exclude = null,
  now = DateTime.utc(),
) {
  const { settings, policy } = await configuration(session);
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    fail(400, "Choose a valid appointment date");
  const day = DateTime.fromISO(date, { zone: settings.timezone });
  if (!day.isValid || day.toISODate() !== date)
    fail(400, "Invalid appointment date");
  const today = now.setZone(settings.timezone).startOf("day");
  if (day < today || day > today.plus({ days: policy.advanceDays }))
    fail(400, `Choose a date within ${policy.advanceDays} days`);
  const service = await Service.findOne({
    _id: objectId(serviceId),
    active: true,
  }).session(session);
  if (!service) fail(404, "Service unavailable");
  if (artist) objectId(artist);
  const artists = await Staff.find({
    active: true,
    role: "Artist",
    ...(artist ? { _id: artist } : {}),
  })
    .sort({ _id: 1 })
    .session(session);
  const hours = settings.hours.find((h) => h.day === day.weekday % 7);
  const result = {
    date,
    timezone: settings.timezone,
    service,
    policy,
    settings,
    slots: [],
  };
  if (!hours || hours.closed) return result;
  const profiles = await ArtistProfile.find({
    staff: { $in: artists.map((a) => a._id) },
    services: service._id,
  }).session(session);
  const shifts = await Schedule.find({
    staff: { $in: profiles.map((p) => p.staff) },
    day: day.weekday % 7,
    available: true,
  }).session(session);
  const reservations = await Appointment.find({
    artist: { $in: artists.map((a) => a._id) },
    status: { $nin: ["Cancelled", "No-Show"] },
    start: { $lt: day.plus({ days: 1 }).toJSDate() },
    end: { $gt: day.toJSDate() },
    ...(exclude ? { _id: { $ne: exclude } } : {}),
  }).session(session);
  for (const person of artists) {
    const profile = profiles.find(
        (p) => String(p.staff) === String(person._id),
      ),
      shift = shifts.find((s) => String(s.staff) === String(person._id));
    if (!profile || !shift) continue;
    const open = localTime(
        date,
        hours.open > shift.start ? hours.open : shift.start,
        settings.timezone,
      ),
      close = localTime(
        date,
        hours.close < shift.end ? hours.close : shift.end,
        settings.timezone,
      );
    if (!open || !close) continue;
    // Iterate real instants, preserving both offsets in a daylight-saving repeated hour.
    for (
      let start = open;
      start.plus({ minutes: service.durationMinutes }) <= close;
      start = start.plus({ minutes: policy.slotIntervalMinutes })
    ) {
      const end = start.plus({ minutes: service.durationMinutes });
      if (start < now.plus({ minutes: policy.minimumNoticeMinutes })) continue;
      const pauses = profile.breaks.filter((b) => b.day === day.weekday % 7);
      if (
        pauses.some((b) => {
          const from = localTime(date, b.start, settings.timezone),
            to = localTime(date, b.end, settings.timezone);
          if (!from || !to) return true;
          const starts = from.getPossibleOffsets(),
            ends = to.getPossibleOffsets();
          return starts.some((s) => ends.some((e) => start < e && end > s));
        })
      )
        continue;
      if (
        reservations.some(
          (a) =>
            String(a.artist) === String(person._id) &&
            start.toMillis() < a.end.getTime() &&
            end.toMillis() > a.start.getTime(),
        )
      )
        continue;
      result.slots.push({
        start: start.toUTC().toISO(),
        end: end.toUTC().toISO(),
        label: start.toFormat("HH:mm ZZZZ"),
        artist: String(person._id),
        artistName: person.name,
      });
    }
  }
  result.slots.sort(
    (a, b) =>
      a.start.localeCompare(b.start) || a.artist.localeCompare(b.artist),
  );
  return result;
}
export function customerData(body) {
  const { customerName, phone, notes = "" } = body;
  if (
    typeof customerName !== "string" ||
    !customerName.trim() ||
    customerName.trim().length > 120 ||
    typeof phone !== "string" ||
    !/^\+?[0-9 ()-]{7,25}$/.test(phone) ||
    phone.replace(/\D/g, "").length < 7 ||
    typeof notes !== "string" ||
    notes.length > 1000
  )
    fail(
      400,
      "Enter a name, valid phone number, and notes of at most 1000 characters",
    );
  return {
    customerName: customerName.trim(),
    phone: phone.trim(),
    notes: notes.trim(),
  };
}
async function choose(body, session, exclude) {
  if (
    typeof body.start !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(body.start)
  )
    fail(400, "Choose an available time");
  const start = DateTime.fromISO(body.start, { zone: "utc" });
  if (!start.isValid) fail(400, "Invalid time");
  const { settings } = await configuration(session);
  const available = await availability(
    {
      service: body.service,
      date: start.setZone(settings.timezone).toISODate(),
      artist: body.artist || undefined,
    },
    session,
    exclude,
  );
  const slot = available.slots.find(
    (s) => Date.parse(s.start) === start.toMillis(),
  );
  if (!slot)
    fail(409, "That time is no longer available. Choose another slot.");
  return { ...available, slot };
}
export async function createReservation(body, by = "customer") {
  const customer = customerData(body),
    token = randomToken(),
    reference = "HB-" + randomBytes(8).toString("hex").toUpperCase();
  const appointment = await atomic(async (session) => {
    const { slot, service, policy, settings } = await choose(body, session);
    const status = policy.approvalRequired ? "Pending" : "Confirmed";
    const [doc] = await Appointment.create(
      [
        {
          reference,
          accessHash: digest(token),
          service: service._id,
          serviceName: service.name,
          priceMinor: service.priceMinor,
          currency: settings.currency,
          durationMinutes: service.durationMinutes,
          artist: slot.artist,
          artistName: slot.artistName,
          start: slot.start,
          end: slot.end,
          timezone: settings.timezone,
          ...customer,
          status,
          history: [{ status, at: new Date(), by }],
        },
      ],
      { session },
    );
    return doc;
  });
  return { appointment: safeAppointment(appointment), token };
}
export const transitions = {
  Pending: ["Confirmed", "Cancelled"],
  Confirmed: ["Checked In", "Cancelled", "No-Show"],
  "Checked In": ["In Service", "Cancelled"],
  "In Service": ["Completed"],
  Completed: [],
  Cancelled: [],
  "No-Show": [],
};
export function safeAppointment(doc) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  delete obj.accessHash;
  delete obj.__v;
  return obj;
}
export async function changeReservation(
  reference,
  body,
  { token, staff } = {},
) {
  return atomic(async (session) => {
    const doc = await Appointment.findOne({
      reference,
      ...(!staff ? { accessHash: digest(token || "") } : {}),
    }).session(session);
    if (!doc)
      fail(404, "Reservation not found or private access link is invalid");
    if (staff?.role === "Artist" && String(doc.artist) !== String(staff._id))
      fail(403, "This appointment is assigned to another artist");
    const { policy } = await configuration(session);
    const now = Date.now();
    if (body.action === "reschedule") {
      if (staff?.role === "Artist")
        fail(403, "Receptionist or administrator permission required");
      if (!["Pending", "Confirmed"].includes(doc.status))
        fail(409, "Only pending or confirmed reservations may be rescheduled");
      if (
        !staff &&
        (!policy.reschedulingEnabled ||
          doc.start.getTime() - now < policy.reschedulingNoticeHours * 3600000)
      )
        fail(
          409,
          "The rescheduling deadline has passed or self-service changes are disabled. Contact the salon.",
        );
      const { slot, service, settings } = await choose(
        {
          service: String(doc.service),
          start: body.start,
          artist: body.artist || undefined,
        },
        session,
        doc._id,
      );
      // Preserve the booked duration and price even if the service menu has since changed.
      const newEnd = new Date(
        Date.parse(slot.start) + doc.durationMinutes * 60000,
      );
      // Duration changes require a fresh reservation, avoiding an incorrect availability calculation.
      if (service.durationMinutes !== doc.durationMinutes)
        fail(
          409,
          "Service duration changed. Cancel and create a new reservation.",
        );
      doc.start = slot.start;
      doc.end = newEnd;
      doc.artist = slot.artist;
      doc.artistName = slot.artistName;
      doc.timezone = settings.timezone;
      doc.history.push({
        status: doc.status,
        at: new Date(),
        by: staff ? String(staff._id) : "customer reschedule",
      });
    } else if (body.action === "status") {
      const status = body.status;
      if (!staff && status !== "Cancelled")
        fail(403, "Customers may only cancel their reservation");
      if (
        staff?.role === "Artist" &&
        !["Checked In", "In Service", "Completed", "No-Show"].includes(status)
      )
        fail(403, "Artists may only update appointment progress");
      if (!transitions[doc.status].includes(status))
        fail(409, "Invalid appointment status transition");
      if (
        !staff &&
        (!policy.cancellationEnabled ||
          doc.start.getTime() - now < policy.cancellationNoticeHours * 3600000)
      )
        fail(
          409,
          "The cancellation deadline has passed or self-service cancellation is disabled. Contact the salon.",
        );
      if (
        ["Completed", "No-Show"].includes(status) &&
        doc.start.getTime() > now
      )
        fail(409, "The appointment has not started yet");
      doc.status = status;
      doc.history.push({
        status,
        at: new Date(),
        by: staff ? String(staff._id) : "customer",
      });
    } else fail(400, "Unknown appointment action");
    await doc.save({ session });
    return safeAppointment(doc);
  });
}
