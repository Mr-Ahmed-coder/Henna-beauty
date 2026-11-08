import mongoose from "mongoose";
import {
  demoDatabaseName, demoDatabasePort, demoReplicaSet, setDemoAdministrator,
} from "./demo-data.js";

let failure = "Run demo-admin.ps1 in a private PowerShell window.";
try {
  if (process.env.NODE_ENV === "production" || process.stdin.isTTY) throw new Error();
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 4096) throw new Error();
  }
  const { email, password } = JSON.parse(input);
  failure = "Enter a valid email and a password of 12–128 characters.";
  if (typeof email !== "string" || email.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof password !== "string" || password.length < 12 || password.length > 128) throw new Error();

  failure = "Start npm run demo and leave it running while you set the credentials.";
  // Always use the isolated demo. Never read an application or Atlas URI.
  await mongoose.connect(`mongodb://127.0.0.1:${demoDatabasePort}/${demoDatabaseName}?replicaSet=${demoReplicaSet}`, {
    serverSelectionTimeoutMS: 3000, autoCreate: false, autoIndex: false,
  });

  failure = "The demo administrator could not be updated. Check that the demo is initialized and that its Demo Administrator account can be uniquely identified.";
  await setDemoAdministrator({ email, password });
  console.log("Demo administrator saved. Sign in at http://127.0.0.2:5180/staff");
} catch (error) {
  console.error(error.code === 11000 ? "That email is already in use by another demo staff member." : failure);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
