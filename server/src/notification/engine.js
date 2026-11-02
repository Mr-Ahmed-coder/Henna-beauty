import { DateTime } from "luxon";
import { Notification } from "../models/notification.js";
import { Appointment } from "../models/booking.js";

const retryLimit = 3;

export function preferences(value) {
  return {
    inApp: value?.inApp !== false,
    sms: value?.sms === true,
    whatsapp: value?.whatsapp === true,
  };
}

export function validatePreferences(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !["inApp", "sms", "whatsapp"].includes(key)) ||
    Object.values(value).some((setting) => typeof setting !== "boolean")
  )
    throw Object.assign(new Error("Invalid notification preferences"), { status: 400 });
  return preferences(value);
}

function localTime(value, timezone) {
  return DateTime.fromJSDate(new Date(value), { zone: "utc" })
    .setZone(timezone)
    .setLocale("en-US")
    .toFormat("cccc, LLL d 'at' h:mm a ZZZZ");
}

function appointmentCopy(event, appointment) {
  const time = localTime(appointment.start, appointment.timezone);
  if (event === "appointment.confirmed")
    return {
      title: "Appointment confirmed",
      message: `${appointment.serviceName} is confirmed for ${time}.`,
    };
  if (event === "appointment.requested")
    return {
      title: "Appointment request received",
      message: `Your ${appointment.serviceName} request for ${time} is awaiting salon approval.`,
    };
  if (event === "appointment.rescheduled")
    return {
      title: "Appointment rescheduled",
      message: `Your ${appointment.serviceName} visit is now scheduled for ${time}.`,
    };
  if (event === "appointment.cancelled")
    return {
      title: "Appointment cancelled",
      message: `Your ${appointment.serviceName} appointment for ${time} has been cancelled.`,
    };
  return {
    title: "Appointment reminder",
    message: `Reminder: ${appointment.serviceName} is scheduled for ${time}.`,
  };
}

function queueCopy(event, ticket) {
  if (event === "queue.joined")
    return {
      title: "Queue ticket ready",
      message: `Your Q${String(ticket.number).padStart(3, "0")} ticket is active. Keep this private page open for updates.`,
    };
  if (event === "queue.turn_approaching")
    return {
      title: "Your queue turn is approaching",
      message: "Please plan to be ready and keep your private ticket page open.",
    };
  if (event === "queue.called")
    return {
      title: "You have been called",
      message: ticket.checkedInAt
        ? "Your artist is ready. Please speak with reception now."
        : "Please arrive and check in with reception before your ticket deadline.",
    };
  if (event === "queue.missed")
    return {
      title: "Queue ticket missed",
      message: "Your arrival or queue deadline passed. Please contact reception if you need help.",
    };
  if (event === "queue.cancelled")
    return {
      title: "Queue ticket cancelled",
      message: "Your queue ticket has been cancelled and your place has been released.",
    };
  return {
    title: "Queue check-in recorded",
    message: "Reception has recorded your arrival. Please wait for your artist to call you.",
  };
}

function copyFor(subjectKind, event, document) {
  return subjectKind === "Appointment"
    ? appointmentCopy(event, document)
    : queueCopy(event, document);
}

function channelsFor(preference) {
  const selected = preferences(preference);
  return [
    ...(selected.inApp ? ["InApp"] : []),
    ...(selected.sms ? ["SMS"] : []),
    ...(selected.whatsapp ? ["WhatsApp"] : []),
  ];
}

export async function recordNotification({
  subjectKind,
  document,
  event,
  key,
  scheduledFor = new Date(),
  session,
}) {
  const copy = copyFor(subjectKind, event, document);
  const when = new Date(scheduledFor);
  const preference = document.notificationPreferences;
  for (const channel of channelsFor(preference)) {
    const immediate = channel === "InApp" && when <= new Date();
    const external = channel !== "InApp";
    await Notification.updateOne(
      { dedupeKey: `${key}:${channel}` },
      {
        $setOnInsert: {
          subjectKind,
          subjectReference: document.reference,
          type: event,
          channel,
          dedupeKey: `${key}:${channel}`,
          title: copy.title,
          message: copy.message,
          scheduledFor: when,
          ...(event === "appointment.reminder" ? { appointmentStart: document.start } : {}),
          state: immediate ? "Delivered" : external ? "Deferred" : "Scheduled",
          ...(immediate ? { deliveredAt: new Date() } : {}),
          ...(external
            ? {
                lastError:
                  "External delivery is disabled until an approved provider integration is configured.",
              }
            : {}),
        },
      },
      { upsert: true, session },
    ).catch((error) => {
      if (error.code !== 11000 || session) throw error;
      // Concurrent tracking reads may discover the same approaching-turn event.
      // The unique key means another request has already recorded it.
    });
  }
}

export async function cancelAppointmentReminders(reference, session) {
  await Notification.updateMany(
    {
      subjectKind: "Appointment",
      subjectReference: reference,
      type: "appointment.reminder",
      state: { $in: ["Scheduled", "Sending", "Deferred", "Failed"] },
    },
    { $set: { state: "Cancelled", nextAttemptAt: null } },
    { session },
  );
}

