import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
const port = Number(process.env.PORT || 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be an integer between 1 and 65535");
try {
  await connectDatabase(process.env.MONGODB_URI);
  const app = createApp({
    origins: process.env.CLIENT_ORIGIN?.split(",").map((value) => value.trim()),
    databaseStatus: () =>
      !process.env.MONGODB_URI
        ? "not-configured"
        : mongoose.connection.readyState === 1
          ? "connected"
          : "disconnected",
  });
  const server = app.listen(port, "127.0.0.1", () =>
    console.log(`Salon API: http://127.0.0.1:${port}/api/health`),
  );
  const shutdown = () =>
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch {
  console.error(
    "API startup failed. Check the server environment and Atlas connection settings.",
  );
  process.exit(1);
}
