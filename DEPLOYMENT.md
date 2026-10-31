# Production preparation — Phase 7

Readiness: **Ready with Conditions**. Local API integration and build checks do not constitute deployment approval. No hosting, remote, production database migration, or external messaging was activated.

## Required environment and topology

Use a supported Node.js LTS release satisfying `>=22.12.0` and the committed lockfile. Build with `npm ci`, `npm run lint`, `npm run test`, and `npm run build`. The frontend artifact is `client/dist`; serve it with a production static host, with React routes falling back to `index.html`. Never use the Vite development/preview server as the production server.

Serve frontend and `/api` under the **same HTTPS origin**. The frontend uses relative API paths and staff sessions use SameSite=Strict cookies. Forward `/api/*` unchanged to the Node API; never send unknown API routes to the SPA fallback. Configure the static server with HTTPS, no-referrer policy, content-type protection, and a tested CSP compatible with the existing Google Fonts, imagery, styles, and same-origin API calls. Do not cache private API responses. Serve hashed assets with long-lived caching and revalidate `index.html`.

Inject values from `server/.env.production.example` into a secret manager or protected server environment. It is a template, not a working credentials file. Production does not load the local development `.env`; exclude all live/local environment files from release artifacts.

| Variable | Production requirement |
| --- | --- |
| `NODE_ENV` | `production` enables Secure, HttpOnly, SameSite=Strict `__Host-salon_session` cookies |
| `MONGODB_URI` | Dedicated authenticated Atlas/hosted replica-set database; never expose via `VITE_*`, source code, logs, or build artifacts |
| `CLIENT_ORIGIN` | Exact HTTPS frontend origin, no path/trailing slash/wildcard; comma-separated only if needed |
| `PORT` | API listener port, default 5000 |
| `HOST` | Default `127.0.0.1` behind a local proxy; use `0.0.0.0`/`::` only if required by a container platform, with network restrictions |
| `TRUST_PROXY_HOPS` | Default 0; set the exact trusted hop count (0–5) only after validating proxy topology |
| `SMS_*`, `WHATSAPP_*` | Disabled; reserved adapter configuration only. Credentials alone cannot send messages |

The production process rejects missing database/origin configuration, non-HTTPS origins, invalid ports/proxy counts, and non-ready standalone MongoDB. `npm start` starts the Express API from the repository root. It does not serve the static frontend. Use a process supervisor with restart policy, environment injection, log rotation, and graceful termination. The minute-based notification processor runs inside the API process; ensure the service remains running rather than scaling to zero.

At the trusted edge, replace/sanitize forwarded headers and prevent bypass access to the API. A wrong trust-proxy setting can cause rate limits to group all users under one IP or trust spoofed client addresses. Verify this in staging. Limits currently use process-local memory: use one API instance initially and enforce additional distributed limits at the trusted edge before adding replicas. The database transaction lock protects booking correctness across instances, but it does not make rate limits distributed. Login is limited to 10 requests/15 minutes/IP; public creation to 20/hour/IP, with separate general API limits. Shared NAT customers can hit these limits. Phone numbers are not verified identity; assess abuse traffic before public launch. Do not enable a public development server.

## Hosted MongoDB and initial administration

Use a writable MongoDB replica set or supported sharded cluster with transaction support, TLS, authentication, and network restrictions to the API. Keep staging and production databases/users separate. Grant the application only its required database access (including creating its collections/indexes during setup); do not use cluster administrator credentials. Ensure `hello`/`ping` and majority transactions work with the chosen provider. Back up before first launch. Model initialization builds required unique indexes; review existing data for duplicate staff emails, booking references, active queue phone hashes, and schedules before approving launch against an existing database. No migration is provided or executed here.

Create the initial owner through `npm run bootstrap -w server` using `ADMIN_NAME`, `ADMIN_EMAIL`, and a private `ADMIN_PASSWORD` supplied temporarily through a secret manager or hidden interactive shell entry. Never paste the password into a tracked file, terminal command history, ticket, or report. Remove the bootstrap password environment value immediately afterward. Login is `/admin`. There is no public staff registration.

