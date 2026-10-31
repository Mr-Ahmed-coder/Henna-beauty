import { DateTime } from "luxon";
import { Appointment, ArtistProfile } from "./models/booking.js";
import { QueueTicket } from "./models/queue.js";
import { Staff, Schedule, Settings } from "./models/index.js";
import { fail } from "./booking/engine.js";

export function reportPeriod(period, date, timezone, now = DateTime.utc()) {
  if (!["daily", "weekly", "monthly"].includes(period)) fail(400, "Choose daily, weekly, or monthly reports");
  const day = date === undefined ? now.setZone(timezone).startOf("day") :
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? DateTime.fromISO(date, { zone: timezone }) : null;
  if (!day?.isValid) fail(400, "Choose a valid report date");
  const unit = { daily: "day", weekly: "week", monthly: "month" }[period];
  const start = day.startOf(unit), end = start.plus({ [unit]: 1 });
  return { start, end, period, timezone };
}
const mean = (values) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null;
function queueWait(ticket) {
  if (!ticket.startedAt || !ticket.createdAt) return null;
  const value = (ticket.startedAt - ticket.createdAt) / 60000;
  return value >= 0 ? value : null;
}
export function summarize(appointments, tickets, range) {
  const services = new Map(), staff = new Map();
  function group(map, id, name) {
    const key = String(id || name);
    if (!map.has(key)) map.set(key, { id: key, name, appointments: 0, queueVisits: 0, completed: 0, scheduledMinutes: 0 });
    return map.get(key);
  }
  for (const [records, kind] of [[appointments, "appointments"], [tickets, "queueVisits"]])
    for (const record of records) {
      for (const item of [group(services, record.service, record.serviceName),
        ...(record.artist ? [group(staff, record.artist, record.artistName)] : [])]) {
        item[kind]++;
        if (record.status === "Completed") item.completed++;
        if (!["Cancelled", "No-Show", "Missed"].includes(record.status)) item.scheduledMinutes += record.durationMinutes;
      }
    }
  const statusCounts = (records) => records.reduce((counts, record) => ({ ...counts, [record.status]: (counts[record.status] || 0) + 1 }), {});
  const waits = tickets.map(queueWait).filter((value) => value !== null);
  const trend = [];
  for (let day = range.start; day < range.end; day = day.plus({ days: 1 })) {
    const date = day.toISODate(), visits = tickets.filter((ticket) => ticket.date === date);
    const values = visits.map(queueWait).filter((value) => value !== null);
    trend.push({ date, queueVisits: visits.length, served: values.length, averageWaitMinutes: mean(values) });
  }
  return {
    period: range.period, timezone: range.timezone,
    start: range.start.toISODate(), endExclusive: range.end.toISODate(),
    appointments: appointments.length, appointmentStatuses: statusCounts(appointments),
    queueVisits: tickets.length, queueStatuses: statusCounts(tickets),
    completedServices: [...appointments, ...tickets].filter((item) => item.status === "Completed").length,
    averageWaitMinutes: mean(waits), waitSampleCount: waits.length,
    services: [...services.values()].sort((a, b) => b.appointments - a.appointments || b.queueVisits - a.queueVisits),
    staff: [...staff.values()].sort((a, b) => b.completed - a.completed), trend,
  };
}
export async function businessReport({ period = "daily", date, staff, now = DateTime.utc() } = {}) {
  const settings = await Settings.findById("salon");
  if (!settings) fail(503, "Configure salon settings before viewing reports");
  const range = reportPeriod(period, date, settings.timezone, now);
  const restriction = staff?.role === "Artist" ? { artist: staff._id } : {};
  const [appointments, tickets] = await Promise.all([
    Appointment.find({ ...restriction, start: { $gte: range.start.toJSDate(), $lt: range.end.toJSDate() } }).lean(),
    QueueTicket.find({ ...restriction, date: { $gte: range.start.toISODate(), $lt: range.end.toISODate() } }).lean(),
  ]);
  return summarize(appointments, tickets, range);
}
export async function operationsMetrics(staff, now = DateTime.utc()) {
  const report = await businessReport({ staff, now });
  const settings = await Settings.findById("salon");
  const local = now.setZone(settings.timezone), day = local.weekday % 7, time = local.toFormat("HH:mm");
  const artists = await Staff.find({ active: true, role: "Artist", ...(staff.role === "Artist" ? { _id: staff._id } : {}) });
  const [shifts, profiles, appointments, tickets] = await Promise.all([
    Schedule.find({ day, available: true }), ArtistProfile.find(),
    Appointment.find({ status: { $nin: ["Cancelled", "No-Show", "Completed"] },
      $or: [{ start: { $lte: now.toJSDate() }, end: { $gt: now.toJSDate() } }, { status: "In Service" }] }),
    QueueTicket.find({ status: { $in: ["Waiting", "Checked In", "Called", "In Service"] } }),
  ]);
  const hours = settings.hours.find((hour) => hour.day === day);
  const statuses = artists.map((artist) => {
    const occupied = appointments.some((a) => String(a.artist) === String(artist._id)) || tickets.some((t) =>
      String(t.artist) === String(artist._id) && (t.status === "In Service" || (t.status === "Called" && t.deadlineAt > now.toJSDate())));
    const onShift = hours && !hours.closed && time >= hours.open && time < hours.close && shifts.some((s) =>
      String(s.staff) === String(artist._id) && time >= s.start && time < s.end);
    const onBreak = profiles.find((p) => String(p.staff) === String(artist._id))?.breaks.some((b) => b.day === day && time >= b.start && time < b.end);
    return { id: String(artist._id), name: artist.name, status: occupied ? "Occupied" : !onShift ? "Off shift" : onBreak ? "On break" : "Available" };
  });
  return { ...report, serverNow: now.toISO(), artists: statuses,
    waiting: tickets.filter((t) => t.date === local.toISODate() && ["Waiting", "Checked In", "Called"].includes(t.status) &&
      (staff.role !== "Artist" || String(t.artist) === String(staff._id))).length };
}
