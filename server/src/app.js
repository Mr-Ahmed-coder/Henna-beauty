import express from "express";
import cors from "cors";
import helmet from "helmet";
import { adminRouter } from "./routes/admin.js";
import { bookingRouter } from "./routes/booking.js";
import { queueRouter } from "./routes/queue.js";
import { databaseReadiness } from "./config/database.js";
export function createApp({
  origins = ["http://localhost:5173", "http://127.0.0.1:5173"],
  databaseStatus = () => "not-configured",
  queueClock,
  trustProxy = 0,
} = {}) {
  const app = express();
  app.set("trust proxy", trustProxy);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: origins, credentials: true }));
  app.use(express.json({ limit: "10kb" }));
  app.get("/api/health", (_req, res) =>
    res.json({
      status: "ok",
      service: "salon-api",
      database: databaseStatus(),
    }),
  );
  app.get("/api/ready", async (_req, res) => {
    const readiness = await databaseReadiness();
    res
      .set("Cache-Control", "no-store")
      .status(readiness.bookingsReady ? 200 : 503)
      .json(readiness);
  });
  app.use("/api/admin", adminRouter({ origins, queueClock }));
  app.use("/api/booking", bookingRouter({ origins }));
  app.use("/api/queue", queueRouter({ origins, clock: queueClock }));
  app.use((_req, res) => res.status(404).json({ error: "Endpoint not found" }));
  app.use((err, _req, res, _next) =>
    res
      .status(
        err.code === 11000
          ? 409
          : err.type === "entity.parse.failed" ? 400
          : err.type === "entity.too.large" ? 413
          : err.name === "ValidationError" ||
              err.name === "StrictModeError" ||
              err.name === "CastError"
            ? 400
            : err.status >= 400 && err.status < 600
              ? err.status
              : 500,
      )
      .json({
        error:
          err.code === 11000
            ? "An account or schedule with these details already exists"
            : err.type === "entity.parse.failed" ? "Invalid JSON request body"
            : err.type === "entity.too.large" ? "Request body is too large"
            : err.name === "ValidationError" ||
                err.name === "StrictModeError" ||
                err.name === "CastError"
              ? "Invalid data. Check required fields, formats and ranges."
              : (err.status >= 400 && err.status < 500) || err.status === 503
                ? err.message
                : "Internal server error",
      }),
  );
  return app;
}
