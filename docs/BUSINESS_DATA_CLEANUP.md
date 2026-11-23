# Prepare for real inventory

This is a destructive, operator-approved reset. Both commands default to preview.
Nothing runs at startup/deployment. Previous dry runs did NOT delete any data.
Use the intended backend environment; keep the shop closed through both phases.

## Before execution

- Reconcile pending offline sales and unsettled payments. Stop every POS and its
  synchronization. Pause payments/webhooks and all background/external writers;
  maintenance intentionally leaves integrations running, so it is not sufficient.
- Create and verify an encrypted backup from the last 24 hours. Copy its record ID.
  The script checks completed/encrypted/non-deleted status, checksum and size.
- Enable Super Admin maintenance. Confirm the production Supabase project reference
  in its dashboard against the backend connection; the script requires an exact match.
- Explicitly set/verify `CLOUDINARY_UPLOAD_ROOT` and the existing Cloudinary
  configuration in the command environment. Do not expand the root to capture
  unrelated assets. The uploader's historical default is `10th-west-moto`, but purge
  requires an explicit value. A missing root selects no assets and blocks execution.
- Run `npm --prefix backend run security:verify-rls` and
  `npm --prefix backend run migrate:status` (status only; no migration is needed).

## 1. Preview and clean database

Run `npm --prefix backend run data:cleanup -- --dry-run`. Review every table count
and media candidate/manual-review entry. Then, ONLY after approving deletion:

```powershell
# Set these to values you independently verified. No credentials belong here.
$env:CLEANUP_PRODUCTION_PROJECT_REF='<verified Supabase project reference>'
$env:CLEANUP_VERIFIED_BACKUP_ID='<verified recent backup record ID>'
$env:CLOUDINARY_UPLOAD_ROOT='10th-west-moto' # verify this is the intended app root
$manifest = Join-Path $env:TEMP '10thwest-client-cleanup.cleanup-media.json'
$env:CONFIRM_PRODUCTION_BUSINESS_CLEANUP='DELETE_BUSINESS_DATA_KEEP_USERS'
npm --prefix backend run data:cleanup -- --execute --production --confirm=DELETE_BUSINESS_DATA_KEEP_USERS --backup-verified --writers-paused --pos-sync-stopped "--manifest=$manifest"
Remove-Item Env:CONFIRM_PRODUCTION_BUSINESS_CLEANUP
```

Choose a NEW manifest filename per run; existing files are never overwritten at
capture. It is saved before deletion, then authenticated with the backend-only
Cloudinary secret and marked `database_committed` only after COMMIT. Keep it safe.
A prepared/dry-run/tampered/other-project manifest cannot authorize media deletion.
If post-commit file finalization fails, the command explicitly reports that the DB
committed and was NOT rolled back. No media purge has run. Keep maintenance on;
recover/review the prepared manifest before any separate purge; do not hand-edit it.

Database deletion is one FK-ordered transaction with write locks, timeouts,
rollback on failure, full preserved-row fingerprints and core readiness checks.
No tables, schema, sequences, policies or user rows are modified/recreated.

Deleted: products/variants/images/listings, catalog categories/models, inventory,
orders/payments/shipments, returns/refunds, promotions/usage, POS snapshots/sales/
reserves, carts/wishlists/reviews/chat/support activity, business idempotency and
notifications/deliveries. All managed banners and announcements are old storefront
content and are cleared too. Policies and FAQ remain unchanged.

Preserved: all user/auth/password/OAuth/2FA/recovery/session/avatar data, addresses,
permissions, system/security settings, migrations/RLS, audit/security/error history,
backups, approved POS devices, shipping configuration, policies/FAQ, non-business
notifications/idempotency and manual credits. Nonzero user store-credit balances
block execution until explicitly reconciled; users are never silently modified.

## 2. Separate optional media purge

DB backups do not include Cloudinary file bytes. Export any needed media first;
external deletion is irreversible and cannot be rolled back with the database.
The purge uses only the captured references, never folder-wide search/deletion.
It accepts exact versioned delivery references in approved business paths inside
`CLOUDINARY_UPLOAD_ROOT`, verifies the current provider identity/version, then
[deletes by immutable asset ID](https://cloudinary.com/documentation/admin_api#delete_resources_by_asset_id).
Avatars, logos/system assets, retained references, other clouds/roots and ambiguous
IDs are excluded. Ambiguous references are reported for manual review, not guessed.
The authenticated local manifest retains sanitized public references for that review.

Preview AFTER DB cleanup, BEFORE importing new inventory:

```powershell
npm --prefix backend run data:purge-media -- --purge-media "--manifest=$manifest"
```

Then, ONLY after separately approving external deletion (same prerequisites):

```powershell
$env:CONFIRM_PRODUCTION_MEDIA_PURGE='PURGE_CAPTURED_BUSINESS_MEDIA'
npm --prefix backend run data:purge-media -- --purge-media --execute --production --confirm=PURGE_CAPTURED_BUSINESS_MEDIA --backup-verified --writers-paused --pos-sync-stopped "--manifest=$manifest"
Remove-Item Env:CONFIRM_PRODUCTION_MEDIA_PURGE
```

Every selected/deleted/preserved/manual-review/failed asset is reported. Provider
errors do not change or pretend to roll back the committed DB reset. Review failed
assets and rerun the same manifest; already absent assets are reported safely.
No backups, unrelated folders or Cloudinary accounts are purged. Orphaned assets
without captured references require independent manual ownership review.

## Before reopening

Rerun the DB dry run (target counts zero), RLS verification, migration status and
`/api/health` + `/api/ready` on the actual backend origin. Confirm existing password
and OAuth users still sign in and 2FA remains enforced. Product/order/report APIs
must be empty/zero. No production cleanup or purge was executed during development.
Import client inventory, synchronize fresh POS snapshots (old snapshots are invalid),
then resume integrations and end maintenance. Refresh existing browser tabs/caches.
