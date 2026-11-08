import mongoose from "mongoose";
import {
  demoDatabaseName, demoDatabasePort, demoReplicaSet, setDemoAdministrator,
} from "./demo-data.js";
import { demoOrigin, verifyDemoLogin } from "./demo-login.js";
import { Staff } from "../src/models/index.js";
import { verifyPassword } from "../src/security.js";

const atlas = process.argv[2] === "--atlas";

function atlasDemoUri() {
  const uri = process.env.ATLAS_DEMO_MONGODB_URI;
  const cluster = process.env.ATLAS_DEMO_CLUSTER?.toLowerCase();
  const match = uri?.match(/^mongodb(\+srv)?:\/\/[^:/@<>\s]+:[^/@<>\s]+@([^/?#]+)\/salon_demo(?:\?([^#]*))?$/i);
  if (!match || !/^[a-z0-9-]+\.[a-z0-9-]+\.mongodb\.net$/.test(cluster || "")) throw new Error();
  const [, srv, hostList, query] = match;
  const hosts = hostList.toLowerCase().split(",");
  const clusterSuffix = cluster.slice(cluster.indexOf("."));
  if (srv ? hostList.toLowerCase() !== cluster : hosts.some((host) =>
    !/^[a-z0-9.-]+\.mongodb\.net:\d+$/.test(host) || !host.split(":")[0].endsWith(clusterSuffix))) throw new Error();
  const options = new URLSearchParams(query);
  for (const [key, value] of options) {
    if (/^(?:tls|ssl)/i.test(key) && !(/^tls$/i.test(key) && value === "true")) throw new Error();
  }
  return uri;
}

let failure = "Run demo-admin.ps1 in a private PowerShell window.";
try {
  if (process.env.NODE_ENV === "production" || process.stdin.isTTY) throw new Error();
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 4096) throw new Error();
  }
  const { email, password, verifyOnly } = JSON.parse(input);
  failure = "Enter a valid email and a password of 12–128 characters.";
  if (typeof email !== "string" || email.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof password !== "string" || password.length < 12 || password.length > 128) throw new Error();

  if (atlas || verifyOnly !== true) {
    failure = atlas
      ? "Could not connect to the Atlas demo. Check the private Atlas demo URI, database name, and Atlas network access."
      : "Start npm run demo and leave it running while you set the credentials.";
    const uri = atlas ? atlasDemoUri() : `mongodb://127.0.0.1:${demoDatabasePort}/${demoDatabaseName}?replicaSet=${demoReplicaSet}`;
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: atlas ? 10000 : 3000, autoCreate: false, autoIndex: false,
      ...(atlas ? { tls: true, tlsAllowInvalidCertificates: false, tlsAllowInvalidHostnames: false } : {}),
    });

    failure = "The demo administrator could not be updated. Check that the demo is initialized and that its Demo Administrator account can be uniquely identified.";
    await setDemoAdministrator({ email, password });
    console.log("Demo administrator saved.");
  }

  if (atlas) {
    failure = "The Atlas demo administrator credentials could not be verified.";
    const account = await Staff.findOne({
      email: email.trim().toLowerCase(), role: "Admin", active: true,
    }).select("+passwordHash");
    if (!account || !(await verifyPassword(password, account.passwordHash))) throw new Error();
    console.log("Atlas demo administrator password verified. Verify live sign-in after the Render deployment.");
  } else {
    failure = `The demo login or dashboard could not be verified. Check that npm run demo is running at ${demoOrigin}.`;
    if (!(await verifyDemoLogin(demoOrigin, { email, password }))) {
      failure = "The demo rejected those credentials. Check the email and password, or run this command without -VerifyOnly to reset them.";
      throw new Error();
    }
    console.log(`Demo login and administrator dashboard verified. Sign in at ${demoOrigin}/staff`);
  }
} catch (error) {
  console.error(error.code === 11000 ? "That email is already in use by another demo staff member." : failure);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
