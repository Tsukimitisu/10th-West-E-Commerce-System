# Offline POS — approved computers

The existing POS can use a local PIN to unlock cached
products and record **walk-in cash sales** during an outage. The PIN unlocks only
the local POS; it is not a server login. Manual GCash, provider payments,
promotions, server receipt voids and other workspaces require internet.

## Deployment and preparation

- Apply `202610210001_multi_device_offline_pos.cjs` after the already-applied
  `202610200004_offline_pos.cjs` through controlled migrations. Test on staging
  first. No production migration is performed by the application or tests.
  Deploy the updated backend on all instances before preparing additional laptops.
- Optional backend setting: `OFFLINE_POS_ACCESS_HOURS` (default 72; valid 1–168).
  The same validity bounds cached prices. An expired grant stops new offline
  sales, but never deletes receipts or pending transactions.
- Deploy the normal Vite build. A small build plugin produces a static-only
  service worker and install manifest. Existing Tailwind styling is cached from
  its exact public CDN URL; fonts, logo, fallback image and built app files are
  cached locally. No authenticated API response is cached by the worker.
- Use one browser/profile per approved computer, preferably an installed
  app. Keep its clock correct. Do not clear site data or use private browsing.
  Pending sales exist on this computer until the server acknowledges them;
  losing the computer/profile can lose unsynchronized records.
- Sign in freshly, open POS → **Offline POS setup**, choose a 6-digit PIN and
  prepare this computer. New computers require an Owner/Admin/Super Admin to
  sign in freshly and approve registration; staff with POS access can then prepare
  that same browser. Give each laptop a useful name. Preparation waits for the production app shell to be
  cached. Installation is optional if the browser does not offer it.
- An inventory manager can open **Inventory → Adjust stock → Offline POS
  reserve**, select the target computer and variant where applicable, and save a quantity. The same
  reserve controls are available to authorized managers in POS setup. Existing
  products default to zero reserve.
- Synchronize the catalogue after configuring reserves. Confirm the last-sync
  time and access-expiry time before disconnecting.

## Stock protection

Offline holds are included in the existing `reserved_stock` total, separately
tracked by device and product/variant. Consequently all existing online availability checks,
including POS and storefront checkout, exclude those protected units. Physical
`stock_quantity` changes only through the existing stock transaction path.

Example: 10 physical units, no other reservations, offline reserve 3 → 7 online
sellable units and 3 offline units. Offline sales decrement the local allowance
atomically. On sync the server consumes the hold and writes the normal POS sale.
Catalogue refresh replenishes the configured hold only from unreserved stock,
and subtracts still-pending local sales before making any allowance available.
Reducing an issued live allowance is blocked while physical sales may exist.

Multiple approved computers can remain registered simultaneously. Each browser
has its own PIN verifier, cached snapshot, stock allocation and pending sales.
Stock must be allocated separately: 10 physical units minus A=2, B=2 and shop=3
leaves 3 online units (before other reservations). Zero allocation means no offline
sales for that item on that computer. One laptop cannot consume another's hold.

In POS setup, **Registered Offline POS Devices** identifies **This computer**.
Owner/Admin/Super Admin can rename or revoke a selected laptop. Revocation affects
only that laptop and quarantines only its remaining protection. Other laptops
continue operating. It cannot instantly stop a disconnected computer: physically
stop using the revoked laptop and recover its pending receipts before stock review.
An inventory manager may release a revoked allocation to zero only after reviewing
physical stock and pending sales. Reauthorization preserves its device identity
but does not silently unquarantine stock.

The migration keeps all existing devices, snapshots, sales and reserve quantities.
Legacy reserves are assigned to the sole active laptop. If ownership is ambiguous,
they remain unassigned, quarantined and included in reserved_stock. Inventory
managers can select **Unassigned legacy protection**, explicitly review pending
sales/physical stock, and release it to zero before allocating stock to a device.
Never clear IndexedDB or copy a browser profile/device UUID to another laptop.
Rollback refuses multi-device or ambiguous protected state; reconcile first.

## During an outage

Enter the Offline POS PIN after reopening the app. Search, scan or type a barcode,
SKU or part number. Sell only available reserved quantities. Cash receipt shows
**OFFLINE SALE / Pending synchronization** and an `OFF-POS-…` number. IndexedDB
saves the immutable UUID, sale, receipt and allowance decrement together before
the cart clears. Five wrong PINs cause a five-minute local cooldown. Passwords,
PIN plaintext, cookies and provider credentials are never stored in this data.

When the backend becomes reachable, pending sales synchronize one at a time.
If signed out, sign in and return to POS; the queue survives. Each retry uses the
original UUID as the existing Idempotency-Key. A permanent server ledger also
prevents duplication after the normal idempotency cache expires or cashier
changes. Successful records retain their original local receipt and server
receipt link. New app versions never delete IndexedDB or force a mid-sale reload.

**Needs attention** records stay saved and do not retry repeatedly. An owner can
review the physical sale, correct inventory/reserve through normal authorized
controls, then use **Retry after stock review**. This is not a force-accept action:
server prices, device, allowance and stock checks still apply. Do not enter a
second sale to resolve an uncertain one. An uncertain online payment must be
confirmed online before switching that cart to offline cash.

## Non-technical staging UAT (no production inventory)

1. Sign in freshly as an owner on staging laptop A; prepare Offline POS and choose its own PIN.
   Repeat on laptop B without revoking A. Confirm both remain Active.
2. Allocate test product/variant stock separately to A and B. Confirm total protected
   stock never exceeds physical stock and both snapshots show only their allocations.
   Synchronize each laptop, then install/open POS.
3. Disconnect Wi-Fi/Ethernet; confirm **Offline mode** and the last-sync time.
4. Scan/search the test item. Confirm GCash and promotions are unavailable.
5. Complete a cash sale; print/view the pending offline receipt.
6. Close and reopen POS while disconnected; enter the PIN. Confirm the sale is
   still pending in Recent sales and the remaining allowance decreased.
7. Complete separate cash sales on both laptops. Restore internet together; sign in if requested. Confirm automatic synchronization
   (or choose Sync now), one order, one inventory deduction, and a server receipt
   linked to the same local transaction.
8. Verify allowance exhaustion, variant lookup, expired access, denied local
   PIN/cooldown, and that other workspaces cannot be opened through offline unlock.
9. On staging, simulate an inventory/product conflict; verify Needs attention
   preserves the receipt and owner-reviewed retry never duplicates the sale.
10. Revoke A; confirm only A is quarantined and B can still prepare and sync.
11. Check normal online cash, manual GCash, promotion, receipt/void, daily summary,
    barcode camera/USB scanner, and replacement-device quarantine using staging
    data. Confirm both desktop and phone layouts.

Automated tests mock the backend/provider operations. Real migration constraints,
physical scanners/printers, browser installation/storage persistence and the
complete outage/restart/reconnect sequence must still be checked on staging and
then on each approved shop computer using an approved non-production sale.

Migration/transaction tests use test-only PGlite (isolated PostgreSQL in memory),
not a production connection. Existing dependencies are unchanged.
