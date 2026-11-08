# Atlas administrator recovery

Use the administrator's email to sign in at `/staff` on the application connected to the verified Atlas database. For example, the regular local app uses [http://127.0.0.1:5173/staff](http://127.0.0.1:5173/staff) when it is running and its server is configured to use that same Atlas database. The isolated demo has separate accounts.

## Inspect the target

1. Put the intended Atlas URI in the ignored `server/.env.atlas` file as `ATLAS_MONGODB_URI`. Include the exact application database name in the URI. Use the Atlas database user authorized for the intended database. Keep the URI out of Git, chat, command arguments, and logs.
2. In a private PowerShell window at the repository root, run:

   ```powershell
   .\server\scripts\recover-atlas-admin.ps1 -InspectOnly
   ```

   The check verifies connectivity and reads administrator counts in a snapshot transaction. It displays only the cluster hostname, database name, and account counts. Compare the target to the regular application's private `MONGODB_URI` or its approved configuration before proceeding. The recovery command never switches the application connection.

## Choose credentials privately

When the target is confirmed, run `.\server\scripts\recover-atlas-admin.ps1` in your own terminal. Type the exact verified cluster/database, choose the indicated operation, and enter your chosen email and password. Password input is masked. The password is passed directly to the Node process over stdin and hashed by the existing scrypt implementation.

- Use `reset` when there is exactly one active original administrator. It retains the account ID, name, and role. Credential changes and invalidation of that account's sessions commit together in one transaction. Choose a different password and an email that another staff account does not use.
- Use `bootstrap` only when inspection confirms there is no administrator or original administrator record, and you have confirmed that the database is the intended application database. Choose a display name as well. Bootstrap uses the existing deterministic account ID and unique email index. Resolve a pending migration before bootstrapping its destination.
- If administrators exist without a clear active original account, stop and review the account inventory with the owner. This recovery flow requires an unambiguous original account before resetting and an administrator-free database before bootstrapping.

Run recovery in a maintenance window with staff sign-ins paused so an in-flight login cannot overlap the session reset. The original account recovery requires the application's unique email index. A target confirmation mismatch, duplicate email, reused password, or unsupported account state prevents the recovery. The launcher reports failure stages without echoing credentials.

After recovery, sign in at the intended app's `/staff` page and open **Appointments**. Verify that the former credentials and previous sessions are rejected. Check the expected booking and business records against your pre-recovery inventory.
