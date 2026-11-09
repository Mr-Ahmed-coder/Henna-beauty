import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { connectDatabase, databaseReadiness } from "./config/database.js";
import { initializeModels } from "./models/index.js";
import { processDueNotifications } from "./notification/engine.js";
import { runtimeConfiguration } from "./config/runtime.js";
if (process.env.NODE_ENV !== "production") dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
let startupStage = "server configuration";
try {
  const { port, host, origins, trustProxy, production } = runtimeConfiguration();
  startupStage = "MongoDB connection";
  await connectDatabase(process.env.MONGODB_URI);
  startupStage = "MongoDB model and index initialization";
  if (process.env.MONGODB_URI) await initializeModels();
  startupStage = "MongoDB readiness";
  if (process.env.MONGODB_URI) {
    const readiness = await databaseReadiness();
    if (production && !readiness.bookingsReady)
      throw new Error("Production requires a writable MongoDB replica set");
    console.log(
      `Database: ${readiness.database}; replica set: ${readiness.replicaSet || "none"}; booking/queue readiness: ${readiness.bookingsReady ? "ready" : "unavailable"}.`,
    );
  } else
    console.warn(
      "Database not configured: public pages only. Use npm run dev for the persistent local replica set, or configure MONGODB_URI.",
    );
  mongoose.connection.on("disconnected", () =>
    console.warn(
      "Database disconnected; /api/ready will return 503 until reconnection.",
    ),
  );
  startupStage = "HTTP server startup";
  const app = createApp({
    origins,
    trustProxy,
    databaseStatus: () =>
      !process.env.MONGODB_URI
        ? "not-configured"
        : mongoose.connection.readyState === 1
          ? "connected"
          : "disconnected",
  });
  const server = app.listen(port, host, () =>
    console.log(`Salon API listening on port ${port}; health: /api/health`),
  );
  const notificationTimer = process.env.MONGODB_URI
    ? setInterval(() => {
        processDueNotifications().catch(() =>
          console.warn("Notification processing will retry on its next cycle."),
        );
      }, 60000)
    : null;
  notificationTimer?.unref();
  startupStage = "initial notification processing";
  if (process.env.MONGODB_URI) await processDueNotifications();
  const shutdown = () =>
    server.close(async () => {
      if (notificationTimer) clearInterval(notificationTimer);
      await mongoose.disconnect();
      process.exit(0);
    });
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch (error) {
  // Driver errors can contain connection details. Log only fixed messages.
  let hint = "";
  if (error?.name === "MongoParseError")
    hint = " Check the MONGODB_URI format.";
  else if (error?.code === 18 || (error?.code === 8000 && /bad auth|authentication failed/i.test(error.message)))
    hint = " MongoDB rejected authentication. Check the database username, password, and authSource.";
  else if (error?.code === 13)
    hint = " MongoDB denied permission. Check the database user's role.";
  else if (error?.syscall === "querySrv" || error?.syscall === "queryTxt")
    hint = " MongoDB DNS lookup failed. Check the cluster hostname and DNS.";
  else if (["MongooseServerSelectionError", "MongoServerSelectionError"].includes(error?.name))
    hint = " MongoDB server selection failed. Check Atlas network access and cluster availability.";
  console.error(`API startup failed during ${startupStage}.${hint}`);
  process.exit(1);
}
