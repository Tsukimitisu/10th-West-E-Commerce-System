# Prepare for real inventory

This is a one-time, destructive data reset, separate from automatic cleanup.
It never runs at startup or deployment. Use the intended backend environment.

1. Review a read-only plan: `npm --prefix backend run data:cleanup`.
   It prints counts per table, users preserved, and any store-credit blocker.
   Unknown tables/dependencies or missing RLS stop the script for review.
2. Reconcile all pending offline sales and unsettled payments. Stop use of every
   POS computer until the reset/import is finished. Retained device approvals do
   not retain old catalogues: prepare a fresh snapshot after importing inventory.
3. Create and verify a fresh encrypted backup. Confirm the deletion counts.
   Enable Super Admin maintenance. Pause background/external writers, payment
   processing and POS synchronization for the reset window; maintenance alone
   intentionally does not stop these integrations. Do not clean a live shop.
4. Run `npm --prefix backend run migrations:verify` and
   `npm --prefix backend run security:verify-rls`.
5. Only when approved to delete the reviewed data, execute in PowerShell:

   ```powershell
   $env:CONFIRM_PRODUCTION_BUSINESS_CLEANUP='DELETE_BUSINESS_DATA_KEEP_USERS'
   npm --prefix backend run data:cleanup -- --execute --production --confirm=DELETE_BUSINESS_DATA_KEEP_USERS
   Remove-Item Env:CONFIRM_PRODUCTION_BUSINESS_CLEANUP
   ```

The script locks tables briefly, deletes children before parents in one
transaction, and rolls back if an error, preserved-row change, remaining target
row or schema/RLS change is detected. It never resets sequences, changes schema,
disables RLS, modifies users, or deletes cloud files/backups. A lock/statement
timeout fails safely; do not bypass its checks.

Deleted: catalog and inventory, sales/payments/returns/refunds, POS snapshots and
sales/reserves, carts/wishlists/reviews/chat/support activity, promotions/usage,
shipments, business idempotency and transactional notifications/deliveries.
Only order/return/refund store-credit ledger entries are targeted; nonzero user
balances block execution pending explicit reconciliation. Users remain identical.

Preserved: all accounts, password/OAuth/2FA/recovery/session data, addresses,
permissions, settings, migrations, security/audit/error history, backup records,
device approvals, shipping configuration, policies and managed site content.
Non-business notifications, idempotency and manual credits are preserved.

6. Rerun the dry run, RLS verification and `npm --prefix backend run migrate:status`.
   Target counts must be zero. The committed result must say preserved rows are
   unchanged and core readiness passed. Migration status must be unchanged.
7. Before reopening, use the actual backend origin (no credentials) to check:

   ```powershell
   Invoke-WebRequest "$env:BACKEND_ORIGIN/api/health" -UseBasicParsing
   Invoke-WebRequest "$env:BACKEND_ORIGIN/api/ready" -UseBasicParsing
   ```

   Confirm existing local-password and OAuth accounts still sign in and 2FA is
   still enforced. Import real inventory, then synchronize approved POS devices.
   Re-enable integrations and end maintenance only after these checks pass.
   A database rollback cannot recover deleted external files; this script leaves
   external storage untouched.
