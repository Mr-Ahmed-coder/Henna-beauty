import mongoose from "mongoose";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Staff, Session } from "../src/models/index.js";
import { hashPassword, verifyPassword } from "../src/security.js";

const demoEnv = fileURLToPath(new URL("../.env.atlas-demo", import.meta.url));
if (!fs.existsSync(demoEnv)) {
  console.error("Missing server/.env.atlas-demo configuration.");
  process.exit(1);
}

const envContent = fs.readFileSync(demoEnv, "utf8");
const uriMatch = envContent.match(/ATLAS_DEMO_MONGODB_URI=(.*)/);
if (!uriMatch) {
  console.error("Missing ATLAS_DEMO_MONGODB_URI in server/.env.atlas-demo.");
  process.exit(1);
}
const uri = uriMatch[1].trim();

async function connect() {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,
    tls: true,
    tlsAllowInvalidCertificates: false,
    tlsAllowInvalidHostnames: false,
  });
}

const mode = process.argv[2];

if (mode === "--list") {
  try {
    await connect();
    const admins = await Staff.find({ role: "Admin", active: true })
      .select("_id name email role active bootstrap createdAt")
      .sort({ createdAt: 1 })
      .lean();
    console.log(JSON.stringify(admins));
  } catch (err) {
    console.error("Failed to list administrators:", err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
} else if (mode === "--update") {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  try {
    const { id, email, password } = JSON.parse(input);
    if (!id || !mongoose.isValidObjectId(id)) throw new Error("Invalid account ID");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error("Invalid email format");
    if (!password || password.length < 12 || password.length > 128) {
      throw new Error("Password must be between 12 and 128 characters");
    }

    await connect();
    const targetAdmin = await Staff.findById(id);
    if (!targetAdmin || targetAdmin.role !== "Admin" || !targetAdmin.active) {
      throw new Error("Selected account is not an active administrator");
    }

    const emailNormalized = email.trim().toLowerCase();
    const conflicting = await Staff.findOne({
      _id: { $ne: targetAdmin._id },
      email: emailNormalized,
    });
    if (conflicting) {
      throw new Error(`Email ${emailNormalized} is already used by staff member '${conflicting.name}'`);
    }

    const passwordHash = await hashPassword(password);

    await mongoose.connection.transaction(async (session) => {
      targetAdmin.email = emailNormalized;
      targetAdmin.passwordHash = passwordHash;
      await targetAdmin.save({ session });

      // If demosetup exists, update or verify adminId
      const demosetup = mongoose.connection.db.collection("demosetup");
      await demosetup.updateOne(
        { _id: "salon-demo-v1" },
        { $set: { adminId: targetAdmin._id }, $inc: { adminRevision: 1 } },
        { session }
      );

      // Invalidate all existing sessions for this staff member
      await Session.deleteMany({ staff: targetAdmin._id }, { session });
    });

    const verified = await Staff.findById(targetAdmin._id).select("+passwordHash");
    if (!verified || !(await verifyPassword(password, verified.passwordHash))) {
      throw new Error("Password verification failed after save");
    }

    console.log(JSON.stringify({
      success: true,
      id: String(targetAdmin._id),
      name: targetAdmin.name,
      email: emailNormalized,
    }));
  } catch (err) {
    console.error("Update failed:", err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
} else if (mode === "--verify-api") {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  try {
    const { email, password, apiUrl = "https://henna-beauty-demo-api.onrender.com" } = JSON.parse(input);
    const origin = apiUrl;

    console.log(`\nVerifying authentication against live backend: ${apiUrl}`);

    // 1. Verify invalid password rejected
    const badLoginRes = await fetch(`${apiUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ email, password: "IncorrectPassword123!" }),
    });
    if (badLoginRes.status !== 401) {
      throw new Error(`Expected 401 for wrong credentials, got ${badLoginRes.status}`);
    }
    console.log("✔ Rejection verified: Incorrect password returned HTTP 401.");

    // 2. Verify correct login
    const goodLoginRes = await fetch(`${apiUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ email, password }),
    });
    if (goodLoginRes.status !== 200) {
      const errBody = await goodLoginRes.text();
      throw new Error(`Login failed with HTTP ${goodLoginRes.status}: ${errBody}`);
    }

    const setCookie = goodLoginRes.headers.get("set-cookie") || goodLoginRes.headers.get("Set-Cookie");
    const cookieHeader = setCookie?.split(";")[0];
    const data = await goodLoginRes.json();

    if (!data.staff || data.staff.role !== "Admin") {
      throw new Error("Logged in user does not have Administrator role");
    }
    if (!data.csrf) throw new Error("Missing CSRF token from login response");
    console.log(`✔ Login verified: Authenticated as '${data.staff.name}' (${data.staff.email}), Role: ${data.staff.role}.`);

    // 3. Verify authenticated /auth/me
    const meRes = await fetch(`${apiUrl}/api/admin/auth/me`, {
      headers: { Cookie: cookieHeader, Origin: origin },
    });
    if (meRes.status !== 200) {
      throw new Error(`/auth/me returned HTTP ${meRes.status}`);
    }
    console.log("✔ Session verified: Cookie session authenticated /api/admin/auth/me.");

    // 4. Verify operations dashboard access
    const metricsRes = await fetch(`${apiUrl}/api/admin/operations-metrics`, {
      headers: { Cookie: cookieHeader, Origin: origin },
    });
    if (metricsRes.status !== 200) {
      throw new Error(`operations-metrics returned HTTP ${metricsRes.status}`);
    }
    const metrics = await metricsRes.json();
    console.log(`✔ Dashboard verified: Retrieved operations metrics (Today's visits: ${metrics.todayVisits ?? 0}, Waiting: ${metrics.waitingCount ?? 0}).`);

    // 5. Clean logout
    const logoutRes = await fetch(`${apiUrl}/api/admin/auth/logout`, {
      method: "POST",
      headers: {
        Cookie: cookieHeader,
        Origin: origin,
        "X-CSRF-Token": data.csrf,
        "Content-Type": "application/json",
      },
    });
    if (logoutRes.status === 200) {
      console.log("✔ Logout verified: Verification session closed cleanly.");
    }

    console.log("\nAll live authentication checks passed successfully!");
  } catch (err) {
    console.error("API verification error:", err.message);
    process.exit(1);
  }
} else {
  console.error("Usage: node restore-admin.js [--list | --update | --verify-api]");
  process.exit(1);
}
