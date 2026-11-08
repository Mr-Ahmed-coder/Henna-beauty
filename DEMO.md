# Client demo

Run `npm run demo` from the repository root, then open [the demo](http://127.0.0.2:5180). On the first run, have the existing local MongoDB replica set available on port 27027. If needed, start it in a separate terminal with `npm run dev:db -w server`. The demo copies the three service definitions and currency on first setup. Subsequent runs reuse the demo catalogue and records.

The site displays a **DEMO** notice on public and staff pages. Use fictitious customer details. The `salon_demo` database runs on its own `salon-demo` replica set at port 27028 and stores its data in `server/.local/demo/mongodb`. The web address uses a different loopback host from the regular app to keep its staff cookies separate.

## Choose your demo login

1. Leave `npm run demo` running. In a second PowerShell window at the repository root, run `.\server\scripts\demo-admin.ps1`.
2. Enter your chosen email and a demo-only password of 12–128 characters. The password and confirmation prompts are masked. The script creates the demo administrator on first setup or updates the uniquely identified **Demo Administrator** in place and clears its sessions. Other staff accounts are preserved. Run it again if you forget the demo credentials.
3. Wait for **Demo login and administrator dashboard verified**, then open [demo staff sign-in](http://127.0.0.2:5180/staff) and enter the same credentials. Look for the **DEMO** banner. The regular development portal on port 5173 uses a separate database.

To privately check an existing password without resetting it, run `.\server\scripts\demo-admin.ps1 -VerifyOnly`. This checks the live demo login and dashboard, then closes the verification session.

## Walk through the demo

1. Open **Services** and book a service with **Demo Henna Artist**. Pick a Tuesday through Saturday and a time within 10:00 AM–5:00 PM Central. Appointment lead time and conflict checks still apply.
2. Open **Appointments** to find and manage the booking. During demo hours, use **Queue** → **Register walk-in**. Walk-in intake follows the existing queue policy, available time, and closing cutoff.

## Atlas preparation

The demo launcher uses the dedicated local database. For a future Atlas demo, confirm a separate, empty `salon_demo` database and a database user scoped to it. Put its URI in the ignored Atlas configuration and use the read-only transaction check in [the Atlas runbook](ATLAS-MIGRATION.md). Once the destination is approved, use the runbook's cutover procedure with a verified archive from port 27028 and database `salon_demo`. Keep demo and business credentials and databases separate.
