# Henna & Beauty Salon — Minnesota localization

The current market is Minnesota’s Somali community. Business defaults are USD and `America/Chicago`; the November 2, 2026 localization verification and legacy-data handling are documented below under Task 06B. Earlier phase notes remain as historical implementation records.

Production preparation and launch conditions are in [DEPLOYMENT.md](DEPLOYMENT.md). The security review, automated coverage, and pending desktop/tablet/mobile manual checklist are in [QA.md](QA.md). Readiness is **Ready with Conditions**; no deployment, production migration, or Git remote change has been performed.

Start the API with `npm start` from the repository root. Production requires injected `NODE_ENV=production`, `MONGODB_URI`, and an exact HTTPS `CLIENT_ORIGIN`; see the credential-free `server/.env.production.example`. Production deliberately does not load the local development `.env`. Serve the compiled frontend separately under the same HTTPS origin as `/api`.

A local MERN foundation for a single salon. React, Vite, Tailwind CSS, React Router, Express, and Mongoose. No deployment has been configured.

Phase 3 adds live appointment booking at `/appointments` and appointment management under `/admin`. Booking requires MongoDB running as a replica set; setup and permissions are described below. The earlier phase sections record the foundation and its verification at that time.

Phase 4 activates `/queue` for private online tickets and adds a combined online/walk-in queue in `/admin`. Phase 5 adds private in-app visit notifications and appointment tracking updates. Queue operations use the same MongoDB replica set and transaction lock as appointments. Payments and deployment are not configured.

## Run locally

Use Node.js 22.12+ (Node 24 recommended) and npm 10+.

```powershell
npm ci
Copy-Item server/.env.example server/.env
npm run dev
```

Frontend: http://127.0.0.1:5173. API health: http://127.0.0.1:5000/api/health. Booking readiness: http://127.0.0.1:5000/api/ready. Both servers bind to loopback for local development. Stop with Ctrl+C.

You can also start each workspace separately with `npm run dev -w client` and `npm run dev -w server`. The Vite development server proxies `/api` requests to port 5000. If changing the backend port, update the proxy in `client/vite.config.js` too.

## MongoDB Atlas configuration

`npm run dev` now provides a persistent, loopback-only development replica set automatically when `MONGODB_URI` is unset or is the default value in `.env.example`. It listens only on `127.0.0.1:27027`, stores development data in ignored `server/.local/mongodb`, and uses replica-set name `salon-dev`; booking and queue transactions therefore work locally. The data survives normal development restarts. `npm run dev:db -w server` runs just that local database when needed.

To use Atlas or an existing replica set instead, set `MONGODB_URI` in the ignored `server/.env` to its connection string, including a database name, for example `mongodb+srv://<user>:<encoded-password>@<cluster>/salon`. Replace placeholders locally. Configure an Atlas database user and network access for your development IP. Never put this URI in client code or a `VITE_` variable. Supplying another URI skips the local launcher.

`/api/health` exposes the general database connection state; `/api/ready` returns HTTP 200 only when the connected database can support booking/queue transactions and HTTP 503 otherwise. Direct `npm run start -w server` with no URI remains public-site-only and reports `not-configured`. When a URI is supplied, startup requires a successful connection; startup failures omit connection credentials from logs. Live Atlas connectivity requires your own credentials and has not been verified.

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

Phase 3 replaces the appointment placeholder with booking; Phase 4 replaces the queue placeholder with the hybrid queue described below. Phase 5 requires explicit approval.

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

Use `npm run dev` for the default local replica set, or set `MONGODB_URI` to Atlas/an existing MongoDB. Data persists in the selected database. No production data or staff accounts are seeded automatically. With no database, public pages and health continue to work; administration returns 503.

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

The command rejects repeat setup and uses a fixed unique database ID to prevent competing first-run creation. The initial administrator cannot be deleted, disabled, or demoted through the API. Admins can change its name, email, and password. Staff password or account changes invalidate that staff member's sessions. Editing your own account requires a fresh login.

If the initial local administrator already exists but its password was never safely handed over, an owner with local filesystem/database access can choose a new name, email, and password with this confirmation-gated recovery command. It is not an HTTP endpoint, does not print the password, and invalidates existing administrator sessions:

