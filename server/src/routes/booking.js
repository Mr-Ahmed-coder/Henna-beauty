import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { DateTime } from "luxon";
import { Staff, Service, Schedule, Settings } from "../models/index.js";
import {
  ArtistProfile,
  Appointment,
  BookingPolicy,
} from "../models/booking.js";
import { digest } from "../security.js";
import {
  cancelDisabledNotifications,
  notificationsFor,
  processDueNotifications,
  validatePreferences,
} from "../notification/engine.js";
import {
  availability,
  bookingReady,
  configuration,
  createReservation,
  changeReservation,
  safeAppointment,
  fail,
  fields,
  objectId,
} from "../booking/engine.js";
export function bookingRouter({ origins }) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    next();
  });
  router.use(
    rateLimit({
      windowMs: 60000,
      limit: 120,
      legacyHeaders: false,
      standardHeaders: "draft-8",
      message: { error: "Too many booking requests. Please wait a minute." },
    }),
  );
  router.use(async (req, _res, next) => {
    await bookingReady();
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (!origins.includes(req.get("Origin")) || !req.is("application/json"))
    )
      fail(403, "Request origin or content type rejected");
    next();
  });
  router.get("/catalog", async (_req, res) => {
    const { settings, policy } = await configuration();
    const services = await Service.find({ active: true }).select(
      "name category description imageUrl priceMinor durationMinutes",
    );
    const artists = await Staff.find({ active: true, role: "Artist" }).select(
      "name",
    );
    const profiles = await ArtistProfile.find({
      staff: { $in: artists.map((a) => a._id) },
    });
    const scheduled = await Schedule.find({
      staff: { $in: artists.map((a) => a._id) },
      available: true,
      day: { $in: settings.hours.filter((hour) => !hour.closed).map((hour) => hour.day) },
    }).select("staff day start end");
    const artistDetails = artists.map((artist) => ({
      id: String(artist._id),
      name: artist.name,
      services:
        profiles.find((profile) => String(profile.staff) === String(artist._id))
          ?.services || [],
      scheduled: scheduled.some(
        (shift) =>
          String(shift.staff) === String(artist._id) &&
          settings.hours.some(
            (hour) =>
              !hour.closed &&
              hour.day === shift.day &&
              shift.start < hour.close &&
              shift.end > hour.open,
          ),
      ),
    }));
    res.json({
      services: services.map((service) => {
        const qualified = artistDetails.filter((artist) =>
          artist.services.map(String).includes(String(service._id)),
        );
        return {
          ...service.toObject(),
          qualifiedArtistCount: qualified.length,
          scheduledArtistCount: qualified.filter((artist) => artist.scheduled)
            .length,
          bookable: qualified.some((artist) => artist.scheduled),
        };
      }),
      artists: artistDetails,
      timezone: settings.timezone,
      currency: settings.currency,
      policy,
    });
  });
  router.get("/availability", async (req, res) => {
    const result = await availability({
      service: req.query.service,
      date: req.query.date,
      artist: req.query.artist,
    });
    res.json({
      slots: result.slots,
      timezone: result.timezone,
      date: result.date,
    });
  });
  router.post(
    "/reservations",
    rateLimit({
      windowMs: 3600000,
      limit: 20,
      legacyHeaders: false,
      standardHeaders: "draft-8",
      message: {
        error: "Reservation request limit reached. Please try later.",
      },
    }),
    async (req, res) =>
      res
        .status(201)
        .json(
          await createReservation(
            fields(req.body, [
              "service",
              "artist",
              "start",
              "customerName",
              "phone",
              "notes",
              "notificationPreferences",
            ]),
          ),
        ),
  );
  router.get("/reservations/:reference", async (req, res) => {
    const token = req.get("X-Booking-Token");
    if (!token || token.length > 128)
      fail(404, "Reservation not found or private access link is invalid");
    const doc = await Appointment.findOne({
      reference: req.params.reference,
      accessHash: digest(token),
    });
    if (!doc)
      fail(404, "Reservation not found or private access link is invalid");
    await processDueNotifications();
    const { policy } = await configuration();
    res.json({
      appointment: safeAppointment(doc),
      policy,
      notifications: await notificationsFor("Appointment", doc.reference),
    });
  });
  router.patch("/reservations/:reference", async (req, res) => {
    const token = req.get("X-Booking-Token");
    if (!token || token.length > 128)
      fail(404, "Reservation not found or private access link is invalid");
    res.json(
      await changeReservation(
        req.params.reference,
        fields(req.body, ["action", "status", "start", "artist"]),
        { token },
      ),
    );
  });
  router.put("/reservations/:reference/notification-preferences", async (req, res) => {
    const token = req.get("X-Booking-Token");
    if (!token || token.length > 128)
      fail(404, "Reservation not found or private access link is invalid");
    const doc = await Appointment.findOne({
      reference: req.params.reference,
      accessHash: digest(token),
    });
    if (!doc)
      fail(404, "Reservation not found or private access link is invalid");
    const notificationPreferences = validatePreferences(
      fields(req.body, ["inApp", "sms", "whatsapp"]),
    );
    doc.notificationPreferences = notificationPreferences;
    await doc.save();
    await cancelDisabledNotifications(
      "Appointment",
      doc.reference,
      notificationPreferences,
    );
    res.json({ notificationPreferences });
  });
  return router;
}
// Mounted after existing staff session and CSRF middleware.
export function appointmentAdminRouter() {
  const router = Router();
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  const desk = (req, _res, next) => {
    if (!["Admin", "Receptionist"].includes(req.staff.role))
      fail(403, "Receptionist or administrator permission required");
    next();
  };
  const admin = (req, _res, next) => {
    if (req.staff.role !== "Admin")
      fail(403, "Administrator permission required");
    next();
  };
  router.get("/appointments", async (req, res) => {
    const query = {
      ...(req.staff.role === "Artist" ? { artist: req.staff._id } : {}),
    };
    if (req.query.q) {
      if (typeof req.query.q !== "string" || req.query.q.length > 120)
        fail(400, "Search must be at most 120 characters");
      const literal = req.query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = ["reference", "customerName", "phone"].map((key) => ({
        [key]: { $regex: literal, $options: "i" },
      }));
    }
    if (req.query.status) {
      const { statuses } = await import("../models/booking.js");
      if (!statuses.includes(req.query.status)) fail(400, "Unknown status");
      query.status = req.query.status;
    }
    if (req.query.today !== undefined) {
      if (req.query.today !== "1") fail(400, "Invalid appointment filter");
      const settings = await Settings.findById("salon");
      if (!settings) query._id = { $exists: false };
      else {
        const start = DateTime.now()
          .setZone(settings.timezone)
          .startOf("day");
        query.start = {
          $gte: start.toUTC().toJSDate(),
          $lt: start.plus({ days: 1 }).toUTC().toJSDate(),
        };
      }
    }
    const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1));
    if (!Number.isInteger(page)) fail(400, "Invalid page");
    const total = await Appointment.countDocuments(query);
    const appointments = await Appointment.find(query)
      .sort({ start: -1, _id: 1 })
      .skip((page - 1) * 30)
      .limit(30);
    res.json({ appointments: appointments.map(safeAppointment), total, page });
  });
  router.post("/appointments", desk, async (req, res) =>
    res
      .status(201)
      .json(
        await createReservation(
          fields(req.body, [
            "service",
            "artist",
            "start",
            "customerName",
            "phone",
            "notes",
            "notificationPreferences",
          ]),
          String(req.staff._id),
        ),
      ),
  );
  router.patch("/appointments/:reference", async (req, res) =>
    res.json(
      await changeReservation(
        req.params.reference,
        fields(req.body, ["action", "status", "start", "artist"]),
        { staff: req.staff },
      ),
    ),
  );
  router.get("/booking-policy", async (_req, res) =>
    res.json((await BookingPolicy.findById("salon")) || new BookingPolicy()),
  );
  router.put("/booking-policy", admin, async (req, res) => {
    const body = fields(req.body, [
      "approvalRequired",
      "cancellationEnabled",
      "reschedulingEnabled",
      "cancellationNoticeHours",
      "reschedulingNoticeHours",
      "minimumNoticeMinutes",
      "advanceDays",
      "slotIntervalMinutes",
    ]);
    const doc = (await BookingPolicy.findById("salon")) || new BookingPolicy();
    doc.set(body);
    await doc.save();
    res.json(doc);
  });
  router.get("/artist-profiles", async (req, res) =>
    res.json(
      await ArtistProfile.find(
        req.staff.role === "Artist" ? { staff: req.staff._id } : {},
      ),
    ),
  );
  router.put("/artist-profiles/:id", admin, async (req, res) => {
    const staff = objectId(req.params.id);
    if (!(await Staff.exists({ _id: staff, active: true, role: "Artist" })))
      fail(400, "Choose an active Artist");
    const body = fields(req.body, ["services", "breaks"]);
    if (
      !Array.isArray(body.services) ||
      body.services.length > 200 ||
      new Set(body.services).size !== body.services.length
    )
      fail(400, "Choose service qualifications");
    for (const service of body.services) objectId(service);
    if (
      (await Service.countDocuments({ _id: { $in: body.services } })) !==
      body.services.length
    )
      fail(400, "Unknown service");
    const doc =
      (await ArtistProfile.findOne({ staff })) || new ArtistProfile({ staff });
    doc.set(body);
    await doc.save();
    res.json(doc);
  });
  return router;
}
