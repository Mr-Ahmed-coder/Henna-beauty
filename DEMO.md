# Client demo

Run `npm run demo` from the repository root, then open [the demo](http://127.0.0.2:5180). On the first run, have the existing local MongoDB replica set available on port 27027. If needed, start it in a separate terminal with `npm run dev:db -w server`. The demo copies the three service definitions and currency on first setup. Subsequent runs reuse the demo catalogue and records.

The site displays a **DEMO** notice on public and staff pages. Use fictitious customer details. The `salon_demo` database runs on its own `salon-demo` replica set at port 27028 and stores its data in `server/.local/demo/mongodb`. The web address uses a different loopback host from the regular app to keep its staff cookies separate.

1. Open **Services** and book a service with **Demo Henna Artist**. Pick a Tuesday through Saturday and a time within 10:00 AM–5:00 PM Central. Appointment lead time and conflict checks still apply.
2. Open [staff sign-in](http://127.0.0.2:5180/staff) or use **Team Access**. Read the generated demo email and password from the ignored `server/.local/demo/admin-login.json` file on your machine. Keep that file private.
3. Open **Appointments** to find and manage the booking. During demo hours, use **Queue** → **Register walk-in**. Walk-in intake follows the existing queue policy, available time, and closing cutoff.

## Atlas preparation

The demo launcher uses the dedicated local database. For a future Atlas demo, confirm a separate, empty `salon_demo` database and a database user scoped to it. Put its URI in the ignored Atlas configuration and use the read-only transaction check in [the Atlas runbook](ATLAS-MIGRATION.md). Once the destination is approved, use the runbook's cutover procedure with a verified archive from port 27028 and database `salon_demo`. Keep demo and business credentials and databases separate.
