import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { initializeModels } from "../src/models/index.js";
import { Appointment } from "../src/models/booking.js";
import { Notification } from "../src/models/notification.js";
import { providerConfiguration } from "../src/notification/providers.js";
import {
  appointmentEvent,
  cancelAppointmentReminders,
  notificationsFor,
  processDueNotifications,
  queueEvent,
} from "../src/notification/engine.js";

test("in-app notifications are deduplicated, private, cancellable and retry safely", async (t) => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await initializeModels();
  t.after(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
  const appointment = await Appointment.create({
    reference: "HB-NOTIFICATION-TEST",
    accessHash: "private-token-hash",
    service: new mongoose.Types.ObjectId(),
    serviceName: "Test henna",
    priceMinor: 1000,
    currency: "UGX",
    durationMinutes: 30,
    artist: new mongoose.Types.ObjectId(),
    artistName: "Artist",
    start: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    end: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 30 * 60000),
    timezone: "Africa/Kampala",
    customerName: "Private customer",
    phone: "+256700123456",
    status: "Confirmed",
  });
  await appointmentEvent(appointment, "appointment.confirmed");
  await appointmentEvent(appointment, "appointment.confirmed");
  assert.equal(
    await Notification.countDocuments({ subjectReference: appointment.reference }),
    2,
  );
  const timeline = await notificationsFor("Appointment", appointment.reference);
  assert.equal(timeline.length, 2);
  assert.equal(timeline.filter((entry) => entry.type === "appointment.confirmed").length, 1);
  assert.equal(JSON.stringify(timeline).includes("Private customer"), false);
  assert.equal(JSON.stringify(timeline).includes("123456"), false);
  await cancelAppointmentReminders(appointment.reference);
  assert.equal(
    (
      await Notification.findOne({
        subjectReference: appointment.reference,
        type: "appointment.reminder",
      })
    ).state,
    "Cancelled",
  );

  await queueEvent(
    {
      reference: "QT-NOTIFICATION-TEST",
      number: 7,
      notificationPreferences: { inApp: true, sms: true, whatsapp: true },
    },
    "queue.called",
  );
  const queueRecords = await Notification.find({
    subjectReference: "QT-NOTIFICATION-TEST",
  });
  assert.equal(queueRecords.filter((record) => record.channel === "InApp").length, 1);
  assert.equal(
    queueRecords.filter((record) => ["SMS", "WhatsApp"].includes(record.channel)).every(
      (record) => record.state === "Deferred",
    ),
    true,
  );

  const now = new Date();
  const retry = await Notification.create({
    subjectKind: "Appointment",
    subjectReference: "HB-RETRY-TEST",
    type: "test.delivery",
    channel: "InApp",
    state: "Scheduled",
    dedupeKey: "retry-test",
    title: "Reminder",
    message: "Test retry",
    scheduledFor: now,
  });
  await processDueNotifications({
    now,
    send: async () => {
      throw new Error("temporary provider fault");
    },
  });
  let failed = await Notification.findById(retry._id);
  assert.equal(failed.state, "Failed");
  assert.equal(failed.attempts, 1);
  await processDueNotifications({
    now: new Date(failed.nextAttemptAt.getTime() + 1),
    send: async () => ({ delivered: true }),
  });
  failed = await Notification.findById(retry._id);
  assert.equal(failed.state, "Delivered");
  assert.equal(failed.attempts, 2);
  assert.equal(providerConfiguration({ SMS_API_KEY: "test-only" }).sms.active, false);
  await queueEvent({ reference: "QT-OPT-OUT", number: 8,
    notificationPreferences: { inApp: false, sms: false, whatsapp: false } }, "queue.called");
  assert.equal(await Notification.countDocuments({ subjectReference: "QT-OPT-OUT" }), 0);
  assert.equal((await notificationsFor("Queue", "QT-ANOTHER-TICKET")).length, 0);
});
