import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import { connectDatabase } from "./config/database.js";
import { initializeModels } from "./models/index.js";
import { resetBootstrapAdmin } from "./bootstrap.js";

dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});

try {
  if (process.env.ADMIN_RESET_CONFIRM !== "RESET-INITIAL-ADMIN")
    throw new Error("Explicit local confirmation is required");
  if (!process.env.MONGODB_URI) throw new Error("Configure MONGODB_URI first");
  await connectDatabase(process.env.MONGODB_URI);
  await initializeModels();
  await resetBootstrapAdmin({
    name: process.env.ADMIN_NAME,
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });
  console.log(
    "Initial administrator updated and existing administrator sessions were invalidated.",
  );
} catch {
  console.error(
    "Administrator recovery failed. Check the database, confirmation value, and required administrator values.",
  );
  process.exitCode = 1;
} finally {
  delete process.env.ADMIN_PASSWORD;
  await mongoose.disconnect();
}
