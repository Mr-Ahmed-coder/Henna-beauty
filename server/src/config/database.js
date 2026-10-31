import mongoose from "mongoose";
export async function connectDatabase(uri) {
  if (!uri) return false;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  return true;
}
export async function databaseReadiness() {
  if (mongoose.connection.readyState !== 1)
    return {
      status: "unavailable",
      database: "disconnected",
      bookingsReady: false,
      reason: "database-disconnected",
    };
  try {
    await mongoose.connection.db.admin().command({ ping: 1 });
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    // A replica-set member must be writable. Atlas sharded clusters answer
    // through mongos instead, where `isWritablePrimary` is not applicable.
    const replicaSetReady = !!hello.setName && !!hello.isWritablePrimary;
    const shardedClusterReady = hello.msg === "isdbgrid";
    const ready = replicaSetReady || shardedClusterReady;
    return {
      status: ready ? "ready" : "unavailable",
      database: "connected",
      bookingsReady: ready,
      replicaSet: hello.setName || null,
      ...(!ready ? { reason: "writable-replica-set-required" } : {}),
    };
  } catch {
    return {
      status: "unavailable",
      database: "disconnected",
      bookingsReady: false,
      reason: "database-unreachable",
    };
  }
}
