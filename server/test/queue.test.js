import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { DateTime } from "luxon";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import {
  Staff,
  Service,
  Settings,
  Schedule,
  initializeModels,
} from "../src/models/index.js";
import {
  ArtistProfile,
  Appointment,
  BookingPolicy,
} from "../src/models/booking.js";
import { QueueTicket, QueuePolicy, QueueDay } from "../src/models/queue.js";
import { hashPassword } from "../src/security.js";
const origin = "http://127.0.0.1:5173";
test("hybrid queue integration on a real isolated replica set", async (t) => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await initializeModels();
  const initial = DateTime.now()
    .setZone("Africa/Kampala")
    .plus({ days: 2 })
    .startOf("day")
    .set({ hour: 10 });
  let clock = initial;
  let server = createApp({ queueClock: () => clock }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  let base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((r) => server.close(r));
    await mongoose.disconnect();
    await mongo.stop();
  });
  async function api(
    path,
    { method = "GET", body, auth, token, headers = {} } = {},
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(auth ? { Cookie: auth.cookie, "X-CSRF-Token": auth.csrf } : {}),
        ...(token ? { "X-Queue-Token": token } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get("set-cookie"),
    };
  }
  const password = "queue-integration-password",
    passwordHash = await hashPassword(password);
  const [owner, reception, a, b] = await Staff.create([
    { name: "Owner", email: "owner@queue.test", role: "Admin", passwordHash },
    {
      name: "Reception",
      email: "desk@queue.test",
      role: "Receptionist",
      passwordHash,
    },
    { name: "Artist A", email: "a@queue.test", role: "Artist", passwordHash },
    { name: "Artist B", email: "b@queue.test", role: "Artist", passwordHash },
  ]);
  const [short, long] = await Service.create([
    { name: "Henna", priceMinor: 25000, durationMinutes: 30 },
    { name: "Bridal", priceMinor: 85000, durationMinutes: 90 },
  ]);
  const hours = Array.from({ length: 7 }, (_, day) => ({
    day,
    closed: false,
    open: "09:00",
    close: "17:00",
  }));
  await Settings.create({
    name: "Queue integration salon",
    currency: "UGX",
    timezone: "Africa/Kampala",
    hours,
  });
  await BookingPolicy.create({ minimumNoticeMinutes: 0 });
  await ArtistProfile.create([
    {
      staff: a._id,
      services: [short._id, long._id],
      breaks: hours.map((h) => ({ day: h.day, start: "12:00", end: "13:00" })),
    },
    { staff: b._id, services: [short._id] },
  ]);
  await Schedule.create(
    [a, b].flatMap((person) =>
      hours.map((h) => ({
        staff: person._id,
        day: h.day,
        available: true,
        start: "09:00",
        end: "17:00",
      })),
    ),
  );
  async function login(person) {
    const result = await api("/api/admin/auth/login", {
      method: "POST",
      body: { email: person.email, password },
    });
    assert.equal(result.status, 200);
    return { cookie: result.cookie.split(";")[0], csrf: result.data.csrf };
  }
  const admin = await login(owner),
    desk = await login(reception),
    artistA = await login(a),
    artistB = await login(b);
  let phoneNumber = 0;
  const customer = (service = short, phone) => ({
    service: String(service._id),
    customerName: "Queue customer",
    phone: phone || "+2567" + String(++phoneNumber).padStart(8, "0"),
    notes: "test only",
  });
  const join = (source = "walk-in", service = short, phone) =>
    api(
      source === "online" ? "/api/queue/tickets" : "/api/admin/queue/tickets",
      {
        method: "POST",
        body: customer(service, phone),
        ...(source === "walk-in" ? { auth: desk } : {}),
      },
    );
  const call = (person) =>
    api("/api/admin/queue/call-next", {
      method: "POST",
      auth: desk,
      body: person ? { artist: String(person._id) } : {},
    });
  const change = (ticket, action, auth = desk) =>
    api("/api/admin/queue/tickets/" + ticket.reference, {
      method: "PATCH",
      auth,
      body: { action },
    });
  const privateView = (result) =>
    api("/api/queue/tickets/" + result.ticket.reference, {
      token: result.token,
    });
  const at = (time) =>
    DateTime.fromISO(initial.toISODate() + "T" + time, {
      zone: "Africa/Kampala",
    })
      .toUTC()
      .toISO();
  async function reservation(time = "11:00", person = a, duration = 30) {
    return Appointment.create({
      reference: "AP-" + Math.random(),
      accessHash: "test-only",
      service: short._id,
      serviceName: short.name,
      priceMinor: 25000,
      currency: "UGX",
      durationMinutes: duration,
      artist: person._id,
      artistName: person.name,
      start: at(time),
      end: DateTime.fromISO(at(time)).plus({ minutes: duration }).toJSDate(),
      timezone: "Africa/Kampala",
      customerName: "Appointment customer",
      phone: "+256700000000",
      status: "Confirmed",
    });
  }
  t.beforeEach(async () => {
    clock = initial;
    await QueueTicket.deleteMany({});
    await QueueDay.deleteMany({});
    await QueuePolicy.deleteMany({});
    await QueuePolicy.create({});
    await Appointment.deleteMany({});
    await Staff.updateMany({}, { $set: { active: true } });
    await Settings.updateOne({ _id: "salon" }, { $set: { hours } });
    await Schedule.updateMany({}, { $set: { available: true } });
  });
  await t.test(
    "online and walk-in tickets, private access, duplicate prevention and fair positions",
    async () => {
      const online = await join("online", short, "+256 700 123456");
      assert.equal(online.status, 201);
      assert.equal(online.data.ticket.status, "Waiting");
      assert.equal(online.data.ticket.accessHash, undefined);
      assert.equal(online.data.ticket.phoneHash, undefined);
      assert.equal(online.data.token.length, 64);
      assert.equal((await join("walk-in", short, "+256700123456")).status, 409);
      const walk = await join();
      assert.equal(walk.status, 201);
      assert.equal(walk.data.ticket.status, "Checked In");
      assert.ok(walk.data.ticket.checkedInAt);
      const one = await privateView(online.data),
        two = await privateView(walk.data);
      assert.equal(one.data.ticket.position, 1);
      assert.equal(two.data.ticket.position, 2);
      assert.equal(
        one.data.notifications.some(
          (notification) => notification.type === "queue.joined",
        ),
        true,
      );
      assert.equal(JSON.stringify(one.data.notifications).includes("123456"), false);
      assert.equal(
        (
          await api(
            "/api/queue/tickets/" + online.data.ticket.reference + "/notification-preferences",
            {
              method: "PUT",
              body: { inApp: false, sms: false, whatsapp: false },
            },
          )
        ).status,
        404,
      );
      assert.equal(one.data.ticket.approximateWaitMinutes, 0);
      assert.equal(
        (await api("/api/queue/tickets/" + online.data.ticket.reference))
          .status,
        404,
      );
      assert.equal(
        (
          await api("/api/queue/tickets/" + online.data.ticket.reference, {
            token: "wrong",
          })
        ).status,
        404,
      );
      const catalog = await api("/api/queue/catalog");
      assert.equal(catalog.data.tickets, undefined);
      assert.ok(!JSON.stringify(catalog.data).includes("123456"));
      assert.equal(
        catalog.data.services.find((service) => service._id === String(short._id))
          .bookable,
        true,
      );
      const cancelled = await api(
        "/api/queue/tickets/" + online.data.ticket.reference,
        {
          method: "PATCH",
          token: online.data.token,
          body: { action: "cancel" },
        },
      );
      assert.equal(cancelled.data.status, "Cancelled");
      assert.equal((await privateView(walk.data)).data.ticket.position, 1);
      assert.equal((await join("online", short, "+256700123456")).status, 201);
    },
  );
  await t.test(
    "FIFO among eligible customers, appointment priority, breaks and qualifications",
    async () => {
      await reservation("11:00", a, 60);
      const first = await join("online", long),
        second = await join();
      assert.equal(first.status, 201);
      assert.equal(second.status, 201);
      const estimate = await privateView(first.data);
      assert.ok(
        Date.parse(estimate.data.ticket.estimatedCallAt) >=
          Date.parse(at("13:00")),
      );
      const result = await call(a);
      assert.equal(result.status, 200);
      assert.equal(result.data.reference, second.data.ticket.reference);
      assert.ok(result.data.end <= at("11:00"));
      assert.equal((await call(b)).status, 409); // Only the older long service remains, and B is not qualified.
      clock = initial.set({ hour: 12, minute: 15 });
      const breakCall = await call(a);
      assert.equal(breakCall.status, 409, JSON.stringify(breakCall.data)); // A's recurring break.
      clock = initial.set({ hour: 13 });
      assert.equal((await call(a)).data.reference, first.data.ticket.reference);
    },
  );
  await t.test(
    "simultaneous calls assign distinct customers to distinct artists",
    async () => {
      for (let i = 0; i < 4; i++) assert.equal((await join()).status, 201);
      const results = await Promise.all(
        Array.from({ length: 4 }, () => call()),
      );
      const successes = results.filter((r) => r.status === 200);
      assert.equal(successes.length, 2);
      assert.equal(new Set(successes.map((r) => r.data.reference)).size, 2);
      assert.equal(new Set(successes.map((r) => r.data.artist)).size, 2);
      assert.equal(await QueueTicket.countDocuments({ status: "Called" }), 2);
    },
  );
  await t.test(
    "arrival, grace expiration, missed turns and cross-device synchronization",
    async () => {
      const online = (await join("online")).data;
      const assigned = await call(a);
      assert.equal(assigned.status, 200);
      const called = await privateView(online);
      assert.equal(called.data.ticket.status, "Called");
      assert.equal(
        called.data.notifications.some(
          (notification) => notification.type === "queue.called",
        ),
        true,
      );
      assert.equal((await change(assigned.data, "start")).status, 409);
      assert.equal((await change(assigned.data, "missed")).status, 409);
      clock = initial.plus({ minutes: 24 });
      assert.equal((await change(assigned.data, "check-in")).status, 200);
      assert.equal(
        (await privateView(online)).data.ticket.checkedInAt,
        new Date(clock.toISO()).toISOString(),
      );
      clock = initial.plus({ minutes: 26 });
      const secondDevice = await privateView(online);
      assert.equal(secondDevice.data.ticket.status, "Missed");
      assert.equal(secondDevice.data.notifications.filter((item) => item.type === "queue.missed").length, 1);
      assert.equal((await change(assigned.data, "start")).status, 409);
      assert.equal(
        (await change(assigned.data, "missed")).data.status,
        "Missed",
      );
      assert.equal(await QueueTicket.countDocuments({ active: true }), 0);
    },
  );
  await t.test(
    "service start/complete, overdue protection and artist permissions",
    async () => {
      const first = (await join()).data;
      await call(a);
      assert.equal((await change(first.ticket, "start", artistB)).status, 403);
      assert.equal((await change(first.ticket, "start", artistA)).status, 200);
      assert.equal((await privateView(first)).data.ticket.status, "In Service");
      assert.equal(
        (
          await api("/api/queue/tickets/" + first.ticket.reference, {
            method: "PATCH",
            token: first.token,
            body: { action: "cancel" },
          })
        ).status,
        409,
      );
      clock = initial.plus({ minutes: 45 });
      assert.equal((await privateView(first)).data.ticket.overdue, true);
      assert.equal((await join()).status, 201);
      assert.equal((await call(a)).status, 409);
      assert.equal((await call(b)).status, 200);
      assert.equal(
        (await change(first.ticket, "complete", artistA)).status,
        200,
      );
      assert.equal((await privateView(first)).data.ticket.status, "Completed");
      assert.equal((await change(first.ticket, "start", artistA)).status, 409);
    },
  );
  await t.test(
    "queue calls and appointments race on the same lock without overlapping",
    async () => {
      const ticket = (await join()).data.ticket;
      const result = await Promise.all([
        call(a),
        api("/api/booking/reservations", {
          method: "POST",
          body: {
            service: String(short._id),
            artist: String(a._id),
            start: at("10:15"),
            customerName: "Race booking",
            phone: "+256700123459",
          },
        }),
      ]);
      assert.equal(
        result.filter((r) => r.status === 200 || r.status === 201).length,
        1,
      );
      assert.equal(result.filter((r) => r.status === 409).length, 1);
      if (result[0].status === 200) {
        const slots = await api(
          "/api/booking/availability?" +
            new URLSearchParams({
              service: String(short._id),
              date: initial.toISODate(),
              artist: String(a._id),
            }),
        );
        assert.equal(
          slots.data.slots.some((s) => s.start === at("10:15")),
          false,
        );
        assert.equal((await change(ticket, "start")).status, 200);
      }
    },
  );
  await t.test(
    "early appointment starts and queue services cannot double-assign an artist",
    async () => {
      const ticket = (await join()).data.ticket;
      await call(a);
      await change(ticket, "start");
      const appointment = await reservation("14:00", a);
      const path = "/api/admin/appointments/" + appointment.reference;
      assert.equal(
        (
          await api(path, {
            method: "PATCH",
            auth: desk,
            body: { action: "status", status: "Checked In" },
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await api(path, {
            method: "PATCH",
            auth: desk,
            body: { action: "status", status: "In Service" },
          })
        ).status,
        409,
      );
      await change(ticket, "complete");
      assert.equal(
        (
          await api(path, {
            method: "PATCH",
            auth: desk,
            body: { action: "status", status: "In Service" },
          })
        ).status,
        200,
      );
      assert.equal((await join()).status, 201);
      assert.equal((await call(a)).status, 409);
      assert.equal((await call(b)).status, 200);
    },
  );
  await t.test(
    "operating hours, cutoff, closing expiry, queue policy and unauthorized actions",
    async () => {
      clock = initial.set({ hour: 8 });
      assert.equal((await join("online")).status, 409);
      clock = initial.set({ hour: 16, minute: 31 });
      assert.equal((await join()).status, 409);
      clock = initial;
      assert.equal((await api("/api/admin/queue")).status, 401);
      assert.equal(
        (
          await api("/api/admin/queue/call-next", {
            method: "POST",
            auth: artistA,
            body: {},
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await api("/api/admin/queue/tickets", {
            method: "POST",
            auth: artistA,
            body: customer(),
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await api("/api/admin/queue-policy", {
            method: "PUT",
            auth: desk,
            body: { enabled: false },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await api("/api/admin/queue-policy", {
            method: "PUT",
            auth: admin,
            body: { graceMinutes: null },
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await api("/api/queue/tickets", {
            method: "POST",
            body: customer(),
            headers: { Origin: "https://evil.test" },
          })
        ).status,
        403,
      );
      await QueuePolicy.updateOne(
        { _id: "salon" },
        { $set: { remoteEnabled: false } },
      );
      assert.equal((await join("online")).status, 409);
      const walk = (await join()).data;
      assert.equal(
        (await api("/api/admin/queue", { auth: artistA })).data.tickets.length,
        0,
      );
      clock = initial.set({ hour: 17 });
      assert.equal((await privateView(walk)).data.ticket.status, "Missed");
    },
  );
  await t.test(
    "active tickets and private access persist across API restart and reconnect",
    async () => {
      const saved = (await join("online")).data;
      await new Promise((r) => server.close(r));
      await mongoose.disconnect();
      await mongoose.connect(mongo.getUri());
      server = createApp({ queueClock: () => clock }).listen(0, "127.0.0.1");
      await new Promise((r) => server.once("listening", r));
      base = `http://127.0.0.1:${server.address().port}`;
      const res = await privateView(saved);
      assert.equal(res.status, 200);
      assert.equal(res.data.ticket.reference, saved.ticket.reference);
      assert.equal(res.data.ticket.position, 1);
    },
  );
});
