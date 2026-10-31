import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import {
  Staff,
  Session,
  Service,
  Schedule,
  Settings,
  initializeModels,
} from "../src/models/index.js";
import { bootstrapAdmin } from "../src/bootstrap.js";
const origin = "http://127.0.0.1:5173";
test("staff authentication, RBAC, CRUD, persistence and session security", async (t) => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await initializeModels();
  let server = createApp().listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  let base = `http://127.0.0.1:${server.address().port}/api/admin`;
  t.after(async () => {
    await new Promise((r) => server.close(r));
    await mongoose.disconnect();
    await mongo.stop();
  });
  async function call(path, method = "GET", body, auth = {}, custom = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(auth.cookie
          ? { Cookie: auth.cookie, "X-CSRF-Token": auth.csrf }
          : {}),
        ...custom,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get("set-cookie"),
    };
  }
  const password = "test-only-long-password-128";
  const owner = await bootstrapAdmin({
    name: "Test Owner",
    email: "owner@example.test",
    password,
  });
  await assert.rejects(() =>
    bootstrapAdmin({ name: "Other", email: "other@example.test", password }),
  );
  assert.equal((await call("/staff")).status, 401);
  assert.equal(
    (
      await call("/auth/login", "POST", {
        email: "owner@example.test",
        password: "wrong",
      })
    ).status,
    401,
  );
  assert.equal(
    (await call("/auth/login", "POST", { email: { $ne: null }, password }))
      .status,
    400,
  );
  const login = await call("/auth/login", "POST", {
    email: "owner@example.test",
    password,
  });
  assert.equal(login.status, 200);
  assert.match(login.cookie, /HttpOnly/);
  assert.match(login.cookie, /SameSite=Strict/);
  assert.equal(login.data.staff.passwordHash, undefined);
  const admin = { cookie: login.cookie.split(";")[0], csrf: login.data.csrf };
  assert.equal(
    (
      await call("/services", "POST", { name: "No CSRF" }, admin, {
        "X-CSRF-Token": "",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/services", "POST", {}, admin, {
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
  const receptionist = await call(
    "/staff",
    "POST",
    {
      name: "Desk",
      email: "desk@example.test",
      password,
      role: "Receptionist",
    },
    admin,
  );
  assert.equal(receptionist.status, 201);
  const artist = await call(
    "/staff",
    "POST",
    { name: "Artist", email: "artist@example.test", password, role: "Artist" },
    admin,
  );
  assert.equal(artist.status, 201);
  assert.equal(
    (
      await call(
        "/staff",
        "POST",
        {
          name: "Duplicate",
          email: "artist@example.test",
          password,
          role: "Artist",
        },
        admin,
      )
    ).status,
    409,
  );
  assert.notEqual(
    (await Staff.findById(artist.data.id).select("+passwordHash")).passwordHash,
    password,
  );
  async function signIn(email) {
    const res = await call("/auth/login", "POST", { email, password });
    assert.equal(res.status, 200);
    return { cookie: res.cookie.split(";")[0], csrf: res.data.csrf };
  }
  const desk = await signIn("desk@example.test"),
    art = await signIn("artist@example.test");
  for (const auth of [desk, art])
    for (const resource of ["staff", "services", "schedules", "settings"])
      assert.equal(
        (
          await call(
            "/" + resource,
            resource === "settings" ? "PUT" : "POST",
            {},
            auth,
          )
        ).status,
        403,
      );
  assert.equal((await call("/staff", "GET", null, art)).data.length, 1);
  assert.equal(
    (await call("/staff/" + owner.id, "PATCH", { role: "Artist" }, admin))
      .status,
    409,
  );
  assert.equal(
    (await call("/staff/" + owner.id, "DELETE", {}, admin)).status,
    409,
  );
  assert.equal(
    (
      await call(
        "/services",
        "POST",
        { name: "Henna", priceMinor: -1, durationMinutes: 30 },
        admin,
      )
    ).status,
    400,
  );
  const service = await call(
    "/services",
    "POST",
    { name: "Henna", priceMinor: 25000, durationMinutes: 60 },
    admin,
  );
  assert.equal(service.status, 201);
  assert.equal(
    (
      await call(
        "/services/" + service.data._id,
        "PATCH",
        { priceMinor: 30000 },
        admin,
      )
    ).data.priceMinor,
    30000,
  );
  const hours = Array.from({ length: 7 }, (_, day) => ({
    day,
    closed: day === 0,
    open: "09:00",
    close: "17:00",
  }));
  assert.equal(
    (
      await call(
        "/settings",
        "PUT",
        {
          name: "Test salon",
          currency: "UGX",
          timezone: "Africa/Kampala",
          hours,
        },
        admin,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/settings",
        "PUT",
        { name: "Bad", currency: "UGX", timezone: "Invalid/Zone", hours },
        admin,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "/settings",
        "PUT",
        {
          name: "Bad",
          currency: "UGX",
          timezone: "UTC",
          hours: hours.slice(1),
        },
        admin,
      )
    ).status,
    400,
  );
  const shift = await call(
    "/schedules",
    "POST",
    {
      staff: artist.data.id,
      day: 1,
      start: "09:00",
      end: "17:00",
      available: true,
    },
    admin,
  );
  assert.equal(shift.status, 201);
  const otherShift = await call(
    "/schedules",
    "POST",
    {
      staff: receptionist.data.id,
      day: 2,
      start: "10:00",
      end: "16:00",
      available: true,
    },
    admin,
  );
  assert.equal(otherShift.status, 201);
  for (const resource of [
    "staff/" + owner.id,
    "services/" + service.data._id,
    "schedules/" + otherShift.data._id,
  ])
    for (const method of ["PATCH", "DELETE"])
      assert.equal((await call("/" + resource, method, {}, art)).status, 403);
  assert.equal((await call("/schedules", "GET", null, art)).data.length, 1);
  assert.equal(
    (await call("/schedules/" + otherShift.data._id, "DELETE", {}, admin))
      .status,
    200,
  );
  assert.equal(
    (
      await call(
        "/schedules",
        "POST",
        {
          staff: artist.data.id,
          day: 1,
          start: "09:00",
          end: "17:00",
          available: true,
        },
        admin,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        "/schedules/" + shift.data._id,
        "PATCH",
        { end: "08:00" },
        admin,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "/schedules/" + shift.data._id,
        "PATCH",
        { available: false },
        admin,
      )
    ).data.available,
    false,
  );
  assert.equal((await call("/schedules", "GET", null, art)).data.length, 1);
  assert.equal((await call("/schedules", "GET", null, desk)).status, 200);
  // Reconnect to the same database and restart Express: neither records nor sessions depend on process memory.
  await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  await mongoose.connect(mongo.getUri());
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/api/admin`;
  assert.equal((await call("/auth/me", "GET", null, admin)).status, 200);
  assert.equal(await Service.countDocuments(), 1);
  assert.equal(await Schedule.countDocuments(), 1);
  assert.equal(await Settings.countDocuments(), 1);
  assert.equal(
    (await call("/staff/" + artist.data.id, "PATCH", { active: false }, admin))
      .status,
    200,
  );
  assert.equal((await call("/auth/me", "GET", null, art)).status, 401);
  assert.equal(
    (
      await call("/auth/login", "POST", {
        email: "artist@example.test",
        password,
      })
    ).status,
    401,
  );
  assert.equal(
    (await call("/staff/" + artist.data.id, "DELETE", {}, admin)).status,
    200,
  );
  assert.equal(await Schedule.countDocuments(), 0);
  assert.equal(
    (await call("/services/" + service.data._id, "DELETE", {}, admin)).status,
    200,
  );
  await Session.updateMany({ staff: owner._id }, { expires: new Date(0) });
  assert.equal((await call("/auth/me", "GET", null, admin)).status, 401);
  const fresh = await signIn("owner@example.test");
  assert.equal((await call("/auth/logout", "POST", {}, fresh)).status, 200);
  assert.equal((await call("/auth/me", "GET", null, fresh)).status, 401);
  for (let i = 0; i < 12; i++) {
    const result = await call("/auth/login", "POST", {
      email: "nobody@example.test",
      password: "wrong",
    });
    if (i === 11) assert.equal(result.status, 429);
  }
});
