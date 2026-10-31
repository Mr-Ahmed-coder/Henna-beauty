import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { startLocalDatabase } from "../scripts/local-database.js";
import { databaseReadiness } from "../src/config/database.js";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
const { MongoClient } = mongoose.mongo;
test("persistent local replica set survives a full database restart and reuses only a ready matching listener", async (t) => {
  const port = await new Promise((resolve) => {
    const listener = createServer().listen(0, "127.0.0.1", () => {
      const value = listener.address().port;
      listener.close(() => resolve(value));
    });
  });
  const dbPath = await mkdtemp(
    path.join(tmpdir(), "salon-database-persistence-"),
  );
  const options = {
    port,
    name: "salon-persistence-test",
    database: "salon_test",
    dbPath,
  };
  let database = await startLocalDatabase(options),
    client = new MongoClient(database.uri);
  t.after(async () => {
    await mongoose.disconnect();
    await client.close();
    await database.stop();
    const resolved = await realpath(dbPath),
      tempRoot = await realpath(tmpdir());
    assert.equal(path.dirname(resolved), tempRoot);
    assert.match(path.basename(resolved), /^salon-database-persistence-/);
    await rm(resolved, { recursive: true, force: true });
  });
  await client.connect();
  await client
    .db()
    .collection("persistence")
    .insertOne({ _id: "marker", value: "survives restart" });
  const reuse = await startLocalDatabase(options);
  assert.equal(reuse.owned, false);
  await reuse.stop();
  assert.equal((await client.db("admin").command({ ping: 1 })).ok, 1);
  await client.close();
  await database.stop();
  database = await startLocalDatabase(options);
  client = new MongoClient(database.uri);
  await client.connect();
  assert.equal(
    (await client.db().collection("persistence").findOne({ _id: "marker" }))
      .value,
    "survives restart",
  );
  await mongoose.connect(database.uri);
  assert.equal((await databaseReadiness()).bookingsReady, true);
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/ready`,
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).replicaSet, options.name);
  await mongoose.disconnect();
  const offline = await fetch(
    `http://127.0.0.1:${server.address().port}/api/ready`,
  );
  assert.equal(offline.status, 503);
  assert.equal((await offline.json()).bookingsReady, false);
});
