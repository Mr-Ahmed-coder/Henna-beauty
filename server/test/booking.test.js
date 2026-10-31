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
  Appointment,
  ArtistProfile,
  BookingPolicy,
} from "../src/models/booking.js";
import { hashPassword } from "../src/security.js";
import { availability } from "../src/booking/engine.js";
const origin = "http://127.0.0.1:5173";
test("appointment booking integration", async (t) => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await initializeModels();
  let server = createApp().listen(0, "127.0.0.1");
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
    const res = await fetch(base + path, {
      method,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(auth ? { Cookie: auth.cookie, "X-CSRF-Token": auth.csrf } : {}),
        ...(token ? { "X-Booking-Token": token } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: res.status,
      data: await res.json(),
      cookie: res.headers.get("set-cookie"),
    };
  }
  const password = "test-reservation-password";
  const passwordHash = await hashPassword(password);
  const [admin, desk, one, two, unqualified] = await Staff.create([
    { name: "Owner", email: "owner@booking.test", role: "Admin", passwordHash },
    {
      name: "Desk",
      email: "desk@booking.test",
      role: "Receptionist",
      passwordHash,
    },
    { name: "Artist A", email: "a@booking.test", role: "Artist", passwordHash },
    { name: "Artist B", email: "b@booking.test", role: "Artist", passwordHash },
    {
      name: "No qualifications",
      email: "c@booking.test",
      role: "Artist",
      passwordHash,
    },
  ]);
  const [short, long, inactive] = await Service.create([
    {
      name: "Henna",
      category: "Henna artistry",
      description: "Test catalogue description",
      imageUrl: "https://images.example.test/henna.jpg",
      priceMinor: 30000,
      durationMinutes: 30,
    },
    { name: "Bridal", priceMinor: 90000, durationMinutes: 90 },
    { name: "Hidden", priceMinor: 1, durationMinutes: 15, active: false },
  ]);
  const hours = Array.from({ length: 7 }, (_, day) => ({
    day,
    closed: false,
    open: "09:00",
    close: "17:00",
  }));
  await Settings.create({
    name: "Integration salon",
    currency: "UGX",
    timezone: "Africa/Kampala",
    hours,
  });
  await BookingPolicy.create({
    minimumNoticeMinutes: 0,
    cancellationNoticeHours: 0,
    reschedulingNoticeHours: 0,
    advanceDays: 90,
  });
  await ArtistProfile.create([
    {
      staff: one._id,
      services: [short._id, long._id],
      breaks: hours.map((h) => ({ day: h.day, start: "12:00", end: "13:00" })),
    },
    { staff: two._id, services: [short._id] },
  ]);
  await Schedule.create(
    [one, two, unqualified].flatMap((person) =>
      hours.map((h) => ({
        staff: person._id,
        day: h.day,
        available: true,
        start: "09:00",
        end: "17:00",
      })),
    ),
  );
  const date = DateTime.now()
    .setZone("Africa/Kampala")
    .plus({ days: 2 })
    .toISODate();
  const utc = (time) =>
    DateTime.fromISO(date + "T" + time, { zone: "Africa/Kampala" })
      .toUTC()
      .toISO();
  const body = (
    time = "10:00",
    artist = String(one._id),
    service = String(short._id),
  ) => ({
    service,
    artist,
    start: utc(time),
    customerName: "Customer Test",
    phone: "+256 700 123456",
    notes: "Test only",
  });
  async function login(person) {
    const res = await api("/api/admin/auth/login", {
      method: "POST",
      body: { email: person.email, password },
    });
    assert.equal(res.status, 200);
    return { cookie: res.cookie.split(";")[0], csrf: res.data.csrf };
  }
  const adminAuth = await login(admin),
    deskAuth = await login(desk),
    artistAuth = await login(one),
    otherAuth = await login(two);
  let saved;
  await t.test(
    "live catalog, qualified artists, duration, business hours, breaks and timezone",
    async () => {
      const catalog = await api("/api/booking/catalog");
      assert.equal(catalog.status, 200);
      assert.equal(catalog.data.services.length, 2);
      const henna = catalog.data.services.find(
        (service) => service._id === String(short._id),
      );
      assert.equal(henna.category, "Henna artistry");
      assert.equal(henna.description, "Test catalogue description");
      assert.equal(henna.imageUrl, "https://images.example.test/henna.jpg");
      assert.equal(henna.qualifiedArtistCount, 2);
      assert.equal(henna.scheduledArtistCount, 2);
      assert.equal(henna.bookable, true);
      assert.equal(
        catalog.data.services.some((s) => s._id === String(inactive._id)),
        false,
      );
      assert.equal(catalog.data.artists[0].email, undefined);
      const slots = await api(
        "/api/booking/availability?" +
          new URLSearchParams({ service: String(long._id), date }),
      );
      assert.equal(slots.status, 200);
      assert.ok(slots.data.slots.length > 0);
      assert.ok(slots.data.slots.every((s) => s.artist === String(one._id)));
      assert.equal(
        slots.data.slots.some((s) => s.start === utc("11:00")),
        false,
      );
      assert.equal(
        slots.data.slots.some((s) => s.start === utc("15:30")),
        true,
      );
      assert.equal(
        slots.data.slots.some((s) => s.start === utc("16:00")),
        false,
      );
      assert.equal(slots.data.slots[0].start, utc("09:00"));
      for (const value of [
        body("12:00"),
        body("08:45"),
        body("16:45"),
        body("10:00", String(unqualified._id)),
      ])
        assert.equal(
          (
            await api("/api/booking/reservations", {
              method: "POST",
              body: value,
            })
          ).status,
          409,
        );
      assert.equal(
        (
          await api("/api/booking/reservations", {
            method: "POST",
            body: { ...body(), start: "2000-01-01T00:00:00.000Z" },
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await api("/api/booking/reservations", {
            method: "POST",
            body: { ...body(), customerName: " " },
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await api("/api/booking/reservations", {
            method: "POST",
            body: body(),
            headers: { Origin: "https://evil.test" },
          })
        ).status,
        403,
      );
    },
  );
  await t.test(
    "closed days, unavailable shifts, inactive artists and notice periods remove availability",
    async () => {
      const weekday = DateTime.fromISO(date).weekday % 7;
      await Settings.updateOne(
        { _id: "salon" },
        {
          $set: {
            hours: hours.map((h) => ({ ...h, closed: h.day === weekday })),
          },
        },
      );
      assert.equal(
        (await availability({ service: String(short._id), date })).slots.length,
        0,
      );
      await Settings.updateOne({ _id: "salon" }, { $set: { hours } });
      await Schedule.updateOne(
        { staff: one._id, day: weekday },
        { $set: { available: false } },
      );
      assert.equal(
        (
          await availability({
            service: String(short._id),
            date,
            artist: String(one._id),
          })
        ).slots.length,
        0,
      );
      await Schedule.updateMany(
        { staff: one._id },
        { $set: { available: false } },
      );
      const unavailableCatalog = await api("/api/booking/catalog");
      assert.equal(
        unavailableCatalog.data.services.find(
          (service) => service._id === String(long._id),
        ).bookable,
        false,
      );
      await Schedule.updateMany(
        { staff: one._id },
        { $set: { available: true } },
      );
      await Staff.updateOne({ _id: one._id }, { $set: { active: false } });
      assert.equal(
        (
          await availability({
            service: String(short._id),
            date,
            artist: String(one._id),
          })
        ).slots.length,
        0,
      );
      await Staff.updateOne({ _id: one._id }, { $set: { active: true } });
      await BookingPolicy.updateOne(
        { _id: "salon" },
        { $set: { minimumNoticeMinutes: 10080 } },
      );
      assert.equal(
        (await availability({ service: String(short._id), date })).slots.length,
        0,
      );
      await BookingPolicy.updateOne(
        { _id: "salon" },
        { $set: { minimumNoticeMinutes: 0 } },
      );
    },
  );
  await t.test(
    "simultaneous overlapping requests permit one reservation per artist",
    async () => {
      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          api("/api/booking/reservations", { method: "POST", body: body() }),
        ),
      );
      assert.equal(results.filter((r) => r.status === 201).length, 1);
      assert.equal(results.filter((r) => r.status === 409).length, 5);
      saved = results.find((r) => r.status === 201).data;
      assert.equal(saved.appointment.status, "Confirmed");
      assert.equal(saved.appointment.accessHash, undefined);
      assert.ok(saved.token.length >= 64);
      assert.equal(
        (
          await api("/api/booking/reservations", {
            method: "POST",
            body: body("10:15"),
          })
        ).status,
        409,
      );
      const second = await api("/api/booking/reservations", {
        method: "POST",
        body: body("10:00", ""),
      });
      assert.equal(second.status, 201);
      assert.equal(second.data.appointment.artist, String(two._id));
      const slots = await api(
        "/api/booking/availability?" +
          new URLSearchParams({ service: String(short._id), date }),
      );
      assert.equal(
        slots.data.slots.some((s) => s.start === utc("10:00")),
        false,
      );
    },
  );
  await t.test(
    "private access, cancellation/reschedule rules, rollback on conflict and reassignment",
    async () => {
      const path = "/api/booking/reservations/" + saved.appointment.reference;
      assert.equal((await api(path)).status, 404);
      assert.equal((await api(path, { token: "wrong" })).status, 404);
      assert.equal(
        (await api(path, { token: saved.token })).data.appointment.customerName,
        "Customer Test",
      );
      await BookingPolicy.updateOne(
        { _id: "salon" },
        { $set: { cancellationEnabled: false, reschedulingEnabled: false } },
      );
      assert.equal(
        (
          await api(path, {
            method: "PATCH",
            token: saved.token,
            body: { action: "status", status: "Cancelled" },
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await api(path, {
            method: "PATCH",
            token: saved.token,
            body: { action: "reschedule", start: utc("11:00") },
          })
        ).status,
        409,
      );
      await BookingPolicy.updateOne(
        { _id: "salon" },
        {
          $set: {
            cancellationEnabled: true,
            reschedulingEnabled: true,
            cancellationNoticeHours: 720,
            reschedulingNoticeHours: 720,
          },
        },
      );
      assert.equal(
        (
          await api(path, {
            method: "PATCH",
            token: saved.token,
            body: { action: "status", status: "Cancelled" },
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await api(path, {
            method: "PATCH",
            token: saved.token,
            body: { action: "reschedule", start: utc("11:00") },
          })
        ).status,
        409,
      );
      await BookingPolicy.updateOne(
        { _id: "salon" },
        { $set: { cancellationNoticeHours: 0, reschedulingNoticeHours: 0 } },
      );
      const changed = await api(path, {
        method: "PATCH",
        token: saved.token,
        body: {
          action: "reschedule",
          start: utc("11:00"),
          artist: String(two._id),
        },
      });
      assert.equal(changed.status, 200);
      assert.equal(changed.data.artist, String(two._id));
      const rejected = await api(path, {
        method: "PATCH",
        token: saved.token,
        body: {
          action: "reschedule",
          start: utc("10:00"),
          artist: String(two._id),
        },
      });
      assert.equal(rejected.status, 409);
      assert.equal(
        (
          await Appointment.findOne({ reference: saved.appointment.reference })
        ).start.toISOString(),
        utc("11:00"),
      );
      const cancelled = await api(path, {
        method: "PATCH",
        token: saved.token,
        body: { action: "status", status: "Cancelled" },
      });
      assert.equal(cancelled.status, 200);
      assert.equal(cancelled.data.status, "Cancelled");
      const slots = await api(
        "/api/booking/availability?" +
          new URLSearchParams({
            service: String(short._id),
            date,
            artist: String(two._id),
          }),
      );
      assert.equal(
        slots.data.slots.some((s) => s.start === utc("11:00")),
        true,
      );
    },
  );
  let manual;
  await t.test(
    "staff authorization, search, approval and defined status transitions",
    async () => {
      assert.equal((await api("/api/admin/appointments")).status, 401);
      assert.equal(
        (await api("/api/admin/appointments?today=1", { auth: deskAuth }))
          .status,
        200,
      );
      assert.equal(
        (await api("/api/admin/appointments?today=no", { auth: deskAuth }))
          .status,
        400,
      );
      assert.equal(
        (
          await api("/api/admin/appointments", {
            method: "POST",
            auth: artistAuth,
            body: body("14:00"),
          })
        ).status,
        403,
      );
      await BookingPolicy.updateOne(
        { _id: "salon" },
        { $set: { approvalRequired: true } },
      );
      const result = await api("/api/admin/appointments", {
        method: "POST",
        auth: deskAuth,
        body: body("14:00"),
      });
      assert.equal(result.status, 201);
      manual = result.data.appointment;
      assert.equal(manual.status, "Pending");
      const path = "/api/admin/appointments/" + manual.reference;
      assert.equal(
        (
          await api(path, {
            method: "PATCH",
            auth: otherAuth,
            body: { action: "status", status: "Confirmed" },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await api(path, {
            method: "PATCH",
            auth: artistAuth,
            body: { action: "status", status: "Confirmed" },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await api(path, {
            method: "PATCH",
            auth: deskAuth,
            body: { action: "status", status: "Completed" },
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await api(path, {
            method: "PATCH",
            auth: deskAuth,
            body: { action: "status", status: "Confirmed" },
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await api(path, {
            method: "PATCH",
            auth: artistAuth,
            body: { action: "status", status: "No-Show" },
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await api(path, {
            method: "PATCH",
            auth: artistAuth,
            body: { action: "reschedule", start: utc("15:00") },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await api(path, {
            method: "PATCH",
            auth: deskAuth,
            body: {
              action: "reschedule",
              start: utc("15:00"),
              artist: String(two._id),
            },
          })
        ).status,
        200,
      );
      const own = await api("/api/admin/appointments", { auth: artistAuth });
      assert.ok(
        own.data.appointments.every((a) => a.artist === String(one._id)),
      );
      const search = await api(
        "/api/admin/appointments?" +
          new URLSearchParams({ q: manual.reference }),
        { auth: deskAuth },
      );
      assert.equal(search.data.total, 1);
      for (const body of [
        { minimumNoticeMinutes: null },
        { approvalRequired: null },
      ]) {
        assert.equal(
          (
            await api("/api/admin/booking-policy", {
              method: "PUT",
              auth: adminAuth,
              body,
            })
          ).status,
          400,
        );
      }
      assert.equal(
        (await BookingPolicy.findById("salon")).minimumNoticeMinutes,
        0,
      );
      assert.equal(
        (
          await api("/api/admin/booking-policy", {
            method: "PUT",
            auth: deskAuth,
            body: { minimumNoticeMinutes: 0 },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await api("/api/admin/artist-profiles/" + one._id, {
            method: "PUT",
            auth: adminAuth,
            body: {
              services: [String(short._id)],
              breaks: [{ day: 1, start: "14:00", end: "13:00" }],
            },
          })
        ).status,
        400,
      );
    },
  );
  await t.test(
    "transactional reschedule collisions, lifecycle and database persistence",
    async () => {
      const results = await Promise.all([
        api("/api/admin/appointments/" + manual.reference, {
          method: "PATCH",
          auth: deskAuth,
          body: {
            action: "reschedule",
            start: utc("16:00"),
            artist: String(one._id),
          },
        }),
        api("/api/admin/appointments", {
          method: "POST",
          auth: deskAuth,
          body: body("16:00"),
        }),
      ]);
      assert.equal(
        results.filter((r) => r.status === 200 || r.status === 201).length,
        1,
      );
      assert.equal(results.filter((r) => r.status === 409).length, 1);
      // Move a fixture's date into the past to exercise completion/no-show without changing the application clock.
      await Appointment.updateOne(
        { reference: manual.reference },
        {
          $set: {
            start: new Date(Date.now() - 3600000),
            end: new Date(Date.now() - 1800000),
          },
        },
      );
      const current = await Appointment.findOne({
        reference: manual.reference,
      });
      const auth =
        String(current.artist) === String(one._id) ? artistAuth : otherAuth;
      const path = "/api/admin/appointments/" + manual.reference;
      for (const status of ["Checked In", "In Service", "Completed"])
        assert.equal(
          (
            await api(path, {
              method: "PATCH",
              auth,
              body: { action: "status", status },
            })
          ).status,
          200,
        );
      assert.equal(
        (
          await api(path, {
            method: "PATCH",
            auth: deskAuth,
            body: { action: "status", status: "Confirmed" },
          })
        ).status,
        409,
      );
      const count = await Appointment.countDocuments();
      await new Promise((r) => server.close(r));
      await mongoose.disconnect();
      await mongoose.connect(mongo.getUri());
      server = createApp().listen(0, "127.0.0.1");
      await new Promise((r) => server.once("listening", r));
      base = `http://127.0.0.1:${server.address().port}`;
      assert.equal(await Appointment.countDocuments(), count);
      assert.equal(
        (
          await api(
            "/api/booking/reservations/" + saved.appointment.reference,
            { token: saved.token },
          )
        ).data.appointment.status,
        "Cancelled",
      );
    },
  );
  await t.test(
    "daylight saving repeated hours yield distinct real instants and spring gaps do not invent slots",
    async () => {
      await Settings.updateOne(
        { _id: "salon" },
        {
          $set: {
            timezone: "America/New_York",
            hours: hours.map((h) => ({ ...h, open: "00:00", close: "04:00" })),
          },
        },
      );
      await Schedule.updateMany(
        { staff: one._id },
        { $set: { start: "00:00", end: "04:00" } },
      );
      await ArtistProfile.updateOne(
        { staff: one._id },
        { $set: { breaks: [] } },
      );
      const result = await availability(
        {
          service: String(short._id),
          date: "2027-11-07",
          artist: String(one._id),
        },
        null,
        null,
        DateTime.fromISO("2027-11-01T00:00:00Z"),
      );
      const repeated = result.slots.filter((s) => s.label.startsWith("01:00"));
      assert.equal(repeated.length, 2);
      assert.notEqual(repeated[0].start, repeated[1].start);
      const spring = await availability(
        {
          service: String(short._id),
          date: "2027-03-14",
          artist: String(one._id),
        },
        null,
        null,
        DateTime.fromISO("2027-03-01T00:00:00Z"),
      );
      assert.equal(
        spring.slots.some((s) => s.label.startsWith("02:")),
        false,
      );
    },
  );
});
