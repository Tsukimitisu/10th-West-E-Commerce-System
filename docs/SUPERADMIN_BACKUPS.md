# Super Admin backups and settings

## Deployment prerequisites

This implementation is not activated by loading a React page. Deploy the backend and an external scheduler, provision private storage, supply secrets, and apply the backup migration. No shared-database dump, restore, storage creation/deletion or migration was run during development.

1. Use `backend/Dockerfile` for the API and the backup Cron Job. It includes Node 24 and PostgreSQL 18 client utilities. Confirm `pg_dump --version` in **both** deployed runtimes. A native Render Node service without PostgreSQL tools will fail closed. The local machine has no pg_dump; Docker Desktop's daemon is unavailable, so image build and a real staging backup remain deployment verification.
2. Provision a **private** Supabase Storage bucket, default `database-backups`, in the same project/environment. Do not add anon/authenticated bucket read/write policies. Only backend service credentials manage these objects. Set the bucket/plan upload limit above the expected compressed database size; upload-limit failures remain Failed. Keep the bucket name stable for historical backups.
3. Supply matching backend-only secrets/settings to the API and scheduler (never VITE variables):

```dotenv
DATABASE_URL=<existing application connection>
BACKUP_DATABASE_URL=<direct or session PostgreSQL URL for the SAME application database>
SUPABASE_URL=<existing project URL>
SUPABASE_SERVICE_ROLE_KEY=<backend service credential>
BACKUP_ENCRYPTION_KEY=<32 cryptographically random bytes encoded as 64 hex characters>
BACKUP_ENABLED=true
BACKUP_CRON=0 2 * * *
BACKUP_TIMEZONE=Asia/Manila
BACKUP_RETENTION_DAYS=30
BACKUP_STORAGE_BUCKET=database-backups
PG_DUMP_PATH=pg_dump
BACKUP_PGSSLROOTCERT=<optional CA file path when required by libpq TLS verification>
```

`BACKUP_DATABASE_URL` must use direct/session mode (Supabase port 5432), **not transaction pooling on port 6543**. PostgreSQL session advisory locks require that connection for their full lifetime. The application metadata pool may retain its existing connection method. Connection configuration checks the project/database against the existing application configuration. TLS follows the existing backend database policy; supply the provider CA for verified TLS, with `NODE_EXTRA_CA_CERTS` for Node and `BACKUP_PGSSLROOTCERT` for pg_dump where needed.

Store the encryption key separately in a durable secret manager. Losing it makes encrypted backups unrecoverable. Retain old keys when rotating: historical files remain encrypted under the key used at creation. Neither keys nor credentials are stored in backup metadata or printed by backup commands.

4. Apply `backend/migrations/202610180001_database_backups.cjs` in an isolated staging environment first, then through the controlled production migration process. It creates `backup_records` and `backup_scheduler` with RLS and no public/browser grants. The existing `202610170001_hero_carousel_metadata.cjs` is separate and remains unapplied in the configured shared database. Canonical `migrate:latest` runs the earlier carousel migration first; review that separate Owner deployment before using it. For a deliberately separate backup rollout, from `backend/` use `npx knex migrate:up 202610180001_database_backups.cjs --knexfile knexfile.cjs`; this does not apply carousel changes. Do not run migrations on every API request/startup.
5. Create the Cron Job from `render-backups.yaml` (a separate optional Blueprint; existing web/frontend services are not replaced). It executes `npm run backup:database` every 15 minutes. The service evaluates `BACKUP_CRON` in `BACKUP_TIMEZONE` and creates at most one successful automatic backup per due local date. Default target: **02:00 Asia/Manila**. Only a single daily hour/minute expression is supported. The frequent external tick supplies catch-up after missed invocations/restarts; only the latest due day is caught up, not fabricated historical snapshots. Ensure the same environment secrets are set on both API and Cron Job.

