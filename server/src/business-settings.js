import mongoose from "mongoose";
import { DateTime } from "luxon";
import { Settings } from "./models/index.js";
import { Appointment } from "./models/booking.js";
import { QueueTicket } from "./models/queue.js";
import { atomic, fail } from "./booking/engine.js";

export async function saveBusinessSettings(body) {
  const save = async (session = null) => {
    const doc = (await Settings.findById("salon").session(session)) || new Settings();
    const oldZone = doc.timezone;
    const oldHours = JSON.stringify(doc.hours?.map((hour) => ({ day: hour.day, closed: hour.closed, open: hour.open, close: hour.close })).sort((a, b) => a.day - b.day));
    doc.set(body);
    await doc.validate();
    const hoursChanged = oldHours !== JSON.stringify(doc.hours.map((hour) => ({ day: hour.day, closed: hour.closed, open: hour.open, close: hour.close })).sort((a, b) => a.day - b.day));
    const timingChanged = oldZone !== doc.timezone || hoursChanged;
    const future = await Appointment.find({ end: { $gt: new Date() }, status: { $in: ["Pending", "Confirmed", "Checked In", "In Service"] } }).session(session);
    if (oldZone && oldZone !== doc.timezone && future.length)
      fail(409, "Timezone cannot change while future appointments exist. Review those appointments first.");
    for (const appointment of timingChanged ? future : []) {
      const start = DateTime.fromJSDate(appointment.start).setZone(doc.timezone);
      const end = DateTime.fromJSDate(appointment.end).setZone(doc.timezone);
      const hours = doc.hours.find((hour) => hour.day === start.weekday % 7);
      const open = hours && DateTime.fromISO(`${start.toISODate()}T${hours.open}`, { zone: doc.timezone });
      const close = hours && DateTime.fromISO(`${start.toISODate()}T${hours.close}`, { zone: doc.timezone });
      if (!hours || hours.closed || start < open || end > close)
        fail(409, "These hours conflict with an existing appointment. Review affected appointments before changing hours.");
    }
    if (timingChanged) {
      if (await QueueTicket.exists({ active: true }).session(session))
        fail(409, "Finish or cancel active queue visits before changing hours or timezone.");
    }
    await doc.save({ session });
    return doc;
  };
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  // Preserve standalone database support for initial administrative setup.
  return hello.setName || hello.msg === "isdbgrid" ? atomic(save) : save();
}
