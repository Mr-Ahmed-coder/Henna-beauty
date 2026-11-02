import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import { saveBusinessSettings } from "../src/business-settings.js";
dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
try {
  if (process.argv[2] !== "--confirm-minnesota" || !process.env.MONGODB_URI)
    throw new Error("Explicit Minnesota localization confirmation required");
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const settings = await saveBusinessSettings({ timezone: "America/Chicago" });
  console.log(JSON.stringify({ timezone: settings.timezone, currency: settings.currency, visitTimesUnchanged: true }));
} catch {
  console.error("Timezone change refused. Review future appointments and active tickets through the existing workflow; no credentials are logged.");
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
