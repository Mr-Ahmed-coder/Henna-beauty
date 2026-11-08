# MongoDB Atlas preparation

The running application selects its database through `MONGODB_URI`. Development reads the ignored `server/.env` or uses the managed loopback replica set. Production reads its injected environment. The Atlas readiness check uses a separate URI so the development server continues to use the local database.

## Connectivity check

1. Create a database user for the intended Atlas database and allow the application's connecting IP in Atlas. Use the [Atlas connection instructions](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/).
2. Put the URI in an ignored `server/.env.atlas` file or inject it into the shell environment as `ATLAS_MONGODB_URI`. Include the intended database name. Keep the actual URI in private configuration.

   ```dotenv
   ATLAS_MONGODB_URI=mongodb+srv://<database-user>:<encoded-password>@<cluster>.mongodb.net/<database>
   ```

3. From the repository root, run:

   ```powershell
   node --env-file=server/.env.atlas server/scripts/check-atlas.js
   ```

   With an injected environment variable, run `node server/scripts/check-atlas.js`. The probe checks connectivity, writable replica-set or mongos topology, and a snapshot read inside an aborted transaction. It does not print connection details. If it fails at connection, check the hostname, IP allowlist, credentials, and database user scope. If it fails during the transaction, check the deployment's transaction support and the user's access to the named database. This read-only check does not establish write permissions or approve a cutover.

## Source and inventory

The inspected local source is `salon_dev` on the loopback `salon-dev` replica set at port 27027. Keep the original `server/.local/mongodb` files as the rollback source. The initial inventory before demo configuration changes was:

| Collection | Records | Contents |
| --- | ---: | --- |
| services | 3 | Service catalogue, prices, activation |
| staffs | 2 | Staff and artist accounts, roles, password hashes |
| artistprofiles | 1 | Service qualifications and breaks |
| schedules | 0 | Artist working shifts |
| settings | 1 | Business hours, timezone, currency, contact settings |
| appointments | 9 | Appointments and historical snapshots |
| queuetickets | 2 | Queue history and visit snapshots |
| queuedays | 1 | Daily queue numbering |
| notifications | 4 | Visit notifications |
| bookinglocks | 1 | Booking transaction coordination |
| bookingpolicies, queuepolicies | 0 each | Policy overrides, with defaults when empty |
| sessions | 0 | Staff sessions and TTL index |

Preserve IDs, document types, and indexes, including the unique and partial indexes used by booking and queue operations. Archives contain private customer and staff data. Keep them in restricted local storage and share only through an approved secure channel.

## Approval and cutover

Use [MongoDB Database Tools](https://www.mongodb.com/docs/database-tools/installation/) for a BSON archive and restore rehearsal. Keep the archive and its verification manifest together. Before the approved migration, pause application writes and create a fresh archive of the confirmed source. Restore it into a disposable local database to compare collection counts, document contents, and indexes. Use the fresh archive for cutover so changes made since the demo backup are included.

Confirm the source database, Atlas project and cluster, destination database name, and migration window with the owner. Inspect the destination for existing data. A nonempty destination requires a separate merge or replacement decision. After approval, restore into the confirmed empty destination and verify the records and indexes before switching `MONGODB_URI`. Have staff sign in again at cutover. Test booking and queue transactions and retain the original local source and backup for rollback.
