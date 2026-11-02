import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Settings, Service, initializeModels } from "../src/models/index.js";
import { Appointment } from "../src/models/booking.js";
import { applyApprovedPrice } from "../scripts/localize-approved-price.js";
import { money, formatTime, slotTime, calendarDate, salonDefaults } from "../../client/src/localization.js";

test("US money and dates preserve legacy currency and distinguish Chicago DST offsets", () => {
  assert.equal(money(3000, "USD"), "$30.00");
  assert.equal(money(25000, "UGX"), "UGX 25,000");
  assert.equal(salonDefaults.timezone, "America/Chicago");
  assert.equal(slotTime("2027-11-07T06:00:00Z", "America/Chicago"), "1:00 AM CDT");
  assert.equal(slotTime("2027-11-07T07:00:00Z", "America/Chicago"), "1:00 AM CST");
  assert.equal(slotTime("2027-03-14T07:30:00Z", "America/Chicago"), "1:30 AM CST");
  assert.equal(slotTime("2027-03-14T08:30:00Z", "America/Chicago"), "3:30 AM CDT");
  assert.equal(calendarDate("2026-11-02"), "Nov 2, 2026");
  assert.match(formatTime("2026-11-02T16:00:00Z", "America/Chicago"), /10:00 AM/);
});
test("explicit approved USD replacement is atomic and leaves historical visit snapshots unchanged", async (t) => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await initializeModels();
  t.after(async () => { await mongoose.disconnect(); await mongo.stop(); });
  await Settings.create({ name: "Test salon", currency: "UGX", timezone: "Africa/Kampala", hours: Array.from({ length: 7 }, (_, day) => ({ day, closed: false, open: "09:00", close: "17:00" })) });
  const service = await Service.create({ name: "Test henna", priceMinor: 25000, durationMinutes: 30 });
  const appointment = await Appointment.create({ reference: "LEGACY", accessHash: "test", service: service._id, serviceName: service.name, priceMinor: 25000, currency: "UGX", durationMinutes: 30, artist: new mongoose.Types.ObjectId(), artistName: "Test artist", start: new Date("2026-11-01T06:00:00Z"), end: new Date("2026-11-01T06:30:00Z"), timezone: "Africa/Kampala", customerName: "Test", phone: "+16125550123", status: "Confirmed" });
  const before = await Appointment.findById(appointment._id).select("+accessHash").lean();
  const args = { serviceId: String(service._id), expectedCurrency: "UGX", expectedPriceMinor: 25000, usd: "30" };
  await assert.rejects(() => applyApprovedPrice({ ...args, expectedPriceMinor: 999 }));
  assert.equal((await Settings.findById("salon")).currency, "UGX");
  const result = await applyApprovedPrice(args);
  assert.equal(result.priceMinor, 3000);
  assert.equal((await Settings.findById("salon")).currency, "USD");
  assert.equal((await Settings.findById("salon")).timezone, "Africa/Kampala");
  assert.deepEqual(await Appointment.findById(appointment._id).select("+accessHash").lean(), before);
  await assert.rejects(() => applyApprovedPrice(args));
});
