import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { connectDatabase } from "./config/database.js";
import { Staff, Session, initializeModels } from "./models/index.js";
import { hashPassword, verifyPassword } from "./security.js";
export async function bootstrapAdmin({ name, email, password }, { session = null } = {}) {
  if (await Staff.exists({ bootstrap: true }).session(session))
    throw new Error("Initial administrator already exists");
  // A deterministic ID makes competing first-run attempts mutually exclusive.
  const [administrator] = await Staff.create([{
    _id: "000000000000000000000001",
    name,
    email,
    passwordHash: await hashPassword(password),
    role: "Admin",
    active: true,
    bootstrap: true,
  }], { session });
  return administrator;
}
export async function resetBootstrapAdmin(
  { name, email, password },
  { session = null, requireNewPassword = false } = {},
) {
  const administrator = await Staff.findOne({ bootstrap: true }).select(
    "+passwordHash",
  ).session(session);
  if (!administrator) throw new Error("Initial administrator does not exist");
  if (requireNewPassword && await verifyPassword(password, administrator.passwordHash)) {
    throw new Error("Choose a new password");
  }
  administrator.set({
    ...(name === undefined ? {} : { name }),
    email,
    passwordHash: await hashPassword(password),
    role: "Admin",
    active: true,
  });
  await administrator.save({ session });
  await Session.deleteMany({ staff: administrator._id }, { session });
  return administrator;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  dotenv.config({
    path: fileURLToPath(new URL("../.env", import.meta.url)),
    quiet: true,
  });
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
