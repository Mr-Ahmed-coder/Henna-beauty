# Henna & Beauty Salon — Phase 3

A local MERN foundation for a single salon. React, Vite, Tailwind CSS, React Router, Express, and Mongoose. No deployment has been configured.

Phase 3 adds live appointment booking at `/appointments` and appointment management under `/admin`. Booking requires MongoDB running as a replica set; setup and permissions are described below. The earlier phase sections record the foundation and its verification at that time.

## Run locally

Use Node.js 22.12+ (Node 24 recommended) and npm 10+.

```powershell
npm ci
Copy-Item server/.env.example server/.env
npm run dev
```

Frontend: http://127.0.0.1:5173. API health: http://127.0.0.1:5000/api/health. Both servers bind to loopback for local development. Stop with Ctrl+C.

You can also start each workspace separately with `npm run dev -w client` and `npm run dev -w server`. The Vite development server proxies `/api` requests to port 5000. If changing the backend port, update the proxy in `client/vite.config.js` too.

## MongoDB Atlas configuration

Set `MONGODB_URI` in the ignored `server/.env` to your Atlas connection string, including a database name, for example `mongodb+srv://<user>:<encoded-password>@<cluster>/salon`. Replace placeholders locally. Configure an Atlas database user and network access for your development IP. Never put this URI in client code or a `VITE_` variable.

An empty URI intentionally starts the API without a database; health reports `not-configured`. When a URI is supplied, startup requires a successful connection and health reports its current state. Startup failures omit connection credentials from logs. Live Atlas connectivity requires your own credentials and has not been verified.

`PORT` defaults to 5000. `CLIENT_ORIGIN` is a comma-separated browser origin allowlist. No secrets are needed by the frontend. `.env` files are ignored; only the example is tracked.

## Structure

```text
client/
  src/
    components/       Shared layout, navigation, footer, cards, calls to action
    data/             Proposed service content
    pages/            Home, Services, About, Contact, coming-soon views
    App.jsx           Frontend routes and 404 page
    styles.css        Tailwind integration, theme, responsive styles
server/
  src/
    config/           Optional Atlas connection
    app.js            Express app, middleware, health, JSON errors
    index.js          Environment loading, startup, shutdown
  test/               API health and scope checks
```

## Checks

```powershell
npm run lint
npm test
npm run build
```

`npm run preview -w client` serves the production frontend build locally. A future production host must serve `client/dist` with an SPA fallback to `index.html` for direct route visits. Deployment is outside this phase.

## Phase boundaries and content

Home, Services, About, and Contact are navigable and responsive, with reusable components, keyboard focus styles, a skip link, mobile navigation, and reduced-motion support. `/appointments` and `/queue` explain that those features are unavailable. No booking, queue, authentication, payment, or personal-data submission endpoints exist.

All business identity, proposed services, hours, address, and contact details are placeholders or marked as awaiting confirmation. No invented testimonials or operational claims are included. Photographs are illustrative Unsplash images, not salon portfolio work; remote fonts are from Google Fonts. These require internet access. Replace them with approved brand assets and confirmed details before launch. Native font fallbacks are provided.

The queue entry point remains an informational placeholder. Phase 3 replaces the appointment placeholder with the booking flow described below. Phase 4 requires explicit approval.

## Phase 1 verification

Verified on 31 October 2026:

- `npm run lint`, `npm test`, and `npm run build` pass.
- Both development servers start; `/api/health` returns HTTP 200 with `status: ok` and `database: not-configured`.
- Browser checks at 1440 × 900 and 390 × 844: core pages fit without horizontal overflow; mobile navigation opens and navigates; appointment, queue, and 404 routes render correctly. All four homepage images load. No browser console errors were recorded.
- Atlas connection was not exercised because no credentials were provided.
- `npm audit` reports six moderate findings in the development lint dependency chain (minimatch glob amplification), with no automatic fix available. Avoid running lint against untrusted glob inputs. These findings should be reviewed when upgrading lint tooling; no forced major-version overrides were applied.
- No Git remote existed in the empty workspace. A local repository was initialized; pushing requires an authorized remote.

## Phase 2: staff administration

Visit `/admin` directly. Public pages and appointment/queue placeholders remain unchanged. Administration uses the same visual palette in a separate, scoped stylesheet. Public service cards remain illustrative; they are intentionally not connected to the new administration data in this phase.

### Database and initial administrator

