import mongoose from "mongoose";
import { localUri } from "./local-database.js";
import { initializeModels, Schedule, Service, Session, Settings, Staff } from "../src/models/index.js";
import { ArtistProfile } from "../src/models/booking.js";
import { hashPassword } from "../src/security.js";

export const demoDatabaseName = "salon_demo";
export const demoDatabasePort = 27028;
export const demoReplicaSet = "salon-demo";
const demoAdminName = "Demo Administrator";
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

export async function seedDemo({ services, currency, artistPassword }) {
  if (await demoIsSeeded()) return false;
  if (services.length !== 3) throw new Error("Demo setup requires exactly three service definitions.");
  await initializeModels();

  const artistHash = await hashPassword(artistPassword);
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

export async function setDemoAdministrator({ email, password }) {
  if (!(await demoIsSeeded())) throw new Error("Start the demo to initialize its database first.");
  const passwordHash = await hashPassword(password);
  const credentials = { email, passwordHash, active: true };

  await mongoose.connection.transaction(async (session) => {
    const setup = mongoose.connection.db.collection("demosetup");
    // Updating the marker serializes concurrent setups, even when there is no account yet.
    const state = await setup.findOneAndUpdate(marker, { $inc: { adminRevision: 1 } }, { session });
    if (!state) throw new Error("The demo setup marker is missing.");

    const admins = await Staff.find({ role: "Admin" }).limit(2).session(session);
    const administrator = admins[0];
    if (admins.length > 1 || (administrator && (
      state.adminId ? !administrator._id.equals(state.adminId) : administrator.name !== demoAdminName
    ))) {
      throw new Error("The demo has an unexpected administrator configuration. No account was changed.");
    }

    if (!administrator) {
      const [created] = await Staff.create([{
        ...credentials, role: "Admin", name: demoAdminName,
      }], { session });
      await setup.updateOne(marker, { $set: { adminId: created._id } }, { session });
      return;
    }
    administrator.set(credentials);
    await administrator.save({ session });
    await setup.updateOne(marker, { $set: { adminId: administrator._id } }, { session });
    await Session.deleteMany({ staff: administrator._id }, { session });
  });
}
