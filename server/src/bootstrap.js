import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { connectDatabase } from "./config/database.js";
import { Staff, initializeModels } from "./models/index.js";
import { hashPassword } from "./security.js";
dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
export async function bootstrapAdmin({ name, email, password }) {
  if (await Staff.exists({ bootstrap: true }))
    throw new Error("Initial administrator already exists");
  // A deterministic ID makes competing first-run attempts mutually exclusive.
  return Staff.create({
    _id: "000000000000000000000001",
    name,
    email,
    passwordHash: await hashPassword(password),
    role: "Admin",
    active: true,
    bootstrap: true,
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (!process.env.MONGODB_URI)
      throw new Error("Configure MONGODB_URI first");
    await connectDatabase(process.env.MONGODB_URI);
    await initializeModels();
    await bootstrapAdmin({
      name: process.env.ADMIN_NAME,
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    });
    console.log(
      "Initial administrator created. Remove ADMIN_PASSWORD from your environment.",
    );
  } catch {
    console.error(
      "Administrator setup failed. Check the database, required ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD values, or whether setup was already completed.",
    );
    process.exitCode = 1;
  } finally {
    delete process.env.ADMIN_PASSWORD;
    await mongoose.disconnect();
  }
}
