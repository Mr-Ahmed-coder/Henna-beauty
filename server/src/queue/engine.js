import { DateTime } from "luxon";
import { randomBytes } from "node:crypto";
import { Service } from "../models/index.js";
import { Appointment } from "../models/booking.js";
import { QueueTicket, QueuePolicy, QueueDay } from "../models/queue.js";
import {
  atomic,
  bookingReady,
  availability,
  configuration,
  customerData,
  fail,
  objectId,
} from "../booking/engine.js";
import { randomToken, digest } from "../security.js";
import {
  notificationsFor,
  queueEvent,
  validatePreferences,
} from "../notification/engine.js";
const pending = ["Waiting", "Checked In"];
const terminal = ["Completed", "Cancelled", "Missed"];
export async function queueContext(session = null, now = DateTime.utc()) {
  const { settings } = await configuration(session),
    policy =
      (await QueuePolicy.findById("salon").session(session)) ||
      new QueuePolicy();
  const local = now.setZone(settings.timezone),
    date = local.toISODate(),
    hours = settings.hours.find((h) => h.day === local.weekday % 7);
  const open =
      hours && !hours.closed
        ? DateTime.fromISO(`${date}T${hours.open}`, { zone: settings.timezone })
        : null,
    close =
      hours && !hours.closed
        ? DateTime.fromISO(`${date}T${hours.close}`, {
            zone: settings.timezone,
          })
        : null;
  return {
    settings,
    policy,
    now,
    date,
    open,
    close,
    isOpen: !!(open && close && now >= open && now < close),
  };
}
function expiredQuery(context) {
  const { now, date, close } = context;
  const afterClosing = !close || now >= close;
  return {
    active: true,
    status: { $in: ["Waiting", "Checked In", "Called"] },
    $or: [
      { date: { $lt: date } },
      { status: "Called", deadlineAt: { $lte: now.toJSDate() } },
      ...(afterClosing ? [{ date }] : []),
    ],
  };
}
async function expire(session, context) {
  const { now } = context;
  const tickets = await QueueTicket.find(expiredQuery(context)).session(session);
  for (const ticket of tickets) {
    ticket.status = "Missed";
    ticket.active = false;
    ticket.finishedAt = now.toJSDate();
    ticket.history.push({
      status: "Missed",
      at: now.toJSDate(),
      by: "system expiry",
    });
    await queueEvent(ticket, "queue.missed", { session });
  }
  await QueueTicket.updateMany(
    expiredQuery(context),
    {
      $set: { status: "Missed", active: false, finishedAt: now.toJSDate() },
      $push: { history: { status: "Missed", at: now.toJSDate(), by: "system expiry" } },
    },
    { session },
  );
  // Before opening, same-day tickets are left intact (normally there are none).
}
function requiredMinutes(ticket, policy) {
  return (
    ticket.durationMinutes +
    policy.graceMinutes +
    (ticket.checkedInAt ? 0 : policy.remoteArrivalMinutes)
  );
}
async function candidates(
  ticket,
  context,
  session = null,
  {
    instant = false,
    excludeQueue,
    artist,
    serviceOnly = false,
    forecast = false,
  } = {},
) {
  try {
    const result = await availability(
      {
        service: String(ticket.service),
        date: context.date,
        ...(artist ? { artist: objectId(artist) } : {}),
      },
      session,
      null,
      context.now,
      {
        durationMinutes: serviceOnly
          ? ticket.durationMinutes
          : requiredMinutes(ticket, context.policy),
        minimumNoticeMinutes: 0,
        slotIntervalMinutes: forecast ? 5 : 1,
        fromNow: forecast,
        ...(instant ? { instant: context.now } : {}),
        excludeQueue,
      },
    );
    const serving = await Appointment.find({ status: "In Service" }).session(
      session,
    );
    return result.slots.filter(
      (slot) =>
        !serving.some(
          (a) =>
            String(a.artist) === slot.artist &&
            (instant ||
              a.end.getTime() <= context.now.toMillis() ||
              Date.parse(slot.start) < a.end.getTime()),
        ),
    );
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
}
async function estimates(tickets, context) {
  const forecast = new Map(),
    holds = [],
    cache = new Map();
  const ordered = tickets
    .filter((t) => pending.includes(t.status) && t.date === context.date)
    .sort((a, b) => a.number - b.number);
  for (const [index, ticket] of ordered.entries()) {
    const key = `${ticket.service}:${ticket.durationMinutes}:${!!ticket.checkedInAt}`;
    if (!cache.has(key))
      cache.set(
        key,
        await candidates(ticket, context, null, { forecast: true }),
      );
    const slot = cache
      .get(key)
      .find(
        (s) =>
          !holds.some(
            (h) =>
              h.artist === s.artist &&
              Date.parse(s.start) < h.end &&
              Date.parse(s.end) > h.start,
          ),
      );
    if (slot)
      holds.push({
        artist: slot.artist,
        start: Date.parse(slot.start),
        end: Date.parse(slot.end),
      });
    forecast.set(String(ticket._id), {
      position: index + 1,
      approximateWaitMinutes: slot
        ? Math.max(
            0,
            Math.ceil(
              (Date.parse(slot.start) - context.now.toMillis()) / 60000,
            ),
          )
        : null,
      estimatedCallAt: slot?.start || null,
    });
  }
  return forecast;
}
function plain(ticket) {
  const doc = ticket.toObject ? ticket.toObject() : { ...ticket };
  delete doc.accessHash;
  delete doc.phoneHash;
  delete doc.__v;
  return doc;
}
function decorate(ticket, forecast, context) {
  return {
    ...plain(ticket),
    ...(forecast.get(String(ticket._id)) || {
      position: null,
      approximateWaitMinutes: null,
      estimatedCallAt: null,
    }),
    overdue:
      ticket.status === "In Service" && ticket.end <= context.now.toJSDate(),
  };
}
export async function getQueueSnapshot({
  reference,
  token,
  staff,
  now = DateTime.utc(),
} = {}) {
  // Expiry is durable and shares the same mutex as booking/assignment.
  await bookingReady();
  let context = await queueContext(null, now);
  if (await QueueTicket.exists(expiredQuery(context)))
    context = await atomic(async (session) => {
      const ctx = await queueContext(session, now);
      await expire(session, ctx);
      return ctx;
    });
  const tickets = await QueueTicket.find({
    $or: [{ date: context.date }, { status: "In Service" }],
  }).sort({ date: 1, number: 1 });
  const common = {
    serverNow: now.toISO(),
    date: context.date,
    timezone: context.settings.timezone,
    isOpen: context.isOpen,
    acceptingEntries:
      context.isOpen &&
      context.policy.enabled &&
      now < context.close.minus({ minutes: context.policy.joinCutoffMinutes }),
    policy: context.policy,
    waitingCount: tickets.filter((t) => pending.includes(t.status)).length,
    pollSeconds: 10,
  };
  const forecast =
    reference || staff ? await estimates(tickets, context) : new Map();
  if (forecast.size)
    await Promise.all(
      tickets
        .filter(
          (ticket) =>
            pending.includes(ticket.status) &&
            forecast.get(String(ticket._id))?.approximateWaitMinutes !== null &&
            forecast.get(String(ticket._id))?.approximateWaitMinutes <= 15 &&
            (forecast.get(String(ticket._id))?.position || Infinity) <= 2,
        )
        .map((ticket) => queueEvent(ticket, "queue.turn_approaching")),
    );
  if (staff) {
    const visible =
      staff.role === "Artist"
        ? tickets.filter((t) => String(t.artist) === String(staff._id))
        : tickets;
    return {
      ...common,
      tickets: visible.map((t) => decorate(t, forecast, context)),
    };
  }
  if (reference) {
    const own = await QueueTicket.findOne({
      reference,
      accessHash: digest(token || ""),
    });
    if (!own) fail(404, "Ticket not found or private link is invalid");
    return {
      ...common,
      ticket: decorate(own, forecast, context),
      notifications: await notificationsFor("Queue", own.reference),
    };
  }
  const services = await Service.find({ active: true }).select(
    "name category description imageUrl durationMinutes priceMinor",
  );
  const annotated = await Promise.all(
    services.map(async (service) => {
      try {
        const slots = await candidates(
          { service: service._id, durationMinutes: service.durationMinutes },
          context,
          null,
          { forecast: true },
        );
        const walkInSlots = await candidates(
          { service: service._id, durationMinutes: service.durationMinutes, checkedInAt: context.now.toJSDate() },
          context, null, { forecast: true },
        );
        return { ...service.toObject(), bookable: slots.length > 0, walkInBookable: walkInSlots.length > 0 };
      } catch (err) {
        if (err.status === 404) return { ...service.toObject(), bookable: false };
        throw err;
      }
    }),
  );
  return { ...common, currency: context.settings.currency, services: annotated };
}
export async function joinQueue(
  body,
  { source = "Online", now = DateTime.utc() } = {},
) {
  const data = customerData(body),
    notificationPreferences = body.notificationPreferences
      ? validatePreferences(body.notificationPreferences)
      : undefined,
    normalized = data.phone.replace(/[ ()-]/g, "");
  if (!/^\+[1-9]\d{6,14}$/.test(normalized))
    fail(
      400,
      "Use an international phone number beginning with + and country code.",
    );
  const token = randomToken(),
    reference = "QT-" + randomBytes(8).toString("hex").toUpperCase();
  const ticket = await atomic(async (session) => {
    const context = await queueContext(session, now);
    await expire(session, context);
    if (
      !context.policy.enabled ||
      (source === "Online" && !context.policy.remoteEnabled)
    )
      fail(409, "The queue is not accepting these entries right now.");
    if (
      !context.isOpen ||
      now >= context.close.minus({ minutes: context.policy.joinCutoffMinutes })
    )
      fail(409, "Join during salon opening hours and before the queue cutoff.");
    if (
      await QueueTicket.exists({
        active: true,
        phoneHash: digest(normalized),
      }).session(session)
    )
      fail(
        409,
        "An active ticket already exists for this phone number. Use its private link or ask reception.",
      );
    if (
      (await QueueTicket.countDocuments({
        active: true,
        date: context.date,
      }).session(session)) >= context.policy.maxActiveTickets
    )
      fail(409, "Today’s queue has reached its entry limit.");
    const service = await Service.findOne({
      _id: objectId(body.service),
      active: true,
    }).session(session);
    if (!service) fail(404, "Service unavailable");
    const candidate = {
      service: service._id,
      durationMinutes: service.durationMinutes,
      checkedInAt: source === "Walk-in" ? now.toJSDate() : undefined,
    };
    if (!(await candidates(candidate, context, session)).length)
      fail(
        409,
        "No qualified artist has enough time for this service before closing. Please choose an appointment instead.",
      );
    const counter = await QueueDay.findOneAndUpdate(
      { _id: context.date },
      { $inc: { nextNumber: 1 } },
      { new: true, upsert: true, session },
    );
    const status = source === "Walk-in" ? "Checked In" : "Waiting";
    const [doc] = await QueueTicket.create(
      [
        {
          reference,
          accessHash: digest(token),
          phoneHash: digest(normalized),
          number: counter.nextNumber,
          date: context.date,
          timezone: context.settings.timezone,
          source,
          service: service._id,
          serviceName: service.name,
          durationMinutes: service.durationMinutes,
          priceMinor: service.priceMinor,
          currency: context.settings.currency,
          ...data,
          ...(notificationPreferences ? { notificationPreferences } : {}),
          phone: normalized,
          status,
          active: true,
          checkedInAt: candidate.checkedInAt,
          history: [{ status, at: now.toJSDate(), by: source }],
        },
      ],
      { session },
    );
    await queueEvent(doc, "queue.joined", { session });
    return plain(doc);
  });
  return { ticket, token };
}
export async function callNext({ artist, now = DateTime.utc() } = {}) {
  return atomic(async (session) => {
    const context = await queueContext(session, now);
    await expire(session, context);
    if (!context.isOpen || !context.policy.enabled)
      fail(409, "The queue is closed.");
    const tickets = await QueueTicket.find({
      date: context.date,
      status: { $in: pending },
    })
      .sort({ number: 1 })
      .session(session);
    for (const ticket of tickets) {
      const slot = (
        await candidates(ticket, context, session, { instant: true, artist })
      )[0];
      if (!slot) continue;
      ticket.status = "Called";
      ticket.artist = slot.artist;
      ticket.artistName = slot.artistName;
      ticket.calledAt = now.toJSDate();
      ticket.deadlineAt = now
        .plus({
          minutes:
            context.policy.graceMinutes +
            (ticket.checkedInAt ? 0 : context.policy.remoteArrivalMinutes),
        })
        .toJSDate();
      ticket.start = now.toJSDate();
      ticket.end = new Date(slot.end);
      ticket.history.push({
        status: "Called",
        at: now.toJSDate(),
        by: "reception",
      });
      await ticket.save({ session });
      await queueEvent(ticket, "queue.called", { session });
      return plain(ticket);
    }
    fail(
      409,
      "No waiting ticket fits an available qualified artist right now. Protected appointments and breaks take priority.",
    );
  });
}
export async function changeTicket(
  reference,
  action,
  { token, staff, now = DateTime.utc() } = {},
) {
  // Commit expiration independently, even when a subsequent late action is rejected.
  await atomic(async (session) => {
    const context = await queueContext(session, now);
    await expire(session, context);
  });
  return atomic(async (session) => {
    const context = await queueContext(session, now);
    const ticket = await QueueTicket.findOne({
      reference,
      ...(!staff ? { accessHash: digest(token || "") } : {}),
    }).session(session);
    if (!ticket) fail(404, "Ticket not found or private link is invalid");
    if (
      staff?.role === "Artist" &&
      (String(ticket.artist) !== String(staff._id) ||
        !["start", "complete"].includes(action))
    )
      fail(
        403,
        "Artists may only start or complete their own assigned tickets.",
      );
    if (!staff && action !== "cancel")
      fail(403, "Customers may only cancel their ticket.");
    if (
      ticket.status === "Missed" &&
      action === "missed" &&
      staff &&
      staff.role !== "Artist"
    )
      return plain(ticket);
    if (terminal.includes(ticket.status))
      fail(409, "This ticket is already closed.");
    if (action === "check-in") {
      if (!staff || staff.role === "Artist")
        fail(403, "Reception permission required");
      if (!["Waiting", "Called"].includes(ticket.status) || ticket.checkedInAt)
        fail(409, "This ticket cannot be checked in again.");
      ticket.checkedInAt = now.toJSDate();
      if (ticket.status === "Waiting") ticket.status = "Checked In";
    } else if (action === "start") {
      if (ticket.status !== "Called" || !ticket.checkedInAt)
        fail(
          409,
          "Call and physically check in this customer before starting service.",
        );
      if (!context.isOpen) fail(409, "The salon is closed.");
      const slots = await candidates(ticket, context, session, {
        instant: true,
        serviceOnly: true,
        excludeQueue: ticket._id,
        artist: String(ticket.artist),
      });
      if (!slots.length)
        fail(
          409,
          "The service no longer fits. Finish active work or release this hold; appointments and breaks take priority.",
        );
      ticket.status = "In Service";
      ticket.startedAt = now.toJSDate();
      ticket.start = now.toJSDate();
      ticket.end = now.plus({ minutes: ticket.durationMinutes }).toJSDate();
    } else if (action === "complete") {
      if (ticket.status !== "In Service")
        fail(409, "Only an in-service ticket can be completed");
      ticket.status = "Completed";
      ticket.active = false;
      ticket.finishedAt = now.toJSDate();
    } else if (action === "cancel") {
      if (
        !staff &&
        !["Waiting", "Checked In", "Called"].includes(ticket.status)
      )
        fail(409, "Contact reception about an in-service ticket.");
      ticket.status = "Cancelled";
      ticket.active = false;
      ticket.finishedAt = now.toJSDate();
    } else if (action === "missed") {
      if (
        ticket.status !== "Called" ||
        now < DateTime.fromJSDate(ticket.deadlineAt)
      )
        fail(409, "The arrival/grace deadline has not passed");
      ticket.status = "Missed";
      ticket.active = false;
      ticket.finishedAt = now.toJSDate();
    } else fail(400, "Unknown queue action");
    ticket.history.push({
      status: ticket.status,
      at: now.toJSDate(),
      by: staff ? String(staff._id) : "customer",
    });
    await ticket.save({ session });
    if (ticket.status === "Cancelled")
      await queueEvent(ticket, "queue.cancelled", { session });
    else if (ticket.status === "Missed")
      await queueEvent(ticket, "queue.missed", { session });
    return plain(ticket);
  });
}
