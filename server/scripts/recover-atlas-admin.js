import mongoose from "mongoose";
import { databaseReadiness } from "../src/config/database.js";
import { inspectAdministrators, recoverAdministrator } from "../src/atlas-admin-recovery.js";

let stage = "Atlas configuration";
try {
  // This command takes its target only from the dedicated Atlas variable.
  const uri = process.env.ATLAS_MONGODB_URI;
  if (!uri?.startsWith("mongodb+srv://") || /[<>]/.test(uri)) throw new Error();
  const url = new URL(uri);
  const name = decodeURIComponent(url.pathname.slice(1));
  const insecure = [...url.searchParams.keys()].some((key) => key.toLowerCase() === "tlsinsecure");
  if (!url.hostname.endsWith(".mongodb.net") || !name || name.includes("/") ||
    insecure || ["admin", "local", "config", "salon_demo"].includes(name)) throw new Error();
  const target = `${url.hostname}/${name}`;

  stage = "Atlas connectivity";
  await mongoose.connect(uri, {
    autoCreate: false,
    autoIndex: false,
    tls: true,
    tlsAllowInvalidCertificates: false,
    tlsAllowInvalidHostnames: false,
    serverSelectionTimeoutMS: 8000,
  });
  if (mongoose.connection.db.databaseName !== name || !(await databaseReadiness()).bookingsReady) {
    throw new Error();
  }

  if (process.argv[2] === "--inspect") {
    stage = "read-only administrator inspection";
    const state = await mongoose.connection.transaction(
      (session) => inspectAdministrators(session),
      { readConcern: { level: "snapshot" } },
    );
    console.log(`Verified Atlas target ${target}`);
    console.log(`Administrator accounts ${state.administratorCount}. Original administrator records ${state.originalCount}.`);
    if (state.originalIsActiveAdmin) console.log("Original active administrator found. Choose reset.");
    else if (!state.originalCount && !state.administratorCount) console.log("No administrator found. Choose bootstrap only if this is the intended application database.");
    else console.log("Review the existing administrator records before attempting recovery.");
  } else {
    stage = "private input and target confirmation";
    if (process.argv[2] !== "--apply" || process.stdin.isTTY) throw new Error();
    let input = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) {
      input += chunk;
      if (input.length > 4096) throw new Error();
    }
    const { confirmTarget, ...credentials } = JSON.parse(input);
    if (confirmTarget !== target) throw new Error();
    stage = "administrator recovery";
    await recoverAdministrator(credentials);
    console.log("Administrator credentials saved. Sign in through the application’s /staff page.");
  }
} catch {
  console.error(`Recovery stopped during ${stage}. See ADMIN-RECOVERY.md.`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