Owner recovery uses the existing `npm run reset-bootstrap -w server` command with `ADMIN_RESET_CONFIRM=RESET-INITIAL-ADMIN` and temporary administrator values. This changes the bootstrap account and invalidates its sessions. Restrict shell/secret-store access and obtain account-owner authorization before using it. Store recovery instructions securely.

Configure real services/prices, active staff, qualifications, weekly shifts/breaks, hours, timezone, appointment policies, and queue arrival/grace rules through the existing owner interface. Approve placeholder website business copy/contact details and official branding before public launch; the public website still intentionally contains preview information. Admin contact settings do not automatically replace static public About/Contact copy.

## Health and monitoring

`GET /api/health` is process liveness and reports database connection state. `GET /api/ready` returns 200 only after pinging a writable replica set/sharded cluster, otherwise 503. Readiness does not certify that salon hours, qualifications, or business content have been configured. Alert on readiness failures, API error/429 rates, database storage/backup failures, and stalled/Failed notification records. Collect timestamps and operational errors without logging request bodies, phone numbers, notes, cookies, private visit fragments, or access-token headers. Keep API and edge clocks synchronized.

The automated production smoke test starts the actual server entry point against an isolated replica set and verifies health/readiness, production cookie attributes, login/logout, malformed/oversized bodies, and limits. It uses an HTTP loopback client to inspect cookie headers; real browser HTTPS/proxy behavior still needs staging verification.

## Backup and recovery

Enable encrypted provider snapshots/point-in-time recovery for the entire salon database, with restricted access, retention and restore objectives approved by the owner. Confirm that settings, staff/password hashes, sessions, appointments, locks, queue counters/tickets, qualifications, and notification records are all included. Store database credentials and encryption keys separately. Backups contain customer information even though visit tokens are hashed.

Before launch and periodically thereafter, restore a backup into an **isolated** database with external delivery disabled and no production traffic. Verify indexes, document counts, owner login, private visit access using test-owned links, appointment/queue conflicts, and report totals. Record elapsed restore time and the recovery point. Never test a restore over the live database. For manual database tooling, pass secrets through a protected config file/secret mechanism, not command-line credentials.

For an actual recovery: obtain approval; stop writes and the notification worker; preserve a backup of the current state; restore the approved recovery point; validate before routing traffic; invalidate restored staff sessions; reconcile bookings/tickets created after that point with the salon. Restored notification state can reissue notices, so review pending delivery records before enabling any future external adapter. Restart and verify readiness and business configuration. Code rollback uses the prior verified build and compatible database schema; never reset or delete salon data to roll back code.

## Notifications pending activation

In-app notices are available only through private tracking pages, with 10-second updates while open. They are not push alerts and cannot call a customer whose browser is closed. SMS/WhatsApp need an approved provider adapter, securely provisioned credentials/sender identity, consent/preference handling, provider idempotency keyed by notification dedupe key, webhook verification, delivery receipt mapping, retry/failure monitoring, and staging tests before activation. External records currently remain Deferred. No real external delivery has been tested or sent.

## Launch checklist — requires owner approval

- [ ] Accept or remediate the remaining development-only audit findings; rerun audits with current advisories.
- [ ] Complete the desktop/tablet/mobile, keyboard, and HTTPS/proxy checklist in `QA.md` using staging and disposable records.
- [ ] Approve real salon business content, prices, timezone/hours, policies, privacy notice, and customer-data retention/access policy.
- [ ] Provision authenticated hosted replica set, restricted network access, secrets, encrypted backups, and tested restore.
- [ ] Verify production environment, same-origin API routing, static SPA fallback, security headers, and proxy rate limiting.
- [ ] Bootstrap owner privately; configure least-privilege staff and all availability prerequisites.
- [ ] Run `npm ci`, lint, tests, build, audit and the staging smoke workflows; check health/readiness and logs.
- [ ] Keep SMS/WhatsApp disabled unless separately approved and verified.
- [ ] Capture backup/recovery point, exact release commit, artifacts and rollback plan.
- [ ] Obtain explicit approval before deploying, changing hosting/remotes, or migrating production data.
