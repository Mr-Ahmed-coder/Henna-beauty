import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import { Settings, Service, initializeModels } from "../src/models/index.js";
import { atomic } from "../src/booking/engine.js";

// Explicit owner-approved replacement, never an exchange-rate conversion. Refuse
// multi-service catalogues because changing the business currency affects all prices.
export async function applyApprovedPrice({ serviceId, expectedCurrency, expectedPriceMinor, usd }) {
  if (!mongoose.isValidObjectId(serviceId) || !/^[A-Z]{3}$/.test(expectedCurrency) ||
    !Number.isSafeInteger(expectedPriceMinor) || !/^\d+(\.\d{1,2})?$/.test(String(usd)))
    throw new Error("Explicit service, old currency/value, and approved USD price are required");
  const priceMinor = Math.round(Number(usd) * 100);
  if (!Number.isSafeInteger(priceMinor) || priceMinor < 0 || priceMinor > 1000000000)
    throw new Error("Approved price is out of range");
  return atomic(async (session) => {
    const settings = await Settings.findById("salon").session(session);
    const services = await Service.find().session(session);
    if (settings?.currency !== expectedCurrency || services.length !== 1 ||
      String(services[0]._id) !== serviceId || services[0].priceMinor !== expectedPriceMinor)
      throw new Error("Catalogue changed or needs separate owner review; no prices were changed");
    services[0].priceMinor = priceMinor;
    await services[0].save({ session });
    settings.currency = "USD";
    await settings.save({ session });
    return { currency: settings.currency, priceMinor, timezone: settings.timezone, visitSnapshotsUnchanged: true };
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
  try {
    if (!process.env.MONGODB_URI) throw new Error("Configure the database first");
    const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, "").split("=")));
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await initializeModels();
    console.log(JSON.stringify(await applyApprovedPrice({ serviceId: args.service, expectedCurrency: args["expected-currency"], expectedPriceMinor: Number(args["expected-price-minor"]), usd: args.usd })));
  } catch {
    console.error("Approved-price update failed. Check explicit arguments and current catalogue using the read-only audit; no credentials are logged.");
    process.exitCode = 1;
  } finally { await mongoose.disconnect(); }
}
