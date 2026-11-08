# Client demo

Run `npm run demo` from the repository root, then open [the demo](http://127.0.0.2:5180). On the first run, have the existing local MongoDB replica set available on port 27027. If needed, start it in a separate terminal with `npm run dev:db -w server`. The demo copies the three service definitions and currency on first setup. Subsequent runs reuse the demo catalogue and records.

The site displays a **DEMO** notice on public and staff pages. Use fictitious customer details. The `salon_demo` database runs on its own `salon-demo` replica set at port 27028 and stores its data in `server/.local/demo/mongodb`. The web address uses a different loopback host from the regular app to keep its staff cookies separate.

## Choose your demo login

1. Leave `npm run demo` running. In a second PowerShell window at the repository root, run `.\server\scripts\demo-admin.ps1`.
2. Enter your chosen email and a demo-only password of 12–128 characters. The password and confirmation prompts are masked. The script creates the demo administrator on first setup or updates the uniquely identified **Demo Administrator** in place and clears its sessions. Other staff accounts are preserved. Run it again if you forget the demo credentials.
3. Wait for **Demo login and administrator dashboard verified**, then open [demo staff sign-in](http://127.0.0.2:5180/staff) and enter the same credentials. Look for the **DEMO** banner. The regular development portal on port 5173 uses a separate database.

To privately check an existing password without resetting it, run `.\server\scripts\demo-admin.ps1 -VerifyOnly`. This checks the live demo login, dashboard, appointments, and services. It then signs out and verifies that the session has ended.

## Walk through the demo

1. Open **Services** and book a service with **Demo Henna Artist**. Pick a Tuesday through Saturday and a time within 10:00 AM–5:00 PM Central. Appointment lead time and conflict checks still apply.
2. Open **Appointments** to find and manage the booking. During demo hours, use **Queue** → **Register walk-in**. Walk-in intake follows the existing queue policy, available time, and closing cutoff.

## Atlas preparation

The local demo launcher keeps using its dedicated loopback database. For a hosted demo, inspect the exact Atlas `salon_demo` destination and obtain approval before seeding. Reuse the existing demo seeder with the three service definitions. The seeder uses a setup marker to avoid duplicates and refuses to seed an unrecognized populated database. Keep local appointments, queue tickets, staff credentials, and backups out of the hosted demo.

For the hosted administrator, use a database user with `readWrite` scoped to `salon_demo`. In the ignored `server/.env.atlas-demo` file, set `ATLAS_DEMO_CLUSTER` to the approved Atlas cluster hostname and `ATLAS_DEMO_MONGODB_URI` to the corresponding demo URI ending in `/salon_demo` before any query parameters. Use the Atlas standard connection string if the local Node resolver cannot look up Atlas SRV records. Once the approved demo has been seeded, run `.\server\scripts\demo-admin.ps1 -Atlas` in PowerShell. Enter your chosen demo email and password privately at the masked prompts. The script checks the demo marker and uses the existing password hashing and session invalidation.

Set Render's `MONGODB_URI` privately to the same demo-only database. Follow the [Render backend runbook](DEPLOYMENT.md#render-backend) for the outbound allowlist, readiness checks, and API verification. The Render web service serves the API. Staff browser access requires a frontend on the same HTTPS origin.
