import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import { Settings, Service } from "../src/models/index.js";
import { Appointment } from "../src/models/booking.js";
import { QueueTicket } from "../src/models/queue.js";
dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
try {
  if (!process.env.MONGODB_URI) throw new Error("Database environment is missing");
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const settings = await Settings.findById("salon").select("name currency timezone").lean();
  const services = await Service.find().select("name priceMinor active").lean();
  const appointments = await Appointment.aggregate([{ $group: { _id: { currency: "$currency", timezone: "$timezone", status: "$status" }, count: { $sum: 1 } } }]);
  const futureProtectedAppointments = await Appointment.countDocuments({ end: { $gt: new Date() }, status: { $in: ["Pending", "Confirmed", "Checked In", "In Service"] } });
  const activeTickets = await QueueTicket.countDocuments({ active: true });
  const activeTicketGroups = await QueueTicket.aggregate([{ $match: { active: true } }, { $group: { _id: { status: "$status", date: "$date", currency: "$currency", timezone: "$timezone" }, count: { $sum: 1 } } }]);
  console.log(JSON.stringify({ settings, services, appointments, futureProtectedAppointments, activeTickets, activeTicketGroups }, null, 2));
} catch {
  console.error("Localization audit could not reach the configured database. No records were changed or credentials printed.");
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
