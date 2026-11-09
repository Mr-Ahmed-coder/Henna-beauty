import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { runtimeConfiguration } from "../src/config/runtime.js";
import { Staff, initializeModels } from "../src/models/index.js";
import { hashPassword } from "../src/security.js";

test("production configuration fails closed and supports explicit proxy topology", () => {
  assert.throws(() => runtimeConfiguration({ NODE_ENV: "production" }));
  const environment = { NODE_ENV: "production", MONGODB_URI: "mongodb://test", CLIENT_ORIGIN: "https://salon.example" };
  for (const CLIENT_ORIGIN of ["http://salon.example", "https://salon.example/path", "*", "https://user:pass@salon.example"])
    assert.throws(() => runtimeConfiguration({ ...environment, CLIENT_ORIGIN }));
  for (const TRUST_PROXY_HOPS of ["true", "-1", "1.5", "6"])
    assert.throws(() => runtimeConfiguration({ ...environment, TRUST_PROXY_HOPS }));
  assert.equal(runtimeConfiguration({ ...environment, TRUST_PROXY_HOPS: "1", HOST: "0.0.0.0" }).trustProxy, 1);
  assert.equal(runtimeConfiguration({}).host, "127.0.0.1");
  const missing = spawnSync(process.execPath, [fileURLToPath(new URL("../src/index.js", import.meta.url))], {
    windowsHide: true, encoding: "utf8", timeout: 10000,
    env: { ...process.env, NODE_ENV: "production", MONGODB_URI: "", CLIENT_ORIGIN: "" },
  });
  assert.equal(missing.status, 1, "Production must not fall back to local development .env values");
  assert.ok(!missing.stdout.includes("Salon API listening"));
  assert.match(missing.stderr, /failed during server configuration/);

  const invalidUri = "invalid://private-value@example.test";
  const invalidDatabase = spawnSync(process.execPath, [fileURLToPath(new URL("../src/index.js", import.meta.url))], {
    windowsHide: true, encoding: "utf8", timeout: 10000,
    env: { ...process.env, ...environment, MONGODB_URI: invalidUri },
  });
  assert.equal(invalidDatabase.status, 1);
  assert.match(invalidDatabase.stderr, /failed during MongoDB connection.*MONGODB_URI format/);
  assert.doesNotMatch(invalidDatabase.stdout + invalidDatabase.stderr, /private-value|example\.test/);
});

test("actual production entry point starts with replica set, health checks and secure staff sessions", async (t) => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  let child;
  t.after(async () => {
    if (child && child.exitCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await exited;
    }
    await mongoose.disconnect();
    await mongo.stop();
  });
  await mongoose.connect(mongo.getUri());
  await initializeModels();
  const password = "production-smoke-test-password";
  await Staff.create({ name: "Smoke owner", email: "owner@smoke.test", role: "Admin", passwordHash: await hashPassword(password) });
  const listener = net.createServer().listen(0, "127.0.0.1");
  await new Promise((resolve) => listener.once("listening", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  child = spawn(process.execPath, [fileURLToPath(new URL("../src/index.js", import.meta.url))], {
    windowsHide: true,
    env: { ...process.env, NODE_ENV: "production", MONGODB_URI: mongo.getUri(), CLIENT_ORIGIN: "https://salon.example", HOST: "127.0.0.1", PORT: String(port), TRUST_PROXY_HOPS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (data) => { output += data.toString(); });
  child.stderr.on("data", () => {});
  for (let attempt = 0; attempt < 150 && !output.includes("Salon API listening"); attempt++) {
    assert.equal(child.exitCode, null, "Production server exited before becoming ready");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(output.includes("Salon API listening"));
  const base = `http://127.0.0.1:${port}`;
  const ready = await fetch(base + "/api/ready");
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).bookingsReady, true);
  assert.equal((await (await fetch(base + "/api/health")).json()).database, "connected");
  const headers = { Origin: "https://salon.example", "Content-Type": "application/json" };
  const response = await fetch(base + "/api/admin/auth/login", { method: "POST", headers, body: JSON.stringify({ email: "owner@smoke.test", password }) });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /^__Host-salon_session=/);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  const session = await response.json();
  const privateHeaders = { ...headers, Cookie: cookie.split(";")[0], "X-CSRF-Token": session.csrf };
  assert.equal((await fetch(base + "/api/admin/auth/me", { headers: privateHeaders })).status, 200);
  assert.equal((await fetch(base + "/api/admin/auth/logout", { method: "POST", headers: privateHeaders, body: "{}" })).status, 200);
  assert.equal((await fetch(base + "/api/admin/auth/me", { headers: privateHeaders })).status, 401);
  const invalid = await fetch(base + "/api/admin/auth/login", { method: "POST", headers, body: '{"private-value"' });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: "Invalid JSON request body" });
  const large = await fetch(base + "/api/admin/auth/login", { method: "POST", headers, body: JSON.stringify({ value: "x".repeat(11000) }) });
  assert.equal(large.status, 413);
  const rejectedOrigin = await fetch(base + "/api/booking/reservations", { method: "POST", headers: { ...headers, Origin: "https://untrusted.example" }, body: "{}" });
  assert.equal(rejectedOrigin.status, 403);
  let bookingLimit;
  for (let index = 0; index < 21; index++)
    bookingLimit = await fetch(base + "/api/booking/reservations", { method: "POST", headers, body: "{}" });
  assert.equal(bookingLimit.status, 429);
  let loginLimit;
  for (let index = 0; index < 10; index++)
    loginLimit = await fetch(base + "/api/admin/auth/login", { method: "POST", headers, body: JSON.stringify({ email: "unknown@example.test", password: "wrong" }) });
  assert.equal(loginLimit.status, 429);
});
