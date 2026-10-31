import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { DateTime } from "luxon";
import { QueuePolicy } from "../models/queue.js";
import { bookingReady, fail, fields } from "../booking/engine.js";
import {
  cancelDisabledNotifications,
  processDueNotifications,
  validatePreferences,
} from "../notification/engine.js";
import { QueueTicket } from "../models/queue.js";
import { digest } from "../security.js";
import {
  getQueueSnapshot,
  joinQueue,
  callNext,
  changeTicket,
} from "../queue/engine.js";
export function queueRouter({ origins, clock = () => DateTime.utc() }) {
  const router = Router();
  router.all("/", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found" }),
  );
  router.use((_req, res, next) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    next();
  });
  router.use(
    rateLimit({
      windowMs: 60000,
      limit: 180,
      legacyHeaders: false,
      standardHeaders: "draft-8",
      message: { error: "Too many queue requests. Please wait a minute." },
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
    await processDueNotifications();
    res.json(await getQueueSnapshot({ now: clock() }));
  });
  router.post(
    "/tickets",
    rateLimit({
      windowMs: 3600000,
      limit: 20,
      legacyHeaders: false,
      standardHeaders: "draft-8",
      message: { error: "Queue entry limit reached. Please try later." },
    }),
    async (req, res) =>
      res
        .status(201)
        .json(
          await joinQueue(
            fields(req.body, [
              "service",
              "customerName",
              "phone",
              "notes",
              "notificationPreferences",
            ]),
            { now: clock() },
          ),
        ),
  );
  const privateToken = (req) => {
    const token = req.get("X-Queue-Token");
    if (!token || token.length > 128)
      fail(404, "Ticket not found or private link is invalid");
    return token;
  };
  router.get("/tickets/:reference", async (req, res) => {
    await processDueNotifications();
    res.json(
      await getQueueSnapshot({
        reference: req.params.reference,
        token: privateToken(req),
        now: clock(),
      }),
    );
  });
  router.patch("/tickets/:reference", async (req, res) => {
    const { action } = fields(req.body, ["action"]);
    res.json(
      await changeTicket(req.params.reference, action, {
        token: privateToken(req),
        now: clock(),
      }),
    );
  });
  router.put("/tickets/:reference/notification-preferences", async (req, res) => {
    const token = privateToken(req);
    const ticket = await QueueTicket.findOne({
      reference: req.params.reference,
      accessHash: digest(token),
    });
    if (!ticket) fail(404, "Ticket not found or private link is invalid");
    const notificationPreferences = validatePreferences(
      fields(req.body, ["inApp", "sms", "whatsapp"]),
    );
    ticket.notificationPreferences = notificationPreferences;
    await ticket.save();
    await cancelDisabledNotifications(
      "Queue",
      ticket.reference,
      notificationPreferences,
    );
    res.json({ notificationPreferences });
  });
  return router;
}
export function queueAdminRouter({ clock = () => DateTime.utc() } = {}) {
  const router = Router();
  const desk = (req, _res, next) => {
    if (!["Admin", "Receptionist"].includes(req.staff.role))
      fail(403, "Receptionist or administrator permission required");
    next();
  };
  router.get("/queue", async (req, res) =>
    res.json(await getQueueSnapshot({ staff: req.staff, now: clock() })),
  );
  router.post("/queue/tickets", desk, async (req, res) =>
    res
      .status(201)
      .json(
        await joinQueue(
          fields(req.body, [
            "service",
            "customerName",
            "phone",
            "notes",
            "notificationPreferences",
          ]),
          { source: "Walk-in", now: clock() },
        ),
      ),
  );
  router.post("/queue/call-next", desk, async (req, res) => {
    const { artist } = fields(req.body, ["artist"]);
    res.json(await callNext({ artist, now: clock() }));
  });
  router.patch("/queue/tickets/:reference", async (req, res) => {
    const { action } = fields(req.body, ["action"]);
    res.json(
      await changeTicket(req.params.reference, action, {
        staff: req.staff,
        now: clock(),
      }),
    );
  });
  router.get("/queue-policy", async (_req, res) =>
    res.json((await QueuePolicy.findById("salon")) || new QueuePolicy()),
  );
  router.put("/queue-policy", async (req, res) => {
    if (req.staff.role !== "Admin")
      fail(403, "Administrator permission required");
    const body = fields(req.body, [
      "enabled",
      "remoteEnabled",
      "remoteArrivalMinutes",
      "graceMinutes",
      "joinCutoffMinutes",
      "maxActiveTickets",
    ]);
    const doc = (await QueuePolicy.findById("salon")) || new QueuePolicy();
    doc.set(body);
    await doc.save();
    res.json(doc);
  });
  return router;
}