The scheduler persists a heartbeat. The UI reports not-observed/overdue after 45 minutes without one. `BACKUP_ENABLED=false` disables automatic jobs, while configured manual backups remain available. A missing scheduler is never represented as healthy merely because an environment flag is enabled. Alert on failed Render Cron runs and overdue status.

## Data, security and failure semantics

Backups use a compressed custom-format `pg_dump` of the application's **public schema**, including all tables, sequences, schema objects, users, orders, payment metadata, inventory, content and persistent audit data. Supabase-managed internal/auth/storage schemas and external media objects are not included. This is an application database snapshot, not a backup of object-storage media or deployment secrets. PostgreSQL supports custom archive format for selective recovery. [PostgreSQL pg_dump reference](https://www.postgresql.org/docs/current/app-pgdump.html)

Passwords are supplied via a temporary mode-0600 pgpass file, never command arguments. The child process uses an argument array, `shell:false`, ignored output, connection timeout and an abort signal. Files live in a dedicated mode-0700 temporary directory. The plaintext dump and password file are deleted after encryption; the directory is removed on success/failure. The generated encrypted object is uploaded to private durable storage before metadata can become Completed.

Files use AES-256-GCM with random 12-byte nonce and authenticated format header. Format: ASCII `10TWBK1`, nonce (12 bytes), ciphertext, authentication tag (16 bytes). SHA-256 covers the complete encrypted artifact. Only non-secret status/size/checksum/timestamps reach history APIs; internal object keys and service credentials do not. Private bucket state is checked before upload/download/delete. Authorized encrypted downloads use 60-second signed URLs. [Supabase private bucket access](https://supabase.com/docs/guides/storage/buckets/fundamentals)

`/api/admin/backups`, `/status`, `/:id/download` and DELETE `/:id` require the existing authentication middleware and current database role **super_admin**. Customer, Staff, Cashier and Owner do not gain access. Responses use `Cache-Control: no-store`. Manual creation returns 202 with Queued metadata, then runs asynchronously. API/cron share one service implementation and one session advisory lock, preventing concurrent dumps and deletion/retention races. Interrupted workers leave a non-completed record; the next lock-owning invocation marks it Failed. If PostgreSQL itself is unavailable, status cannot be persisted until it returns; the API/CLI never reports successful completion for that failure.

Retention removes artifacts older than the configured 1-3650 days after successful backups. The newest successful artifact is protected even if old. Metadata is tombstoned with deleted_at so history, audits and daily idempotency survive deletion. A retention error does not invalidate a newly uploaded snapshot and is audited as BACKUP_RETENTION_FAILED. Creation, failure, download and deletion reuse audit_logs; deletion intent is recorded before touching storage. An upload/metadata failure attempts removal of its private encrypted object; failed-record retention can retry removal later. Raw process/database/storage error text is not returned or logged.

## Recovery and staging acceptance

There is **no in-application Restore action**. Download the encrypted file as Super Admin, retain its SHA-256, and use an authorized workstation with the separately held key:

```powershell
npm --prefix backend run backup:decrypt -- --input C:\secure\snapshot.dump.enc --output C:\secure\verified.dump
```

The command authenticates GCM in a temporary file before publishing a new plaintext destination; it refuses overwrite. Use `pg_restore --list` to inspect the custom archive, then follow controlled recovery procedures into a new isolated database. Never test restoration against the live database. Keep plaintext files on protected storage and remove them after recovery validation.

Before production acceptance: build the supplied image, confirm the dump client supports the database major version, use an isolated database and private staging bucket, create a manual backup, verify ciphertext/checksum, download/decrypt, inspect/restore the archive into another isolated database, confirm expected application records, test failure handling, and invoke the scheduled CLI repeatedly to prove only one success per due date. Verify provider bucket policies, upload limits and scheduler alerts. The mock tests do not substitute for this provider/runtime staging check. Render's Cron Jobs use external scheduled executions; this implementation does not depend on an always-running web timer. [Render Cron Jobs](https://render.com/docs/cronjobs)

## Security / Configuration verification and limits

Security and Configuration now share accessible tabs with roving focus, Left/Right/Home/End keys, aria-selected and neutral hover/orange selection. The System-only sidebar/drawer uses near-black CSS; other roles' selectors are unchanged. System deep links now share the existing superseded-session-effect guard, preserving Staff/Owner behavior.

Security saves previously nested settings twice, and the backend's secret pattern treated legitimate password-policy names as secrets. The payload and allowlisted policy masking are fixed. Actual secrets remain masked/rejected, validation remains on the backend, and unavailable settings prevent saving defaults over real values. Advanced security settings endpoints require Super Admin; the existing Owner/admin configuration access remains for non-security categories.

Account Lockout, Password Rules and Two-Factor values now save/load through the existing settings database. **Existing authentication handlers still enforce their built-in lockout/password limits; stored global policy and 2FA-enforcement values are not connected to runtime enforcement.** This is disclosed in the UI; auth/RBAC architecture was not rewritten. Existing account-level 2FA remains functional. Login Monitor, OAuth/services and Suspicious Activity are existing read-only data views, with errors/unreported states shown instead of fabricated controls. Maintenance remains the existing read-only readiness interface; no new cleanup/maintenance automation is claimed.

Automated coverage uses mocked dump/storage/scheduler/database boundaries and real AES-GCM plus existing HTTP auth/RBAC middleware. Focused browser tests intercept all business APIs and cover settings persistence/errors, backup confirmation/progress/download/delete/failure, all target widths, System navigation/sign-out, and narrow Customer/Staff/Owner smoke checks. No shared business data or backup objects were changed.

## Verification and changed files

Frontend lint, 115 frontend tests, backend lint, 394 backend tests, production compile check (using the permitted public API placeholder), and read-only integrity audit passed. Eighteen focused backup/settings backend tests cover the requested failure/security cases. Nine focused browser checks passed (eight target/role-flow checks plus the rejected-request error check). UI screenshots were visually inspected at representative target widths. The existing Checkout duplicate aria-label build warning remains outside this diff. The mechanical design detector only reported existing conditional disabled-button color combinations; rendered states were verified. No unresolved Blocking findings remain in the focused diff review.

Changed files (34):

- `backend/.dockerignore`
- `backend/.env.example`
- `backend/Dockerfile`
- `backend/migrations/202610180001_database_backups.cjs`
- `backend/package-lock.json`
- `backend/package.json`
- `backend/scripts/backup-database.js`
- `backend/scripts/decrypt-backup.js`
- `backend/src/routes/admin.js`
- `backend/src/routes/backups.js`
- `backend/src/routes/backups.test.js`
- `backend/src/services/backupConfig.js`
- `backend/src/services/backupCrypto.js`
- `backend/src/services/backupRuntime.js`
- `backend/src/services/backupRuntime.test.js`
- `backend/src/services/backupScheduler.js`
- `backend/src/services/databaseBackups.js`
- `backend/src/services/databaseBackups.test.js`
- `docs/SUPERADMIN_BACKUPS.md`
- `frontend/App.jsx`
- `frontend/components/operations/OperationsShell.jsx`
- `frontend/components/operations/OperationsSidebar.jsx`
- `frontend/components/owner/Modal.jsx`
- `frontend/components/superadmin/AdminTabs.jsx`
- `frontend/components/superadmin/SuperAdminLayout.jsx`
- `frontend/e2e/superadmin-backups.spec.js`
- `frontend/e2e/superadminFixture.js`
- `frontend/pages/superadmin/BackupRecoveryView.jsx`
- `frontend/pages/superadmin/SuperAdminOverview.jsx`
- `frontend/pages/superadmin/SystemConfigView.jsx`
- `frontend/pages/superadmin/SystemSecurityView.jsx`
- `frontend/services/api.js`
- `frontend/styles/superadmin.css`
- `render-backups.yaml`
