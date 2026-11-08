import mongoose from "mongoose";
import { localUri } from "./local-database.js";
import { initializeModels, Schedule, Service, Settings, Staff } from "../src/models/index.js";
import { ArtistProfile } from "../src/models/booking.js";
import { hashPassword } from "../src/security.js";

export const demoDatabaseName = "salon_demo";
export const demoAdminEmail = "admin@salon-demo.test";
const marker = { _id: "salon-demo-v1" };

export async function readDemoCatalogue() {
  const source = new mongoose.mongo.MongoClient(localUri, { serverSelectionTimeoutMS: 3000 });
  try {
    await source.connect();
    const database = source.db();
    const services = await database.collection("services").find({}, {
      projection: { _id: 0, name: 1, category: 1, description: 1, imageUrl: 1, priceMinor: 1, durationMinutes: 1 },
    }).sort({ _id: 1 }).toArray();
    const settings = await database.collection("settings").findOne({ _id: "salon" }, { projection: { currency: 1 } });
    if (services.length !== 3 || !settings?.currency) {
      throw new Error("Expected three service definitions and a currency in the local source.");
    }
    return { services, currency: settings.currency };
  } finally {
    await source.close();
  }
}

export async function demoIsSeeded() {
  const database = mongoose.connection.db;
  if (database?.databaseName !== demoDatabaseName) {
    throw new Error("Demo setup requires the dedicated salon_demo database.");
  }
  if (await database.collection("demosetup").findOne(marker)) return true;
  for (const { name } of await database.listCollections({}, { nameOnly: true }).toArray()) {
    if (await database.collection(name).findOne({}, { projection: { _id: 1 } })) {
      throw new Error("The demo database contains unrecognized records. Use a fresh demo database.");
    }
  }
  return false;
}

export async function seedDemo({ services, currency, adminPassword, artistPassword }) {
  if (await demoIsSeeded()) return false;
  if (services.length !== 3) throw new Error("Demo setup requires exactly three service definitions.");
  await initializeModels();

  const [adminHash, artistHash] = await Promise.all([
    hashPassword(adminPassword),
    hashPassword(artistPassword),
  ]);
  const hours = Array.from({ length: 7 }, (_, day) => ({
    day,
    closed: day < 2,
    open: "10:00",
    close: "17:00",
  }));
  await mongoose.connection.transaction(async (session) => {
    await mongoose.connection.db.collection("demosetup").insertOne(marker, { session });
    const catalogue = await Service.create(services.map((service) => ({
      ...service,
      active: true,
    })), { session, ordered: true });
    const [artist] = await Staff.create([
      { name: "Demo Henna Artist", email: "artist@salon-demo.test", role: "Artist", passwordHash: artistHash },
      { name: "Demo Administrator", email: demoAdminEmail, role: "Admin", passwordHash: adminHash },
    ], { session, ordered: true });
    await Settings.create([{
      _id: "salon",
      name: "Henna & Beauty Demo",
      currency,
      timezone: "America/Chicago",
      hours,
    }], { session });
    await ArtistProfile.create([{
      staff: artist._id,
      services: catalogue.map((service) => service._id),
    }], { session });
    await Schedule.create(hours.filter((hour) => !hour.closed).map((hour) => ({
      staff: artist._id,
      day: hour.day,
      start: hour.open,
      end: hour.close,
      available: true,
    })), { session, ordered: true });
  });
  return true;
}
