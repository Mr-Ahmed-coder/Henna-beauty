import assert from "node:assert/strict";
import { test } from "node:test";
import { DateTime } from "luxon";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { Appointment } from "../src/models/booking.js";
import { Staff } from "../src/models/index.js";
import { hashPassword } from "../src/security.js";
import { demoDatabaseName, seedDemo, setDemoAdministrator } from "../scripts/demo-data.js";

test("isolated demo setup is repeatable and supports booking, admin, and walk-ins", async (t) => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  t.after(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
  const seed = {
    currency: "USD",
    services: ["Henna", "Henna Full", "Makeup"].map((name) => ({
      name, priceMinor: 3000, durationMinutes: 30,
    })),
    artistPassword: "test-demo-artist-only",
  };
  const initial = { email: "first@example.test", password: "test-demo-initial-only" };
  const replacement = { email: "owner@example.test", password: "test-demo-replacement-only" };

  await mongoose.connect(mongo.getUri("wrong_database"));
  await assert.rejects(seedDemo(seed), /dedicated salon_demo/);
  await assert.rejects(setDemoAdministrator(initial), /dedicated salon_demo/);
  await mongoose.disconnect();
  await mongoose.connect(mongo.getUri(demoDatabaseName));
  await assert.rejects(setDemoAdministrator(initial), /initialize its database/);
  assert.equal(await seedDemo(seed), true);
  assert.equal(await Staff.countDocuments({ role: "Admin" }), 0);
  await setDemoAdministrator(initial);
  const initialId = (await Staff.findOne({ role: "Admin" })).id;

  const tuesday = DateTime.now().setZone("America/Chicago")
    .plus({ weeks: 1 }).startOf("week").plus({ days: 1 }).set({ hour: 11 });
  let app;
  const server = (await import("node:http")).createServer((req, res) => app(req, res))
    .listen(0, "127.0.0.1");
  await new Promise((ready) => server.once("listening", ready));
  t.after(() => new Promise((closed) => server.close(closed)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  app = createApp({ origins: [origin], queueClock: () => tuesday });
  const call = (path, method = "GET", body, auth = {}) => fetch(origin + path, {
    method,
    headers: { Origin: origin, "Content-Type": "application/json", ...auth },
    body: body && JSON.stringify(body),
  });

  const catalogue = await (await call("/api/booking/catalog")).json();
  assert.equal(catalogue.services.length, 3);
  assert.equal(catalogue.artists.length, 1);
  assert.equal(catalogue.artists[0].name, "Demo Henna Artist");
  assert.ok(catalogue.services.every((service) => service.bookable));
  const service = catalogue.services[0]._id;
  const slotsOn = async (day) => (await (await call(
    `/api/booking/availability?service=${service}&date=${day.toISODate()}`,
  )).json()).slots;
  const slots = await slotsOn(tuesday);
  assert.equal(slots[0].start, tuesday.set({ hour: 10 }).toUTC().toISO());
  assert.equal(slots.at(-1).end, tuesday.set({ hour: 17 }).toUTC().toISO());
  assert.equal((await slotsOn(tuesday.minus({ days: 1 }))).length, 0);
  assert.equal((await slotsOn(tuesday.plus({ days: 5 }))).length, 0);

  const booking = { service, start: slots[0].start, customerName: "Demo booking", phone: "+16125550123" };
  const created = await call("/api/booking/reservations", "POST", booking);
  assert.equal(created.status, 201);
  const { appointment } = await created.json();
  assert.equal((await call("/api/booking/reservations", "POST", booking)).status, 409);
  assert.equal((await call("/api/admin/appointments")).status, 401);

  const signIn = (credentials) => call("/api/admin/auth/login", "POST", credentials);
  async function loginAsAdmin(credentials) {
    const response = await signIn(credentials);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.staff.role, "Admin");
    assert.equal(body.staff.id, initialId);
    assert.match(response.headers.get("set-cookie"), /HttpOnly.*SameSite=Strict/);
    return {
      Cookie: response.headers.get("set-cookie").split(";")[0],
      "X-CSRF-Token": body.csrf,
    };
  }
  const oldAuth = await loginAsAdmin(initial);
  // Older demo databases have no saved administrator ID and may have other admins.
  await mongoose.connection.db.collection("demosetup").updateOne(
    { _id: "salon-demo-v1" }, { $unset: { adminId: "" } },
  );
  const otherAdmin = await Staff.create({
    name: "Other Demo Staff",
    role: "Admin",
    email: "other@example.test",
    passwordHash: await hashPassword("test-other-demo-admin"),
  });
  const otherBefore = await Staff.findById(otherAdmin.id).select("+passwordHash").lean();
  await assert.rejects(setDemoAdministrator({ ...replacement, email: "artist@salon-demo.test" }), { code: 11000 });
  assert.equal((await call("/api/admin/auth/me", "GET", undefined, oldAuth)).status, 200);
  await setDemoAdministrator(replacement);
  assert.equal(await Staff.countDocuments({ role: "Admin" }), 2);
  assert.deepEqual(await Staff.findById(otherAdmin.id).select("+passwordHash").lean(), otherBefore);
  assert.equal((await signIn(initial)).status, 401);
  const wrong = await signIn({ ...replacement, password: initial.password });
  assert.equal(wrong.status, 401);
  assert.equal((await wrong.json()).error, "Invalid email or password");
  assert.equal((await call("/api/admin/auth/me", "GET", undefined, oldAuth)).status, 401);
  const auth = await loginAsAdmin(replacement);
  assert.equal((await call("/api/admin/reports", "GET", undefined, auth)).status, 200);
  const appointments = await (await call("/api/admin/appointments", "GET", undefined, auth)).json();
  assert.equal(appointments.appointments[0].reference, appointment.reference);
  const checkedIn = await call("/api/admin/appointments/" + appointment.reference, "PATCH", {
    action: "status", status: "Checked In",
  }, auth);
  assert.equal(checkedIn.status, 200);

  const walkIn = await call("/api/admin/queue/tickets", "POST", {
    service, customerName: "Demo walk-in", phone: "+16125550124",
  }, auth);
  assert.equal(walkIn.status, 201);
  assert.equal((await walkIn.json()).ticket.source, "Walk-in");
  assert.equal((await call("/api/admin/queue/call-next", "POST", {}, auth)).status, 200);
  assert.equal((await call("/api/admin/auth/logout", "POST", {}, auth)).status, 200);
  assert.equal((await call("/api/admin/appointments", "GET", undefined, auth)).status, 401);
  assert.equal(await seedDemo(seed), false);
  assert.equal(await Appointment.countDocuments(), 1);
  assert.equal(await mongoose.connection.db.collection("queuetickets").countDocuments(), 1);
  assert.equal(await mongoose.connection.db.collection("services").countDocuments(), 3);
  assert.equal(await mongoose.connection.db.collection("schedules").countDocuments(), 5);
});
