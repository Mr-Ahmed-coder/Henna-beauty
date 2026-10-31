import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
const { MongoClient } = mongoose.mongo;
export const localDatabase = {
  port: 27027,
  name: "salon-dev",
  database: "salon_dev",
  dbPath: fileURLToPath(new URL("../.local/mongodb", import.meta.url)),
};
export const localUri = `mongodb://127.0.0.1:${localDatabase.port}/${localDatabase.database}?replicaSet=${localDatabase.name}`;
async function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(1000);
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}
export async function startLocalDatabase({
  port,
  name,
  database,
  dbPath,
} = localDatabase) {
  const uri = `mongodb://127.0.0.1:${port}/${database}?replicaSet=${name}`;
  if (await portIsOpen(port)) {
    const existing = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
    try {
      await existing.connect();
      const hello = await existing.db("admin").command({ hello: 1 });
      if (hello.setName !== name || !hello.isWritablePrimary) throw new Error();
      return { uri, owned: false, stop: async () => {} };
    } catch {
      throw new Error(
        `Port ${port} is occupied but the expected local replica set is not ready. Stop the other salon development session or configure MONGODB_URI explicitly.`,
      );
    } finally {
      await existing.close();
    }
  }
  await mkdir(dbPath, { recursive: true });
  const server = new MongoMemoryServer({
    instance: {
      port,
      ip: "127.0.0.1",
      dbPath,
      replSet: name,
      storageEngine: "wiredTiger",
      portGeneration: false,
    },
  });
  const client = new MongoClient(
    `mongodb://127.0.0.1:${port}/admin?directConnection=true`,
    { serverSelectionTimeoutMS: 5000 },
  );
  try {
    await server.start(true);
    await client.connect();
    const admin = client.db("admin");
    try {
      const status = await admin.command({ replSetGetStatus: 1 });
      if (status.set !== name)
        throw new Error(
          "Unexpected replica set name in the local data directory.",
        );
    } catch (err) {
      if (err.code !== 94) throw err;
      await admin.command({
        replSetInitiate: {
          _id: name,
          members: [{ _id: 0, host: `127.0.0.1:${port}` }],
        },
      });
    }
    const deadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < deadline) {
      const hello = await admin.command({ hello: 1 });
      if (hello.isWritablePrimary && hello.setName === name) {
        ready = true;
        break;
      }
      await delay(100);
    }
    if (!ready)
      throw new Error("The local replica set did not elect a primary.");
    return {
      uri,
      owned: true,
      stop: () => server.stop({ doCleanup: false, force: false }),
    };
  } catch (err) {
    await server.stop({ doCleanup: false, force: false });
    throw err;
  } finally {
    await client.close();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const database = await startLocalDatabase();
    console.log(`Persistent local MongoDB ready: ${database.uri}`);
    console.log("Database files are preserved under server/.local/mongodb.");
    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      await database.stop();
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    if (!database.owned) {
      console.log("An existing development database is already running.");
      process.exit(0);
    }
  } catch {
    console.error(
      "Local MongoDB startup failed. Check port 27027, the MongoDB binary download/cache, and access to server/.local/mongodb. No database files were deleted.",
    );
    process.exitCode = 1;
  }
}
