import mongoose from "mongoose";
import { bootstrapAdmin, resetBootstrapAdmin } from "./bootstrap.js";
import { Staff } from "./models/index.js";

export async function inspectAdministrators(session = null) {
  const originals = await Staff.find({ bootstrap: true })
    .select("role active")
    .limit(2)
    .session(session);
  const administratorCount = await Staff.countDocuments({ role: "Admin" }).session(session);
  return {
    administratorCount,
    originalCount: originals.length,
    originalIsActiveAdmin: originals.length === 1 && originals[0].role === "Admin" && originals[0].active,
  };
}

function assertEligible(operation, state) {
  if (operation === "reset" && state.originalIsActiveAdmin) return;
  if (operation === "bootstrap" && state.administratorCount === 0 && state.originalCount === 0) return;
  throw new Error("Account state does not allow the requested operation");
}

export async function recoverAdministrator({ operation, name, email, password }) {
  if (
    typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof password !== "string" || password.length < 12 || password.length > 128 ||
    (operation === "bootstrap" && (typeof name !== "string" || !name.trim() || name.length > 120))
  ) throw new Error("Invalid credentials or display name");

  assertEligible(operation, await inspectAdministrators());
  if (operation === "bootstrap") await Staff.createIndexes();
  const indexes = await Staff.collection.indexes();
  if (!indexes.some((index) => index.unique && index.key.email === 1 &&
    Object.keys(index.key).length === 1 && !index.sparse && !index.partialFilterExpression)) {
    throw new Error("The application staff email index is required");
  }

  return mongoose.connection.transaction(async (session) => {
    assertEligible(operation, await inspectAdministrators(session));
    const credentials = { email: email.trim().toLowerCase(), password };
    if (operation === "reset") {
      return resetBootstrapAdmin(credentials, { session, requireNewPassword: true });
    }
    return bootstrapAdmin({ ...credentials, name: name.trim() }, { session });
  }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
}
