import mongoose from "mongoose";

const uri = process.env.ATLAS_MONGODB_URI;
let client;
let stage = "configuration";

try {
  if (!uri || !uri.startsWith("mongodb+srv://") || /[<>]/.test(uri)) {
    throw new Error("Supply an Atlas SRV URI with resolved credentials");
  }
  const { pathname } = new URL(uri);
  if (!pathname || pathname === "/") {
    throw new Error("Include the destination database name");
  }

  stage = "connection";
  client = new mongoose.mongo.MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const database = client.db();
  await database.command({ ping: 1 });
  const hello = await database.command({ hello: 1 });
  if (!(hello.msg === "isdbgrid" || (hello.setName && hello.isWritablePrimary))) {
    throw new Error("A writable replica set or sharded cluster is required");
  }

  stage = "read-only transaction";
  await client.withSession(async (session) => {
    session.startTransaction({ readConcern: { level: "snapshot" } });
    try {
      await database.collection("settings").findOne(
        { _id: "salon" },
        { session, projection: { _id: 1 }, maxTimeMS: 5000 },
      );
    } finally {
      await session.abortTransaction();
    }
  });
  console.log("Atlas connected. A read-only snapshot transaction succeeded.");
} catch {
  console.error(`Atlas check failed during ${stage}. See ATLAS-MIGRATION.md.`);
  process.exitCode = 1;
} finally {
  await client?.close();
}