Install and start your own local MongoDB, then set `MONGODB_URI=mongodb://127.0.0.1:27017/salon` in `server/.env`, or use an Atlas URI. Data persists in that database. No production data or staff accounts are seeded automatically. With no database, public pages and health continue to work; administration returns 503.

Set the initial administrator through local environment variables and the one-time command, never a public setup endpoint. In PowerShell:

```powershell
$env:ADMIN_NAME = Read-Host 'Administrator name'
$env:ADMIN_EMAIL = Read-Host 'Administrator email'
$adminSecret = Read-Host 'Password (12–128 characters)' -AsSecureString
try {
  $env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $adminSecret).Password
  npm run bootstrap -w server
} finally {
  Remove-Item Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:ADMIN_NAME -ErrorAction SilentlyContinue
  Remove-Item Env:ADMIN_EMAIL -ErrorAction SilentlyContinue
  $adminSecret.Dispose()
}
```

The command rejects repeat setup and uses a fixed unique database ID to prevent competing first-run creation. The initial administrator cannot be deleted, disabled, or demoted through the API. Admins can change its name, email, and password. There is no password-recovery endpoint; retain administrator credentials securely. Staff password or account changes invalidate that staff member's sessions. Editing your own account requires a fresh login.

### Permissions

| Resource                | Admin                                                   | Receptionist | Artist             |
| ----------------------- | ------------------------------------------------------- | ------------ | ------------------ |
| Staff                   | Create, read, update, delete (protected owner excluded) | Read         | Own account only   |
| Services                | Create, read, update, delete                            | Read         | Read               |
| Business hours/settings | Read and save singleton                                 | Read         | Read               |
| Weekly schedules        | Create, read, update, delete                            | Read         | Own schedules only |

Permissions are enforced by the API independently of the UI. No customer registration, appointments, queue, or payments are implemented.

### Models and API

`server/src/models/index.js` defines Staff (unique normalized email, password hash, role, active flag), Service (integer price in smallest currency units, 5–1440 minute duration), Schedule (one weekly shift per staff/day, availability flag), Settings (singleton business name, currency, IANA timezone, seven local opening-hour records), and Session (hashed random token, CSRF token, expiration with TTL index). Closed days and unavailable shifts remain stored explicitly. Overnight shifts are not supported. Availability is a weekly staff record, not a booking-slot calculation, and does not automatically change when business hours change.

All staff API routes are under `/api/admin`: `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`; `GET/POST /staff`, `/services`, `/schedules`, `PATCH/DELETE /staff/:id`, `/services/:id`, `/schedules/:id`; `GET/PUT /settings`. Settings are created or replaced through PUT and use closed-day flags rather than deleting the singleton. There is no public business-data API.

Passwords use salted asynchronous scrypt (N=32768, r=8, p=1). Sessions expire after eight hours; database checks enforce expiry immediately without waiting for MongoDB TTL cleanup. Cookies are HttpOnly and SameSite=Strict, with Secure and a `__Host-` name when `NODE_ENV=production`. No session token is stored in localStorage. Mutations require an allowlisted Origin, JSON content type, and a per-session CSRF header. Login is limited to 10 attempts per IP per 15 minutes per API process. Its limiter is intentionally process-local for this single-process local foundation; review shared rate limiting before any future multi-instance deployment. No deployment configuration has been added.

### Verification and dependencies

`npm run lint`, `npm run test`, and `npm run build` cover both phases. Integration tests start a disposable real MongoDB using `mongodb-memory-server`; the first run downloads a MongoDB binary and requires internet access. They never connect to `MONGODB_URI` and destroy their temporary database at completion. Tests cover login failure/success, hashed passwords, session cookies, CSRF/origin rejection, role enforcement including other artists' schedules, validation, duplicate records, protected initial admin, CRUD, persisted data and sessions after reconnect/restart, deactivation, cascade cleanup, logout, expiry, and login throttling. The Phase 1 health and out-of-scope endpoint regression test remains intact.

Added runtime dependency: `express-rate-limit`. Added test-only dependency: `mongodb-memory-server`. A fresh audit still reports the same six moderate findings through development-only ESLint/minimatch dependencies; `npm outdated` shows no compatible updates in the existing declared ranges. No forced major upgrades or incompatible minimatch overrides were applied. These findings remain documented for future tooling upgrades.