```powershell
$env:ADMIN_NAME = Read-Host 'Administrator name'
$env:ADMIN_EMAIL = Read-Host 'Administrator email'
$adminSecret = Read-Host 'New password (12–128 characters)' -AsSecureString
try {
  $env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $adminSecret).Password
  $env:ADMIN_RESET_CONFIRM = 'RESET-INITIAL-ADMIN'
  npm run reset-bootstrap -w server
} finally {
  Remove-Item Env:ADMIN_PASSWORD,Env:ADMIN_NAME,Env:ADMIN_EMAIL,Env:ADMIN_RESET_CONFIRM -ErrorAction SilentlyContinue
  $adminSecret.Dispose()
}
```

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

`npm run dev` starts a persistent local single-node replica set by default. If you prefer to manage MongoDB yourself, start it with `mongod --replSet rs0 --bind_ip 127.0.0.1 --dbpath <your-existing-local-data-directory>`, run `rs.initiate()` once in `mongosh`, and use `MONGODB_URI=mongodb://127.0.0.1:27017/salon?replicaSet=rs0` in the ignored `server/.env`. This is local setup only; no hosting or deployment configuration is supplied. The integration tests provision and remove their own isolated replica set automatically and never read your salon database URI.

### Prepare real availability

1. In `/admin`, create active services with a category, optional description/image URL, price, and duration; configure business hours, currency, and the salon's IANA timezone; then create active Artist accounts with weekly shifts.
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
| `GET/POST /api/admin/appointments`                                          | Protected staff list/search/filter/pagination or manual creation; `?today=1` limits the list to the salon’s current day |
| `PATCH /api/admin/appointments/:reference`                                  | Protected status, reschedule, and reassignment operations                                           |
| `GET/PUT /api/admin/booking-policy`                                         | Rules; writes require Admin                                                                         |
| `GET /api/admin/artist-profiles`, `PUT /api/admin/artist-profiles/:staffId` | Qualifications and recurring breaks; writes require Admin                                           |

Models are in `server/src/models/booking.js`; availability/transactions in `server/src/booking/engine.js`; new APIs in `server/src/routes/booking.js`; customer forms/management in `client/src/booking/`; admin appointments in `client/src/admin/AppointmentAdmin.jsx`. The booking router is mounted after existing staff-authentication and CSRF middleware. New scoped styles preserve the existing palette and public layout. Appointment entry-point copy was updated to reflect live booking; the queue page and queue functionality remain unchanged.

### Verification

Run `npm run lint`, `npm run test`, and `npm run build`. Phase 1/2 regression tests remain, alongside real replica-set booking integration tests for successful creation, database reconnect/API restart persistence, qualified artists and different service durations, breaks/hours/notice constraints, concurrent overlap conflicts and reschedule-versus-create races, cancellation rules, private-token access, authorization, search, approval, lifecycle transitions, daylight-saving repeated hours and spring gaps. Browser checks cover customer confirmation and refresh, mobile rescheduling, manual staff creation and status updates, booking-rule/profile saves, and responsive layouts at 1440 × 900 and 390 × 844. All browser records are disposable test data.

Added runtime dependency in Phase 3: Luxon for timezone calculations. Atlas remained unverified without credentials. No remote, deployment, notification integration, or virtual queue was added in Phase 3. Phase 4 queue behavior is described below.

Final Phase 3 checks: lint and production build pass; all 10 reported tests pass. The production dependency audit (`npm audit --omit=dev`) reports zero vulnerabilities. The earlier development-tool audit findings are recorded in the Phase 2 notes. Browser verification also confirmed Pending approval status, inline cancellation, the cancelled slot becoming available again, and saving qualification/break profiles without horizontal overflow.

