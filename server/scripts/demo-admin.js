import mongoose from "mongoose";
import {
  demoDatabaseName, demoDatabasePort, demoReplicaSet, setDemoAdministrator,
} from "./demo-data.js";
import { demoOrigin, verifyDemoLogin } from "./demo-login.js";

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

  if (verifyOnly !== true) {
    failure = "Start npm run demo and leave it running while you set the credentials.";
    // Always use the isolated demo. Never read an application or Atlas URI.
    await mongoose.connect(`mongodb://127.0.0.1:${demoDatabasePort}/${demoDatabaseName}?replicaSet=${demoReplicaSet}`, {
      serverSelectionTimeoutMS: 3000, autoCreate: false, autoIndex: false,
    });

    failure = "The demo administrator could not be updated. Check that the demo is initialized and that its Demo Administrator account can be uniquely identified.";
    await setDemoAdministrator({ email, password });
    console.log("Demo administrator saved.");
  }

  failure = `The demo login or dashboard could not be verified. Check that npm run demo is running at ${demoOrigin}.`;
  if (!(await verifyDemoLogin(demoOrigin, { email, password }))) {
    failure = "The demo rejected those credentials. Check the email and password, or run this command without -VerifyOnly to reset them.";
    throw new Error();
  }
  console.log(`Demo login and administrator dashboard verified. Sign in at ${demoOrigin}/staff`);
} catch (error) {
  console.error(error.code === 11000 ? "That email is already in use by another demo staff member." : failure);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
