# Henna & Beauty Salon — Phase 2

A local MERN foundation for a single salon. React, Vite, Tailwind CSS, React Router, Express, and Mongoose. No deployment has been configured.

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

The appointment and queue entry points remain informational placeholders. Phase 3 requires explicit approval.

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