export async function cancelDisabledNotifications(
  subjectKind,
  subjectReference,
  preference,
  session,
) {
  const activeChannels = channelsFor(preference);
  await Notification.updateMany(
    {
      subjectKind,
      subjectReference,
      state: { $in: ["Scheduled", "Sending", "Deferred", "Failed"] },
      channel: { $nin: activeChannels },
    },
    { $set: { state: "Cancelled", nextAttemptAt: null } },
    { session },
  );
}

export async function scheduleAppointmentReminder(appointment, session) {
  if (appointment.status !== "Confirmed") return;
  const scheduledFor = new Date(appointment.start.getTime() - 24 * 60 * 60 * 1000);
  await recordNotification({
    subjectKind: "Appointment",
    document: appointment,
    event: "appointment.reminder",
    key: `appointment:${appointment.reference}:reminder:${appointment.history?.length || 0}:${appointment.start.toISOString()}`,
    scheduledFor: scheduledFor < new Date() ? new Date() : scheduledFor,
    session,
  });
}

export async function appointmentEvent(appointment, event, { session } = {}) {
  const detail = event === "appointment.rescheduled" ? `:${appointment.history?.length || 0}:${appointment.start.toISOString()}` : "";
  await recordNotification({
    subjectKind: "Appointment",
    document: appointment,
    event,
    key: `appointment:${appointment.reference}:${event}${detail}`,
    session,
  });
  if (event === "appointment.confirmed" || event === "appointment.rescheduled")
    await scheduleAppointmentReminder(appointment, session);
}

export async function queueEvent(ticket, event, { session } = {}) {
  await recordNotification({
    subjectKind: "Queue",
    document: ticket,
    event,
    key: `queue:${ticket.reference}:${event}`,
    session,
  });
}

export function safeNotification(notification) {
  const doc = notification.toObject ? notification.toObject() : notification;
  return {
    id: String(doc._id),
    type: doc.type,
    channel: doc.channel,
    state: doc.state,
    title: doc.title,
    message: doc.message,
    scheduledFor: doc.scheduledFor,
    deliveredAt: doc.deliveredAt || null,
    createdAt: doc.createdAt,
  };
}

export async function notificationsFor(subjectKind, subjectReference) {
  const docs = await Notification.find({
    subjectKind,
    subjectReference,
    channel: "InApp",
    state: { $ne: "Cancelled" },
  })
    .sort({ scheduledFor: -1, _id: -1 })
    .limit(20);
  return docs.map(safeNotification);
}

// This processor is deliberately provider-neutral. In-app reminders are durable and
// delivered here. External channels remain deferred unless a future approved adapter
// is supplied; no environment value alone can send customer messages.
export async function processDueNotifications({
  now = new Date(),
  limit = 50,
  send = async (notification) =>
    notification.channel === "InApp"
      ? { delivered: true }
      : {
          deferred: true,
          error:
            "External delivery is disabled until an approved provider integration is configured.",
        },
} = {}) {
  // Recover claims left by an interrupted process. Only in-app delivery is active;
  // a future external adapter must use dedupeKey as its provider idempotency key.
  await Notification.updateMany(
    { state: "Sending", updatedAt: { $lt: new Date(now.getTime() - 5 * 60000) } },
    { $set: { state: "Failed", nextAttemptAt: now } },
  );
  const due = await Notification.find({
    state: { $in: ["Scheduled", "Failed"] },
    scheduledFor: { $lte: now },
    attempts: { $lt: retryLimit },
    $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
  })
    .sort({ scheduledFor: 1, _id: 1 })
    .limit(limit);
  const results = [];
  for (const candidate of due) {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: candidate._id,
        state: { $in: ["Scheduled", "Failed"] },
        attempts: { $lt: retryLimit },
        $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
      },
      { $set: { state: "Sending" }, $inc: { attempts: 1 } },
      { new: true },
    );
    if (!notification) continue;
    try {
      if (notification.type === "appointment.reminder") {
        const appointment = await Appointment.findOne({ reference: notification.subjectReference });
        if (!appointment || appointment.status !== "Confirmed" ||
          appointment.start <= now ||
          appointment.start.getTime() !== notification.appointmentStart?.getTime() ||
          !channelsFor(appointment.notificationPreferences).includes(notification.channel)) {
          await Notification.updateOne({ _id: notification._id, state: "Sending" },
            { $set: { state: "Cancelled", nextAttemptAt: null } });
          continue;
        }
      }
      const outcome = await send(notification);
      if (outcome?.delivered) {
        await Notification.updateOne(
          { _id: notification._id, state: "Sending" },
          { $set: { state: "Delivered", deliveredAt: now, lastError: "", nextAttemptAt: null } },
        );
        results.push("Delivered");
      } else if (outcome?.deferred) {
        await Notification.updateOne(
          { _id: notification._id, state: "Sending" },
          { $set: { state: "Deferred", lastError: outcome.error || "Delivery deferred", nextAttemptAt: null } },
        );
        results.push("Deferred");
      } else throw new Error("Delivery provider returned no result");
    } catch {
      const attempts = notification.attempts;
      const retry = attempts < retryLimit;
      await Notification.updateOne(
        { _id: notification._id, state: "Sending" },
        {
          $set: {
            state: "Failed",
            lastError: "Delivery failed; retry policy applied.",
            nextAttemptAt: retry ? new Date(now.getTime() + 2 ** attempts * 60000) : null,
          },
        },
      );
      results.push("Failed");
    }
  }
  return results;
}
