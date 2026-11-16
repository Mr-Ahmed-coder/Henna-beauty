import { Router } from "express";
import mongoose from "mongoose";
import { DateTime } from "luxon";
import { rateLimit } from "express-rate-limit";
import { appointmentAdminRouter } from "./booking.js";
import { queueAdminRouter } from "./queue.js";
import { businessReport, operationsMetrics } from "../reporting.js";
import { saveBusinessSettings } from "../business-settings.js";
import { providerConfiguration } from "../notification/providers.js";
import { Appointment, ArtistProfile } from "../models/booking.js";
import { QueueTicket } from "../models/queue.js";
import { atomic } from "../booking/engine.js";
import {
  Staff,
  Session,
  Service,
  Schedule,
  ScheduleException,
  Settings,
} from "../models/index.js";
import {
  digest,
  randomToken,
  hashPassword,
  verifyPassword,
  publicStaff,
} from "../security.js";
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
function fields(body, allowed) {
  if (
    !body ||
    Array.isArray(body) ||
    typeof body !== "object" ||
    Object.keys(body).some((k) => !allowed.includes(k))
  )
    fail(400, "Invalid request fields");
  return body;
}
const id = (value) => {
  if (!mongoose.isValidObjectId(value)) fail(400, "Invalid ID");
  return value;
};
export function adminRouter({
  origins,
  queueClock,
  secureCookies = process.env.NODE_ENV === "production",
} = {}) {
  const router = Router();
  const cookieName = secureCookies ? "__Host-salon_session" : "salon_session";
  const cookieOptions = {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "strict",
    path: "/",
  };
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.use((req, _res, next) => {
    if (mongoose.connection.readyState !== 1)
      return next(
        Object.assign(
          new Error("Staff administration requires a connected database"),
          { status: 503 },
        ),
      );
    next();
  });
  router.use((req, _res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (!origins.includes(req.get("Origin")) || !req.is("application/json"))
    )
      return next(
        Object.assign(new Error("Request origin or content type rejected"), {
          status: 403,
        }),
      );
    next();
  });
  router.post(
    "/auth/login",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Too many login attempts. Try again later." },
    }),
    async (req, res) => {
      const { email, password } = fields(req.body, ["email", "password"]);
      if (
        typeof email !== "string" ||
        email.length > 254 ||
        typeof password !== "string" ||
        password.length > 128
      )
        fail(400, "Invalid credentials");
      const staff = await Staff.findOne({
        email: email.trim().toLowerCase(),
        active: true,
      }).select("+passwordHash");
      // Perform equal-cost hashing even for unknown accounts.
      const fallback = "00000000000000000000000000000000:" + "00".repeat(64);
      if (
        !(await verifyPassword(password, staff?.passwordHash || fallback)) ||
        !staff
      )
        fail(401, "Invalid email or password");
      const token = randomToken(),
        csrf = randomToken(),
        expires = new Date(Date.now() + 8 * 60 * 60 * 1000);
      const old = req.headers.cookie
        ?.split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith(cookieName + "="))
        ?.slice(cookieName.length + 1);
      if (old) await Session.deleteOne({ token: digest(old) });
      await Session.create({
        token: digest(token),
        csrf,
        staff: staff._id,
        expires,
      });
      res
        .cookie(cookieName, token, {
          ...cookieOptions,
          maxAge: 8 * 60 * 60 * 1000,
        })
        .json({ staff: publicStaff(staff), csrf });
    },
  );
  router.use(async (req, _res, next) => {
    const token = req.headers.cookie
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
    if (!token) fail(401, "Staff login required");
    const session = await Session.findOne({
      token: digest(token),
      expires: { $gt: new Date() },
    });
    const staff =
      session && (await Staff.findOne({ _id: session.staff, active: true }));
    if (!staff) fail(401, "Session expired. Please log in again.");
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.get("X-CSRF-Token") !== session.csrf
    )
      fail(403, "Invalid security token");
    req.staff = staff;
    req.session = session;
    next();
  });
  router.get("/auth/me", (req, res) =>
    res.json({ staff: publicStaff(req.staff), csrf: req.session.csrf }),
  );
  router.post("/auth/logout", async (req, res) => {
    await Session.deleteOne({ _id: req.session._id });
    res.clearCookie(cookieName, cookieOptions).json({ ok: true });
  });
  const admin = (req, _res, next) => {
    if (req.staff.role !== "Admin")
      fail(403, "Administrator permission required");
    next();
  };
  router.get("/staff", async (req, res) => {
    res.json(
      req.staff.role === "Artist"
        ? [publicStaff(req.staff)]
        : (await Staff.find().sort({ name: 1 })).map(publicStaff),
    );
  });
  router.post("/staff", admin, async (req, res) => {
    const body = fields(req.body, [
      "name",
      "email",
      "password",
      "role",
      "active",
    ]);
    const passwordHash = await hashPassword(body.password);
    const { password: _password, ...account } = body;
    const staff = await Staff.create({ ...account, passwordHash });
    res.status(201).json(publicStaff(staff));
  });
  router.patch("/staff/:id", admin, async (req, res) => {
    const body = fields(req.body, [
      "name",
      "email",
      "password",
      "role",
      "active",
    ]);
    const staff = await Staff.findById(id(req.params.id));
    if (!staff) fail(404, "Staff not found");
    if (
      staff.bootstrap &&
      ((body.role && body.role !== "Admin") || body.active === false)
    )
      fail(409, "The initial administrator must remain active with Admin role");
    if (
      String(staff._id) === String(req.staff._id) &&
      (body.active === false || (body.role && body.role !== "Admin"))
    )
      fail(409, "You cannot remove your own access");
    const { password, ...updates } = body;
    staff.set(updates);
    if (password !== undefined)
      staff.passwordHash = await hashPassword(password);
    await staff.save();
    await Session.deleteMany({ staff: staff._id });
    res.json(publicStaff(staff));
  });
  router.delete("/staff/:id", admin, async (req, res) => {
    const staffId = id(req.params.id);
    await atomic(async (session) => {
      const staff = await Staff.findById(staffId).session(session);
      if (!staff) fail(404, "Staff not found");
      if (staff.bootstrap || String(staff._id) === String(req.staff._id))
        fail(409, "This administrator cannot be deleted");
      const filter = { staff: staff._id };
      await Session.deleteMany(filter, { session });
      await Schedule.deleteMany(filter, { session });
      await ScheduleException.deleteMany(filter, { session });
      await ArtistProfile.deleteOne(filter, { session });
      await Staff.deleteOne({ _id: staff._id }, { session });
      // Appointments and tickets keep their original artist references and name snapshots.
    });
    res.json({ ok: true });
  });
  router.get("/services", async (_req, res) =>
    res.json(await Service.find().sort({ name: 1 })),
  );
  router.post("/services", admin, async (req, res) =>
    res
      .status(201)
      .json(
        await Service.create(
          fields(req.body, [
            "name",
            "category",
            "description",
            "imageUrl",
            "priceMinor",
            "durationMinutes",
            "active",
          ]),
        ),
      ),
  );
  router.patch("/services/:id", admin, async (req, res) => {
    const doc = await Service.findById(id(req.params.id));
    if (!doc) fail(404, "Service not found");
    doc.set(
      fields(req.body, [
        "name",
        "category",
        "description",
        "imageUrl",
        "priceMinor",
        "durationMinutes",
        "active",
      ]),
    );
    await doc.save();
    res.json(doc);
  });
  router.delete("/services/:id", admin, async (req, res) => {
    const result = await Service.deleteOne({ _id: id(req.params.id) });
    if (!result.deletedCount) fail(404, "Service not found");
    res.json({ ok: true });
  });
  router.get("/settings", async (_req, res) =>
    res.json(await Settings.findById("salon")),
  );
  router.get("/operations-metrics", async (req, res) => res.json(await operationsMetrics(req.staff)));
  router.get("/reports", admin, async (req, res) =>
    res.json(await businessReport({ period: req.query.period, date: req.query.date })),
  );
  router.get("/notification-settings", admin, (_req, res) => res.json({
    providers: providerConfiguration(), reminderHours: 24, pollSeconds: 10,
    message: "Preferences are controlled per private customer visit. External delivery requires approved activation.",
  }));
  router.put("/settings", admin, async (req, res) => {
    const body = fields(req.body, ["name", "currency", "timezone", "hours", "phone", "email", "address"]);
    try {
      new Intl.DateTimeFormat("en", { timeZone: body.timezone });
    } catch {
      fail(400, "Invalid timezone");
    }
    const doc = await saveBusinessSettings(body);
    res.json(doc);
  });
  router.get("/schedules", async (req, res) =>
    res.json(
      await Schedule.find(
        req.staff.role === "Artist" ? { staff: req.staff._id } : {},
      ).sort({ staff: 1, day: 1 }),
    ),
  );
  router.post("/schedules", admin, async (req, res) => {
    const body = fields(req.body, [
      "staff",
      "day",
      "available",
      "start",
      "end",
    ]);
    if (!(await Staff.exists({ _id: id(body.staff), active: true })))
      fail(400, "Choose an active staff account");
    res.status(201).json(await Schedule.create(body));
  });
  router.patch("/schedules/:id", admin, async (req, res) => {
    const body = fields(req.body, ["available", "start", "end"]);
    const doc = await Schedule.findById(id(req.params.id));
    if (!doc) fail(404, "Schedule not found");
    doc.set(body);
    await doc.save();
    res.json(doc);
  });
  router.delete("/schedules/:id", admin, async (req, res) => {
    const result = await Schedule.deleteOne({ _id: id(req.params.id) });
    if (!result.deletedCount) fail(404, "Schedule not found");
    res.json({ ok: true });
  });
  async function checkExceptionChange(staff, date, session) {
    const settings = await Settings.findById("salon").session(session);
    if (!settings) fail(409, "Save salon hours and timezone first");
    const day = DateTime.fromISO(date, { zone: settings.timezone });
    if (!day.isValid || day.toISODate() !== date)
      fail(400, "Choose a valid exception date");
    if (await Appointment.exists({
      artist: staff,
      status: { $in: ["Pending", "Confirmed", "Checked In", "In Service"] },
      start: { $lt: day.plus({ days: 1 }).toJSDate() },
      end: { $gt: day.toJSDate() },
    }).session(session) || await QueueTicket.exists({ artist: staff, date, active: true }).session(session))
      fail(409, "Review this artist’s existing appointments or active queue visits before changing this date.");
  }
  router.get("/schedule-exceptions", admin, async (_req, res) =>
    res.json(await ScheduleException.find().sort({ date: 1, staff: 1 })),
  );
  router.put("/schedule-exceptions", admin, async (req, res) => {
    const body = fields(req.body, ["staff", "date", "available", "start", "end"]);
    if (typeof body.staff !== "string" || typeof body.date !== "string" ||
        typeof body.available !== "boolean") fail(400, "Choose an artist, date, and availability");
    const staff = id(body.staff);
    const result = await atomic(async (session) => {
      if (!(await Staff.exists({ _id: staff, role: "Artist", active: true }).session(session)))
        fail(400, "Choose an active artist");
      await checkExceptionChange(staff, body.date, session);
      const exception = await ScheduleException.findOne({ staff, date: body.date }).session(session) ||
        new ScheduleException({ staff, date: body.date });
      exception.set({ available: body.available, start: body.start, end: body.end });
      return exception.save({ session });
    });
    res.json(result);
  });
  router.delete("/schedule-exceptions/:id", admin, async (req, res) => {
    const exceptionId = id(req.params.id);
    await atomic(async (session) => {
      const exception = await ScheduleException.findById(exceptionId).session(session);
      if (!exception) fail(404, "Schedule exception not found");
      await checkExceptionChange(exception.staff, exception.date, session);
      await exception.deleteOne({ session });
    });
    res.json({ ok: true });
  });
  router.use(appointmentAdminRouter());
  router.use(queueAdminRouter({ clock: queueClock }));
  return router;
}