Changed areas: administration UI and route registration; server models, security, admin routes, bootstrap and startup; integration tests; environment example; dependency manifest/lockfile; README. Existing public page components, public styles, and deployment files were not modified.

Browser verification at 1440 × 900 and 390 × 844 covered staff login, service creation, mobile navigation, repeated business-hours saves, and the schedule editor. Admin views fit without horizontal overflow. The automated tests use a disposable database; no real salon accounts or business records were created. Atlas credentials and live Atlas connectivity remain unverified.

Security references: [Express security guidance](https://expressjs.com/advanced/best-practice-security/) and [Mongoose validation](https://mongoosejs.com/docs/validation.html).

## Phase 3: appointment booking

### Local database requirements

Appointments use MongoDB transactions. Atlas supports these, and local development needs a replica set rather than a standalone `mongod`. Existing staff administration continues to work on standalone MongoDB, but booking returns a clear 503 until transaction support is available. No booking data or availability is fabricated when the database is missing.

For a local single-node development replica set, start your installed MongoDB with `mongod --replSet rs0 --bind_ip 127.0.0.1 --dbpath <your-existing-local-data-directory>`, then run `rs.initiate()` once in `mongosh`. Use `MONGODB_URI=mongodb://127.0.0.1:27017/salon?replicaSet=rs0` in the ignored `server/.env`. Choose a data directory outside the source checkout. This is local setup only; no hosting or deployment configuration is supplied. The integration tests provision and remove their own isolated replica set automatically and never read your salon database URI.

### Prepare real availability

1. In `/admin`, create active services with prices and durations, configure business hours, currency, and the salon's IANA timezone, and create active Artist accounts with weekly shifts.
2. Open **Appointments → Booking configuration**. Assign the services each Artist is qualified to provide. Artists without qualifications or available shifts produce no slots. Add recurring weekday breaks using salon-local times. Changes to profiles do not alter staff login roles or credentials.
3. Review booking rules. Defaults: immediate confirmation, 60-minute minimum notice, 90-day booking horizon, 15-minute slot spacing, and customer cancellation/rescheduling enabled with 24 hours' notice. Admins can change these values or require approval. Pending requests occupy their reserved time until confirmed or cancelled; they do not expire automatically.
4. Customers can open `/appointments`, select a live service, a preferred Artist or any qualified available Artist, a date and time, enter name/phone/optional notes, review, and confirm. The selected Artist is shown in the final confirmation. Prices are snapshots in the configured currency's smallest units; no payment is processed.

Availability intersects the salon's open hours with weekly staff shifts, then excludes breaks and overlapping appointments. All calculations use the configured salon timezone; stored start/end values are UTC. Slot labels include the timezone offset, including distinct times during a repeated daylight-saving hour. Nonexistent spring-forward times are skipped. Closed days, unavailable shifts, inactive artists/services, insufficient notice, past dates/times, and dates beyond the horizon are rejected. Overnight shifts remain unsupported. There are no invented fallback slots.

### Privacy and changes

Each reservation has a random unique `HB-…` reference and a separate 256-bit access token. Only a SHA-256 hash of the token is stored. The confirmation provides a private management link with reference and token in the URL fragment; the token is sent to the API in `X-Booking-Token`, not a query string. Browser refresh reopens the saved reservation. The reference alone, customer name, or phone number cannot retrieve private details. Keep the link private: it grants access to customer details and permitted cancellation/rescheduling. No account, notification, token recovery, or notification integration is provided. For manual staff reservations, the private customer link is displayed once in the admin screen for secure sharing.

Customer changes use current salon policy and require a Pending or Confirmed reservation. The API enforces cancellation/rescheduling switches and notice periods. Admins and Receptionists can make changes outside customer notice restrictions, but cannot book past/unavailable times or bypass qualification/conflict checks. Rescheduling keeps the booked service, price, and duration; if the service has been removed, disabled, or its duration changed, cancel and create a new reservation. Menu/schedule/profile edits affect later availability checks and do not silently move or cancel existing reservations. Rescheduling uses current salon timezone settings.

Every appointment mutation first modifies one shared salon lock document inside a transaction, then checks availability and writes the reservation. Concurrent transactions conflict on that document and retry against a fresh snapshot. A failed reschedule leaves the original reservation intact; no time is released before the replacement commits. This serializes mutations for this single salon and works across API processes; it does not depend on an in-memory mutex. References have a unique database index. Transactions use snapshot reads and majority writes. Customer API responses are `no-store`; public booking requests have per-process IP rate limits (120 requests/minute and 20 creations/hour). As with login limits, a shared rate-limit store should be considered before any future multi-instance hosting.

### Staff appointment permissions and statuses

Admins and Receptionists can search reservations by literal reference/name/phone, filter status, page through results, create manual reservations, confirm/cancel, and reschedule/reassign to an available qualified Artist. Artists see only their own reservations and can update progress for their assigned appointments. Only Admins can edit booking rules, artist qualifications, and recurring breaks. The existing authentication, session, CSRF, and staff-management permissions are reused.

Allowed transitions:

| Current status                  | Next statuses                  |
| ------------------------------- | ------------------------------ |
| Pending                         | Confirmed, Cancelled           |
| Confirmed                       | Checked In, Cancelled, No-Show |
| Checked In                      | In Service, Cancelled          |
| In Service                      | Completed                      |
| Completed / Cancelled / No-Show | None (terminal)                |

Artists can only advance their own appointment to Checked In, In Service, Completed, or No-Show when that transition is valid. Completion and No-Show require the appointment start time to have passed. Cancelled and No-Show reservations release capacity; Pending, Confirmed, Checked In, In Service, and Completed records block their original interval. History records staff/customer status changes and rescheduling events.

### API and source map

| API                                                                         | Purpose                                                                                             |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `GET /api/booking/catalog`                                                  | Active services, public Artist names/qualifications, timezone, currency, booking rules              |
| `GET /api/booking/availability?service=…&date=YYYY-MM-DD&artist=…`          | Live slots; artist is optional                                                                      |
| `POST /api/booking/reservations`                                            | Reserve with `service`, optional `artist`, UTC `start`, `customerName`, `phone`, optional `notes`   |
| `GET /api/booking/reservations/:reference`                                  | Private details; requires `X-Booking-Token`                                                         |
| `PATCH /api/booking/reservations/:reference`                                | Customer `action: status, status: Cancelled` or `action: reschedule, start, artist`; requires token |
| `GET/POST /api/admin/appointments`                                          | Protected staff list/search/filter/pagination or manual creation                                    |
| `PATCH /api/admin/appointments/:reference`                                  | Protected status, reschedule, and reassignment operations                                           |
| `GET/PUT /api/admin/booking-policy`                                         | Rules; writes require Admin                                                                         |
| `GET /api/admin/artist-profiles`, `PUT /api/admin/artist-profiles/:staffId` | Qualifications and recurring breaks; writes require Admin                                           |

Models are in `server/src/models/booking.js`; availability/transactions in `server/src/booking/engine.js`; new APIs in `server/src/routes/booking.js`; customer forms/management in `client/src/booking/`; admin appointments in `client/src/admin/AppointmentAdmin.jsx`. The booking router is mounted after existing staff-authentication and CSRF middleware. New scoped styles preserve the existing palette and public layout. Appointment entry-point copy was updated to reflect live booking; the queue page and queue functionality remain unchanged.

### Verification

Run `npm run lint`, `npm run test`, and `npm run build`. Phase 1/2 regression tests remain, alongside real replica-set booking integration tests for successful creation, database reconnect/API restart persistence, qualified artists and different service durations, breaks/hours/notice constraints, concurrent overlap conflicts and reschedule-versus-create races, cancellation rules, private-token access, authorization, search, approval, lifecycle transitions, daylight-saving repeated hours and spring gaps. Browser checks cover customer confirmation and refresh, mobile rescheduling, manual staff creation and status updates, booking-rule/profile saves, and responsive layouts at 1440 × 900 and 390 × 844. All browser records are disposable test data.

Added runtime dependency: Luxon for timezone calculations. Atlas remains unverified without credentials. No remote, deployment, notification integration, or virtual queue was added. Phase 4 awaits approval.

Final Phase 3 checks: lint and production build pass; all 10 reported tests pass. The production dependency audit (`npm audit --omit=dev`) reports zero vulnerabilities. The earlier development-tool audit findings are recorded in the Phase 2 notes. Browser verification also confirmed Pending approval status, inline cancellation, the cancelled slot becoming available again, and saving qualification/break profiles without horizontal overflow.

Implementation references: [MongoDB transaction/write-conflict behavior](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/), [Mongoose transactions](https://mongoosejs.com/docs/transactions.html), and [Luxon timezone APIs](https://moment.github.io/luxon/api-docs/).
