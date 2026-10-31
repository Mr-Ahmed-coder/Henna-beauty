import { Router } from "express";
import mongoose from "mongoose";
import { rateLimit } from "express-rate-limit";
import { appointmentAdminRouter } from "./booking.js";
import {
  Staff,
  Session,
  Service,
  Schedule,
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
    const staff = await Staff.findById(id(req.params.id));
    if (!staff) fail(404, "Staff not found");
    if (staff.bootstrap || String(staff._id) === String(req.staff._id))
      fail(409, "This administrator cannot be deleted");
    await Staff.deleteOne({ _id: staff._id });
    await Session.deleteMany({ staff: staff._id });
    await Schedule.deleteMany({ staff: staff._id });
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
            "description",
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
        "description",
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
  router.put("/settings", admin, async (req, res) => {
    const body = fields(req.body, ["name", "currency", "timezone", "hours"]);
    try {
      new Intl.DateTimeFormat("en", { timeZone: body.timezone });
    } catch {
      fail(400, "Invalid timezone");
    }
    const doc = (await Settings.findById("salon")) || new Settings();
    doc.set(body);
    await doc.save();
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
  router.use(appointmentAdminRouter());
  return router;
}
