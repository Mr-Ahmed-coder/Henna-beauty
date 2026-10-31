# Phase 7 quality assurance record

Automated checks run against isolated MongoDB instances/replica sets. They do not change salon development or production records. Tests execute API workflows rather than driving a browser. Browser access was disabled in this environment; desktop, tablet, mobile, screen-reader, and real HTTPS/proxy tests below remain **unexecuted**.

## Automated coverage

Final full suite: 27 tests passed, zero failures. Lint and production build passed. Production startup is additionally checked with the real Node entry point; tests use disposable databases only.

- Staff bootstrap/recovery, hashed passwords, role restrictions, CSRF/origin checks, secure session cookie attributes, logout invalidation, protected APIs and private token access.
- Live services, active/qualified artists, shifts/breaks, business hours, timezone/DST, duration/notice rules and real availability.
- Public appointment creation, receptionist approval/management/rescheduling, artist lifecycle completion, cancellation, concurrent booking and reschedule collisions, and persistence across API restart/reconnect.
- Online/walk-in tickets, fair eligible ordering, duplicate phone prevention, simultaneous artists, protected appointments, call/start/complete/expiry, missed turns, restart and cross-device API synchronization.
- Notification deduplication, preferences, private feeds, reminder cancellation/retries, disabled external providers.
- Daily/weekly/monthly reports, completed appointment/queue activity reflected after lifecycle actions, waiting samples, permissions, artist occupancy and protected settings persistence.
- Actual production entry-point startup with isolated replica set, readiness, origin validation, secure cookie headers, malformed/oversized request handling and request limits.

## Confirmed defects fixed in Phase 7

- Production previously started without explicit database/origin configuration, and allowed a non-transaction-capable database. Production startup now rejects these states; host and trusted proxy hop count are explicit.
- JSON parse errors could reflect parser details instead of a stable validation response. Malformed and oversized bodies now return generic 400/413 responses.
- Walk-in selections incorrectly inherited the longer remote-arrival buffer when disabling catalogue options near closing. A separate flag now uses existing walk-in availability rules; scheduling decisions remain in the established engine.
- Appointment tracking could retain a reschedule form after a staff cancellation and show a loading label after a polling failure. Rendering now reflects current status/error.

## Dependency/security review

Audit on 2026-10-31: full `npm audit` reports **six moderate, zero high/critical** findings in the development ESLint chain. One minimatch advisory propagates through eslint, @eslint/config-array, @eslint/eslintrc, @eslint-community/eslint-utils and eslint-plugin-react-refresh. Installed minimatch is 3.1.5; the advisory reports versions below 11.0.1. npm reports no compatible automatic fix. Forcing minimatch 11 over dependencies expecting version 3 would be an incompatible change, so no override or forced upgrade was applied. Use trusted source/glob inputs in CI, and revisit upstream compatibility before accepting arbitrary repositories. Advisory: https://github.com/advisories/GHSA-g3hv-75wg-m249.

`npm audit --omit=dev` reports **zero vulnerabilities**. No tracked live environment/credential file was found; only safe example configuration is included. Sessions use hashed random tokens with HttpOnly/Secure production cookies, strict SameSite and CSRF checks; customer links use separate random tokens stored as hashes. API responses are no-store and reports return aggregates rather than customer details. API limits are per-process; deployment needs a verified trusted proxy and edge limits. External delivery remains disabled. These checks do not replace an independent penetration test.

## Manual browser checklist — pending

Use disposable staging data and separate Admin, Receptionist, Artist and anonymous browser profiles. Record device/browser, viewport, expected/actual result, screenshot and date for each check. Suggested viewports: desktop 1440×900, tablet 768×1024, mobile 390×844 and narrow mobile 320×720. Also test landscape and 200% zoom.

1. Visit Home/Services/About/Contact; open/close mobile navigation and all three customer actions. Confirm no page-wide horizontal overflow, clipped labels, unreadable contrast, missing images/fonts or unexpected console/network errors.
2. With keyboard only, use skip navigation, menu, labelled inputs, slot selection, confirmation and cancellation controls. Check visible focus, logical tab order, touch targets, screen-reader status/error announcements, reduced-motion behavior and reflow at zoom. Report tables may scroll inside their panels.
3. Book a database-backed service with any/specific qualified artist. Verify unavailable dates/slots, validation, loading/retry states, accurate salon-local time and confirmation. Save the complete private link; refresh and reopen in a separate browser session. A reference or wrong token must not reveal details. Keep links out of shared screenshots.
4. Login as receptionist, find the appointment, confirm if required, reschedule/reassign, physically check in. Login as the assigned artist, start/complete the visit; verify other artists and anonymous users cannot perform unauthorized operations. Use a current/past test appointment for completion. Confirm the owner report reflects the completed service.
5. Join online queue and register a walk-in from reception; check duplicate rejection, customers ahead/wait estimate, call notifications and cross-device 10-second synchronization. Check in, start and complete. Exercise remote deadline expiry, cancellation and no-fit-before-closing states. Verify an eligible late walk-in remains selectable when the remote buffer cannot fit.
6. Race two customer browser bookings for the same slot and race an appointment against a queue assignment. One conflicting operation must fail clearly; no artist may have overlapping commitments. Repeat with multiple qualified artists.
7. Cancel and reschedule test appointments. Verify private details/status, changed availability and notification feed after refresh; outdated reminders must not remain pending. Toggle in-app preferences and verify persistence. Do not expect SMS/WhatsApp or closed-browser alerts.
8. Review all dashboard metrics and daily/weekly/monthly owner reports against test records, including empty periods, cancelled/no-show visits and missing waiting samples. Receptionists/Artists must not access owner reports.
9. Change owner contact settings and reload. Attempt conflicting business hours/timezone changes with existing future appointments/active tickets; expect a clear rejection and unchanged records. Verify appointment/queue policy editor access by role.
10. On staging HTTPS through the actual proxy, verify __Host Secure/HttpOnly/SameSite cookies, login/refresh/logout, expiry, CSRF rejection, private-page no-store/referrer headers, API 404 routing and correct client-IP limits. Never simulate load or abuse against live customer traffic.

Readiness assessment: **Ready with Conditions** — automated local verification must pass; remaining development audit risk requires acceptance/remediation, and manual staging UI/HTTPS verification, real business configuration and backup/restore proof are launch conditions. See `DEPLOYMENT.md`.