Implementation references: [MongoDB transaction/write-conflict behavior](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/), [Mongoose transactions](https://mongoosejs.com/docs/transactions.html), and [Luxon timezone APIs](https://moment.github.io/luxon/api-docs/).

## Phase 4: hybrid virtual queue

### Setup and customer tickets

Use the same replica-set setup described in Phase 3. Active salon services, business hours, Artist qualifications, weekly shifts, and breaks must be configured first. Queue availability comes from the existing booking engine; there are no invented time slots or database fallbacks. No new dependencies or deployment settings were added.

Customers open `/queue`, choose a service, and enter their name, international phone number including `+` and country code, and optional notes. An online entry starts as **Waiting**. Reception can use **Queue → Register walk-in** to create a physically present customer as **Checked In**. Both sources share one daily sequence and the same eligibility rules. No customer account is required.

Each entry receives a daily number such as Q001, a unique random reference, and a separate 256-bit access token. Save the complete private link at `/queue/ticket#reference=…&token=…`. The token is stored only as a hash in MongoDB and is supplied through `X-Queue-Token`, never a query parameter. The reference alone cannot reveal a ticket. Customers can view only their own ticket and cancel it before service starts. The public catalog exposes active services and waiting counts, never names, phone numbers, or a customer list. Authorized staff see the combined queue; Artists see only tickets assigned to them.

Phone formatting is normalized before hashing. A partial unique database index permits only one active ticket per international phone number, across online and walk-in sources. The shared transaction lock also serializes concurrent registrations. Cancelled, Completed, and Missed tickets release this constraint; a new entry goes to the back of the queue. The phone number is an identifier for duplicate prevention, not identity verification or a way to retrieve a private ticket. No private token recovery or notification system is provided.

### Reception workflow and fair assignment

1. Watch the combined board, or register an arriving walk-in.
2. Choose any eligible Artist or a specific Artist, then **Call next eligible customer**. The server considers tickets in daily join order and calls the oldest ticket that can fit that Artist's current availability. An older ticket requiring an unavailable qualification or a longer free interval can be skipped while another eligible customer is served. Checking in does not change join order.
3. For online customers who arrive, select **Check in customer**. An online customer can also check in before being called. Customer pages cannot self-certify physical arrival.
4. Start a Called, physically checked-in customer only when the full service still fits. Complete the service when finished. Reception can cancel active tickets. Missed deadlines are applied automatically; the staff missed-turn action is accepted only after the deadline.

Admin and Receptionist roles can register walk-ins, call/check in customers, and start/complete/cancel tickets. Artists can only start or complete their own assigned tickets. Only Admins edit queue rules. The existing staff session, CSRF protection, authentication, and other staff-management permissions are reused without role changes.

### Arrival rules, hours, and status transitions

Defaults in **Queue → Queue rules**:

- Queue enabled, with online entries allowed.
- Remote arrival window: 20 minutes after being called.
- Arrival/start grace period: 5 minutes.
- Stop new entries 30 minutes before salon closing.
- Maximum 100 active tickets for the salon's current local date (configurable up to 200).

Entries are accepted only while the salon is open, before the cutoff, below the active-ticket cap, and when a qualified Artist has some remaining interval for the service plus call buffer. The entry limit and a possible remaining interval do not guarantee service before closing; if the forecast cannot fit the ticket, the view explicitly shows no reliable estimate. Waiting customers should keep their private page open. Queue creation and deadlines use the salon's configured IANA timezone and real server time; customers cannot submit a date or clock override.

An online customer not yet checked in gets an arrival/start deadline of call time + remote arrival window + grace. A checked-in customer gets call time + grace. Service must start before that deadline. Calling reserves the Artist for the full arrival/grace buffer plus the service duration, so a remote customer is not invited into an unprotected gap before an appointment. This conservative hold uses Artist capacity while the customer travels; configure the arrival window accordingly. Early check-in preserves the original deadline, and starting service replaces the hold with the actual start plus the saved service duration. Policy edits do not rewrite existing call deadlines.

| Current status                 | Allowed next status / operation                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| Waiting                        | Checked In, Called, Cancelled; Missed at closing/day rollover                                     |
| Checked In                     | Called, Cancelled; Missed at closing/day rollover                                                 |
| Called                         | Record physical check-in without changing status; In Service, Cancelled, or Missed after deadline |
| In Service                     | Completed, or Cancelled by Admin/Receptionist                                                     |
| Completed / Cancelled / Missed | Terminal; no reopening                                                                            |

Called tickets expire at their arrival/start deadline; Waiting, Checked In, and Called tickets expire at closing or the next salon day. Expiry is committed on the next queue read/action, and regular polling normally applies it within one refresh cycle. No background notification worker is required. An in-progress service is never silently expired at closing: it continues to occupy its Artist until staff completes or cancels it. Previous-day in-progress work remains visible on reception's board.

### Appointment safety and wait estimates

The queue calls the existing `availability()` service with internal immediate-service/notice/duration options. The default appointment-booking behavior remains intact. Eligibility therefore uses the same active services, staff roles, qualifications, shifts, salon hours, breaks, and appointment intervals. Pending and confirmed reservations retain their protected intervals, as do the other blocking appointment statuses from Phase 3.

Queue calls, queue service starts, cancellations, completions, and appointment mutations share the same salon transaction lock and majority-committed MongoDB transactions. Called and In Service queue holds are included in appointment availability, so a new or rescheduled booking cannot overlap them. An appointment cannot enter In Service while its Artist still has an active queue assignment. Queue starts are revalidated immediately, including conflicts and current qualifications. A currently In Service appointment prevents immediate queue assignment to that Artist, even if staff started it early. No confirmed appointment is moved, cancelled, or shortened by the queue.

Actual services can take longer than their configured duration. Overdue work is flagged and the Artist cannot be double-assigned; reception must finish or release that work before another service can start. The system cannot physically guarantee that an overrun finishes before an existing appointment, and it does not silently alter that appointment. Overdue queue work conservatively blocks new availability until resolved.

Waiting positions count Waiting and Checked In customers in join order. Approximate waiting times estimate when a ticket could be called, not when the service will be completed. The forecast simulates earlier waiting tickets against qualified Artist gaps, appointments, breaks, arrival buffers, and current work; it does not reserve those forecast times. Different services may become eligible in a different order. No-fit or overdue cases show no reliable estimate instead of a fabricated duration.

Forecasts use five-minute simulation steps to keep polling inexpensive; immediate assignment and service-start checks use the exact server instant. Ordinary queue reads do not take the booking write lock unless a ticket needs to expire.

Customer and staff queue views poll automatically every 10 seconds using separate, cancellable requests, so changes appear across devices without a shared browser session. Errors are shown explicitly and any previously displayed data is identified as stale. Staff-side mutations refresh the board immediately. Queue API responses are `no-store`, and public requests have per-process limits of 180/minute and 20 new tickets/hour. These limits are suitable for the current single-process setup; the shared database lock and unique indexes enforce correctness across API instances.

### Queue API and files

| Endpoint                                    | Purpose                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| `GET /api/queue/catalog`                    | Public active services, today's local date, rules, entry status, waiting count |
| `POST /api/queue/tickets`                   | Online join with service, customerName, international phone, optional notes    |
| `GET /api/queue/tickets/:reference`         | Private ticket, position, estimate, status; requires `X-Queue-Token`           |
| `PATCH /api/queue/tickets/:reference`       | Customer `action: cancel`; requires private token                              |
| `GET /api/admin/queue`                      | Authorized combined daily board (Artists: assigned tickets only)               |
| `POST /api/admin/queue/tickets`             | Register and check in a physical walk-in                                       |
| `POST /api/admin/queue/call-next`           | Assign oldest eligible customer; optional Artist ID                            |
| `PATCH /api/admin/queue/tickets/:reference` | `check-in`, `start`, `complete`, `cancel`, or `missed`                         |
| `GET/PUT /api/admin/queue-policy`           | Read rules; writes require Admin                                               |

Source: `server/src/models/queue.js`, `server/src/queue/engine.js`, `server/src/routes/queue.js`, `client/src/queue/`, `client/src/admin/QueueAdmin.jsx`, and `server/test/queue.test.js`. Existing routing/model initialization gained queue mounts; the shared availability engine gained queue occupancy integration. Queue-related entry-point copy was activated in the existing public layout. Base public styles, authentication helpers, staff-management logic, and deployment settings remain unchanged.

### Phase 4 verification

`npm run lint`, `npm run test`, and `npm run build` pass. All 20 reported tests pass, including the Phase 1–3 regressions and real isolated MongoDB replica-set queue integration tests. Queue tests cover online/walk-in creation, normalized duplicate prevention, private access, ordering/estimates, qualification and break eligibility, protected appointments, concurrent calls across multiple Artists, appointment-versus-queue races, arrival/grace deadlines, missed turns, service lifecycle and overruns, operating hours/cutoff/closing, authorization, and API-restart/database-reconnect persistence. No Atlas integration is claimed.

Browser checks at 1440 × 900 and 390 × 844 verified online join, walk-in registration, two simultaneous Artist assignments, physical check-in, service start/completion, saving queue rules, private-ticket refresh, and automatic status synchronization between two independently loaded ticket views. Responsive pages fit without horizontal overflow. Preview data and credentials are disposable and are not seeded into the salon database. No SMS, WhatsApp, push notifications, payment processing, remote, deployment, or Phase 5 functionality was added.

Database references: [MongoDB partial unique indexes](https://www.mongodb.com/docs/manual/core/index-unique/) and [transaction/write-conflict behavior](https://www.mongodb.com/docs/v8.3/core/transactions-production-consideration/).

## Task 04D: service catalogue and daily workflow

The public Home and Services pages use the live database catalogue rather than the original illustrative cards. Administrators manage each service in **Manage salon → Services**, including category, optional description, optional `http`/`https` image URL, price in the existing smallest-currency-unit format, duration, and active status. Deactivating a service removes it from new booking and queue menus without altering saved appointments or tickets.

The customer menu shows actual configured prices/durations and routes an eligible service into booking. Active but unbookable services remain visible with a specific setup explanation: either no active Artist has the qualification, or no qualified Artist has a recurring shift overlapping salon hours. Queue choices additionally reflect live queue eligibility; no customer-facing availability is fabricated.

The three public entry points are **Book appointment**, **Join queue**, and **Track my visit**. Tracking accepts only a complete private appointment or ticket link and preserves the existing token-based privacy model.

`/admin` now opens on **Operations**, with today’s appointments, the live waiting queue, Artists with a shift today, configuration guidance, and direct actions to appointments, queue, services, staff, and schedules. The menu groups daily operations separately from salon management. Appointment and queue assignment decisions continue to be made by the existing scheduling engine at action time, including conflicts, breaks, and protected reservations.

## Phase 5: private notifications and customer tracking

Both private tracking pages refresh every 10 seconds. Appointment tracking shows current status, salon-local appointment time, arrival/check-in guidance, and a notification timeline. Queue tracking also shows customers ahead, current position, approximate wait, and call deadlines. Estimates use the existing queue forecast. Keep the full private link safe; access still requires its existing token header. No new public customer lookup is available.

In-app notices cover appointment requests/confirmation, rescheduling/cancellation, reminders, queue entry, approaching turns, reception calls, cancellations, and missed/expired tickets. Approaching-turn notices require a position in the first two waiting tickets and an actual forecast of at most 15 minutes. These notices are advisory; the live status and deadline remain authoritative.

Notifications are persisted in MongoDB with unique event/channel keys and delivery state. Booking/queue mutations write event records in their existing transaction. Confirmation schedules a reminder 24 hours before the visit (immediately for shorter-notice bookings). Rescheduling or cancellation cancels outstanding reminders; appointment progress also cancels unused reminders. The running API processes due notices once per minute and on tracking reads. Scheduled notices survive restarts. Failed attempts use exponential delays, up to three attempts; interrupted claims recover after five minutes. In-app Delivered means the notice is available in the private feed, not that the customer has read it. No browser push or background-device delivery is provided.

Customers can choose in-app updates at entry and change preferences on the private tracking page. Preferences default to in-app on and SMS/WhatsApp off; disabling a channel cancels its undelivered records. `PUT /api/booking/reservations/:reference/notification-preferences` and `PUT /api/queue/tickets/:reference/notification-preferences` accept boolean `inApp`, `sms`, and `whatsapp`, with the same private-token requirements and origin checks as the visit. Existing visit records are preserved; no bulk migration or sample business data is created.

External delivery remains inactive. Reserved provider/sender/API-key environment fields are documented in `server/.env.example`; keep credentials only in the ignored environment. `server/src/notification/providers.js` describes the future adapter configuration, and the notification processor accepts an injectable delivery adapter for testing. Setting credentials does not enable sending. Opted-in external records stay Deferred until a provider implementation and activation are approved. Future adapters must use the stored dedupe key as the provider idempotency key; no actual external message was sent in this phase.

Verification uses isolated MongoDB replica sets, including notification deduplication, preference opt-out, cancellation, retry recovery, provider unavailability, private access, and the existing booking/queue concurrency and persistence regressions. Run `npm run lint`, `npm run test`, and `npm run build`. Browser visual/responsive verification requires local browser access, which was disabled in this environment; responsive styles reuse the existing mobile breakpoints.

## Phase 6: operations, business reports, and salon settings

Phase 5 was verified at commit `d469664` before Phase 6 began. Operations now refreshes its appointment list and metrics every 10 seconds alongside the existing live queue. Counts include today's appointments, currently waiting tickets (Waiting, Checked In, Called), completed appointment and queue services, cancelled and no-show appointments, artist occupancy, and average queue wait. Artists see metrics limited to their own assigned visits and their own availability; Receptionists and Admins see salon-wide operations. Existing appointment and queue screens retain check-in, call-next, start, and completion actions.

Artist status is Available, Occupied, On break, or Off shift, based on current local business hours, weekly shifts, breaks, appointment intervals, ongoing services, and unexpired queue call holds. Available describes current occupancy only: qualification and the complete service interval are still validated by the existing assignment engine. Dashboard counts are not taken from the paginated appointment list. Requests are independent reads, so rapidly changing data can differ briefly between panels until the next refresh.

Only Admins can open **Manage salon → Reports** or `GET /api/admin/reports?period=daily|weekly|monthly&date=YYYY-MM-DD`. An omitted date uses today in the salon timezone. Weekly periods run Monday to Sunday; monthly periods use calendar months; the displayed end date is exclusive. Reports show current appointment/queue statuses, completed services, services ranked by appointment count (then queue count), staff visit counts and allocated minutes, and a daily queue-wait table. Service/artist names use saved visit snapshots, including historical or deactivated records. No customer contact information is returned by reports. No revenue is calculated because payments are not recorded.

Appointments belong to the period containing their scheduled start; queue tickets belong to their saved salon date. Completion counts are the current status of those visits, not a separate completion-date accounting report. Average queue wait is entry (`createdAt`) to actual service start (`startedAt`); it includes travel time for remote customers. Only nonnegative recorded intervals are included, and both sample counts and empty averages are displayed. Allocated minutes exclude cancelled, missed, and no-show visits and use saved service duration rather than measured work time. Reports do not infer historical event timing where no timestamp was recorded.

**Settings & hours** extends the existing editor with optional phone, email, and address fields. Existing appointment/cancellation/rescheduling policies remain under **Appointments → Booking rules** and queue/grace policies under **Queue → Queue rules**; settings includes shortcuts to those screens. Notification settings display the existing 24-hour reminder, tracking refresh, and inactive external-provider status. Customer notification preferences remain per private visit; no global delivery behavior was changed.

Settings writes remain Admin-only. Invalid contact fields, hours, or timezones are rejected. On replica sets, settings validation/save shares the existing booking transaction lock: changes that put future Pending, Confirmed, Checked In, or In Service appointments outside business hours are rejected with HTTP 409. Timezone changes are rejected while such future appointments exist. Hours/timezone changes are also rejected while queue visits are active. Resolve affected visits through the existing workflows before retrying. Contact-only edits remain possible during active visits. Existing appointments retain their saved times, timezone, price, currency, and duration; policy changes do not rewrite them. Initial settings retain standalone MongoDB support, but live booking and safe concurrent operation require the established replica set.

`GET /api/admin/operations-metrics` reuses staff authentication and scopes Artist metrics; reports and `GET /api/admin/notification-settings` require Admin. Existing staff roles and permissions are unchanged. Reporting source is `server/src/reporting.js`, settings validation is `server/src/business-settings.js`, and the new tests are `server/test/reporting.test.js`.

Verification: `npm run lint`, `npm run test`, and `npm run build`. Tests cover daily/weekly/monthly results, timezone/DST boundaries, empty samples, occupancy, permissions, settings persistence after reconnect, active queue protection, and future appointment preservation, alongside the Phase 1–5 regressions. Responsive styles use the existing palette and mobile breakpoints; report tables scroll within their panels. Browser visual verification remains unavailable because local browser access is disabled. No remote or deployment was created.

## Task 06B: Minnesota and Somali beauty branding — November 2, 2026

Public Home/About/Contact copy now identifies Minnesota’s Somali community without inventing a city, address, phone, founder, staff identity, or customer endorsement. The generic external hero photograph was replaced with a locally bundled, original SVG illustration of modest hijab styling and decorative henna. Its visible caption identifies it as artwork, not staff or salon work. The original vector is 4.3 KB, has fixed intrinsic dimensions and descriptive alternative text, and uses the established cream/plum/rose/gold palette. Its CC0 dedication and provenance are in `client/public/images/LICENSE.md`. It is not a licensed stock portrait or an actual Somali customer/staff photograph; owner-approved photography can replace it once usage/model permission is documented. Administrator-configured service photographs remain unchanged and require separate license approval. Catalogue images now lazy-load with asynchronous decoding.

US presentation uses shared `en-US` currency/date/time formatters. USD is stored in cents (`3000` → `$30.00`); legacy visit currency is always respected rather than relabeled. Booking slot labels use AM/PM plus CDT/CST where applicable, including both real instants of the repeated fall hour. Date inputs/API date keys retain their native ISO representation, while tracking and report date text uses US presentation. Reports still contain activity counts, not invented payment/revenue figures. New booking and queue phone inputs start with `+1 `, show a fictional US-format example, and allow replacing the prefix with another international country code. No salon contact number is implied.

### Existing configured database review and approved changes

The read-only `node server/scripts/localization-audit.js` inspection found one active development-example service priced at 25,000 UGX, eight saved UGX/Africa–Kampala appointments, and two active Checked In tickets dated October 31. The owner explicitly approved **$30** for Henna artistry. The service price was replaced with 3,000 cents and the business currency changed to USD in one transaction; no exchange-rate conversion was performed. The eight existing appointments retain their original price, currency, timezone and UTC times. Ticket price/time snapshots also retain their original values.

During normal browser verification of `/queue`, the existing day-rollover expiry rule automatically marked the two October 31 tickets Missed. They were not manually cancelled, deleted, or rebooked. After expiry, a fresh audit showed no active tickets and no future protected appointments. The normal business-settings safety check then accepted `America/Chicago`. Existing recurring shift/hour values were not rewritten; they now govern new availability in Minnesota time and should be reviewed by the owner for the actual operating schedule. Historical appointments remain labeled with their saved original timezone, rather than silently moving to Central time.

Current configured database: **USD, America/Chicago, Henna artistry $30.00**. No unconfirmed catalogue price remains in this one-service database. Eight legacy appointments still have their original UGX/timezone snapshots; review them with the owner before any separate correction of old records, especially old nonterminal statuses. No retroactive currency conversion or appointment rescheduling was authorized or performed. The salon name and official service description/contact details remain clearly marked examples until supplied.

These changes were applied only to the configured development database. Other environments must be audited independently. `server/scripts/localize-approved-price.js` requires an explicit service ID, expected old currency/price and approved USD price, and refuses changed or multi-service catalogues; it never touches appointments or queue snapshots. It is not a general automatic conversion tool. `server/scripts/localize-timezone.js --confirm-minnesota` uses the existing protected settings service and refuses unsafe active/future visits. Do not run either against production without a separately approved database change and backup. A second application of the old-price command is deliberately rejected.

### Verification

`npm run lint`, `npm run test` (29 tests), and `npm run build` passed. Tests cover explicit approved-price replacement, mismatch rollback, unchanged legacy appointment documents, US currency formatting, Chicago spring gaps/fall repeats, and all existing booking/queue/authentication/notification/reporting regressions. No scheduling engine or staff permission changes were made.

Browser access became available for this task. Checks at desktop 1440×900 and mobile 390×844 covered the new homepage artwork/copy, $30 catalogue and booking selection, `America/Chicago` booking/queue labels, US phone guidance, tracking entry/private-link empty states, and staff login. Checked pages did not overflow horizontally. Authenticated admin pages and populated private customer tracking were not browser-tested in this pass; shared formatting and backend access/persistence remain covered by tests. No new customer visits were created during these browser checks. Earlier QA documents’ browser limitations describe the previous Phase 7 review, not these newer localization checks. No remote, deployment, or hosting configuration was changed.
