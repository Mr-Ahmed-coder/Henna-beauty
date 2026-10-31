import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { bootstrapAdmin, resetBootstrapAdmin } from "../src/bootstrap.js";
import { Session, Staff, initializeModels } from "../src/models/index.js";
import { verifyPassword } from "../src/security.js";

test("local bootstrap recovery replaces only the initial administrator and invalidates its sessions", async (t) => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await initializeModels();
  t.after(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
  const owner = await bootstrapAdmin({
    name: "Initial Owner",
    email: "initial@example.test",
    password: "initial-test-password",
  });
  await Session.create({
    token: "a".repeat(64),
    csrf: "b".repeat(64),
    staff: owner._id,
    expires: new Date(Date.now() + 3600000),
  });
  await resetBootstrapAdmin({
    name: "Chosen Owner",
    email: "chosen@example.test",
    password: "chosen-test-password",
  });
  const recovered = await Staff.findById(owner._id).select("+passwordHash");
  assert.equal(recovered.bootstrap, true);
  assert.equal(recovered.name, "Chosen Owner");
  assert.equal(recovered.email, "chosen@example.test");
  assert.equal(await verifyPassword("chosen-test-password", recovered.passwordHash), true);
  assert.equal(await verifyPassword("initial-test-password", recovered.passwordHash), false);
  assert.equal(await Session.countDocuments({ staff: owner._id }), 0);
});
