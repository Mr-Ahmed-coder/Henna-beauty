import dotenv from "dotenv";
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { fileURLToPath } from "node:url";
import { localUri, startLocalDatabase } from "./local-database.js";
dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
let database,
  child,
  watcher,
  restartTimer,
  stopping = false,
  restarting = false;
async function stopChild() {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    await exited;
  }
}
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  watcher?.close();
  clearTimeout(restartTimer);
  try {
    await stopChild();
    await database?.stop();
  } finally {
    process.exit(code);
  }
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
try {
  const uri = process.env.MONGODB_URI?.trim() || localUri;
  if (uri === localUri) {
    database = await startLocalDatabase();
    console.log(
      "Development database: persistent loopback replica set salon-dev (server/.local/mongodb).",
    );
  } else
    console.log(
      "Development database: using configured MONGODB_URI; local database launcher skipped.",
    );
  function launch() {
    child = spawn(
      process.execPath,
      [fileURLToPath(new URL("../src/index.js", import.meta.url))],
      {
        stdio: "inherit",
        env: { ...process.env, MONGODB_URI: uri },
        windowsHide: true,
      },
    );
    child.once("error", () => stop(1));
    child.once("exit", (code) => {
      if (!stopping && !restarting) stop(code ?? 1);
    });
  }
  async function restart() {
    if (stopping || restarting) return;
    restarting = true;
    try {
      await stopChild();
      launch();
    } finally {
      restarting = false;
    }
  }
  launch();
  watcher = watch(
    fileURLToPath(new URL("../src", import.meta.url)),
    { recursive: true },
    (_event, filename) => {
      if (String(filename).endsWith(".js") && !stopping) {
        clearTimeout(restartTimer);
        restartTimer = setTimeout(restart, 200);
      }
    },
  );
} catch {
  console.error(
    "Development startup failed. Check the configured database or local port 27027 and binary cache. No credentials or database files were changed.",
  );
  await stop(1);
}
