import express from "express";
import cors from "cors";
import helmet from "helmet";
export function createApp({
  origins = ["http://localhost:5173", "http://127.0.0.1:5173"],
  databaseStatus = () => "not-configured",
} = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: origins }));
  app.use(express.json({ limit: "10kb" }));
  app.get("/api/health", (_req, res) =>
    res.json({
      status: "ok",
      service: "salon-api",
      database: databaseStatus(),
    }),
  );
  app.use((_req, res) => res.status(404).json({ error: "Endpoint not found" }));
  app.use((err, _req, res, _next) =>
    res
      .status(err.status === 400 ? 400 : 500)
      .json({
        error: err.status === 400 ? "Invalid request" : "Internal server error",
      }),
  );
  return app;
}
