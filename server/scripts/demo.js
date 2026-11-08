import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import express from "express";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { startLocalDatabase } from "./local-database.js";
import { demoDatabaseName, demoDatabasePort, demoIsSeeded, demoReplicaSet, readDemoCatalogue, seedDemo } from "./demo-data.js";

const host = "127.0.0.2";
const port = 5180;
const origin = `http://${host}:${port}`;
const directory = new URL("../.local/demo/", import.meta.url);
const assets = new URL("../../client/dist/", import.meta.url);
let database;
let listener;
let stopping = false;

async function stop() {
  if (stopping) return;
  stopping = true;
  if (listener?.listening) await new Promise((closed) => listener.close(closed));
  await mongoose.disconnect();
  await database?.stop();
}

try {
  if (process.env.NODE_ENV === "production") throw new Error("The demo runs in local development mode.");
  const html = await readFile(new URL("index.html", assets), "utf8");
  database = await startLocalDatabase({
    port: demoDatabasePort,
    name: demoReplicaSet,
    database: demoDatabaseName,
    dbPath: fileURLToPath(new URL("mongodb", directory)),
  });
  await mongoose.connect(database.uri, { serverSelectionTimeoutMS: 5000 });

  if (!(await demoIsSeeded())) {
    const catalogue = await readDemoCatalogue().catch(() => {
      throw new Error("First setup needs the existing local catalogue on port 27027. Start npm run dev:db -w server and check that it has three services.");
    });
    await seedDemo({
      ...catalogue,
      artistPassword: randomBytes(24).toString("base64url"),
    });
  }

  const preview = express();
  const api = createApp({ origins: [origin], databaseStatus: () => mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
  preview.use((req, res, next) => {
    if (req.path === "/api" || req.path.startsWith("/api/")) return api(req, res);
    next();
  });
  preview.use(express.static(fileURLToPath(assets), { index: false }));
  preview.get(/.*/, (_req, res) => {
    res.send(html.replace("<body>", '<body><aside aria-label="Demo notice" style="background:#482735;color:#fff8f2;text-align:center;padding:.65rem 1rem;font:600 14px system-ui">DEMO · Sample services, staff, and hours. Use test customer details.</aside>'));
  });
  listener = preview.listen(port, host);
  await new Promise((ready, reject) => {
    listener.once("listening", ready);
    listener.once("error", reject);
  });
  console.log(`Salon demo: ${origin}`);
  console.log(`Staff sign-in: ${origin}/staff`);
  console.log("Set demo login credentials from another PowerShell window with .\\server\\scripts\\demo-admin.ps1");
  process.once("SIGINT", () => stop());
  process.once("SIGTERM", () => stop());
} catch (error) {
  // All MongoDB connections in this launcher use fixed loopback URIs.
  console.error("Demo startup failed:", error.message);
  await stop();
  process.exitCode = 1;
}
