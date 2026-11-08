import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { inspectAdministrators, recoverAdministrator } from "../src/atlas-admin-recovery.js";
import { initializeModels, Session, Staff } from "../src/models/index.js";
import { hashPassword } from "../src/security.js";

test("confirmed administrator recovery preserves records and revokes old credentials and sessions", async (t) => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  let server;
  t.after(async () => {
    if (server?.listening) await new Promise((closed) => server.close(closed));
    await mongoose.disconnect();
    await mongo.stop();
  });
  await mongoose.connect(mongo.getUri("salon_recovery_test"));
  await initializeModels();
  const database = mongoose.connection.db;
  const existingVisit = { _id: new mongoose.Types.ObjectId(), reference: "RECOVERY-TEST", notes: "Existing appointment" };
  const existingSettings = { _id: "salon", name: "Existing salon", currency: "USD" };
  await database.collection("appointments").insertOne(existingVisit);
  await database.collection("settings").insertOne(existingSettings);

  const original = {
    operation: "bootstrap", name: "Owner", email: "previous@example.test", password: "previous-test-password",
  };
  assert.equal((await inspectAdministrators()).administratorCount, 0);
  await assert.rejects(recoverAdministrator({ ...original, operation: "reset" }), /Account state/);
  const account = await recoverAdministrator(original);
  assert.equal((await inspectAdministrators()).originalIsActiveAdmin, true);
  await assert.rejects(recoverAdministrator(original), /Account state/);

  const other = await Staff.create({
    name: "Reception", email: "desk@example.test", role: "Receptionist",
    passwordHash: await hashPassword("test-reception-password"),
  });
  await Session.create({ staff: other._id, token: "a".repeat(64), csrf: "b".repeat(64), expires: new Date(Date.now() + 3600000) });

  let app;
  server = createServer((req, res) => app(req, res)).listen(0, "127.0.0.1");
  await new Promise((ready) => server.once("listening", ready));
  const origin = `http://127.0.0.1:${server.address().port}`;
  app = createApp({ origins: [origin] });
  const login = ({ email, password }) => fetch(origin + "/api/admin/auth/login", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const cookie = (response) => response.headers.get("set-cookie").split(";")[0];
  const previousLogin = await login(original);
  assert.equal(previousLogin.status, 200);
  const previousCookie = cookie(previousLogin);
  const chosen = { operation: "reset", email: "chosen@example.test", password: "chosen-test-password" };
  await assert.rejects(recoverAdministrator({ ...chosen, password: original.password }), /new password/);
  await assert.rejects(recoverAdministrator({ ...chosen, email: other.email }), { code: 11000 });
  assert.equal((await fetch(origin + "/api/admin/auth/me", { headers: { Cookie: previousCookie } })).status, 200);

  const updated = await recoverAdministrator(chosen);
  assert.equal(String(updated._id), String(account._id));
  assert.equal(updated.name, account.name);
  assert.deepEqual(updated.createdAt, account.createdAt);
  assert.equal(updated.role, "Admin");
  assert.equal(await Staff.countDocuments({ role: "Admin" }), 1);
  assert.equal(await Session.countDocuments({ staff: other._id }), 1);
  assert.equal((await login(original)).status, 401);
  assert.equal((await login({ ...chosen, password: original.password })).status, 401);
  assert.equal((await fetch(origin + "/api/admin/auth/me", { headers: { Cookie: previousCookie } })).status, 401);
  assert.equal((await fetch(origin + "/api/admin/appointments")).status, 401);

  const newLogin = await login(chosen);
  assert.equal(newLogin.status, 200);
  assert.equal((await newLogin.json()).staff.role, "Admin");
  const access = await fetch(origin + "/api/admin/appointments", { headers: { Cookie: cookie(newLogin) } });
  assert.equal(access.status, 200);
  assert.equal((await access.json()).appointments[0].reference, existingVisit.reference);
  assert.deepEqual(await database.collection("appointments").findOne({ _id: existingVisit._id }), existingVisit);
  assert.deepEqual(await database.collection("settings").findOne({ _id: "salon" }), existingSettings);
});
